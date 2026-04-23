#!/usr/bin/env node
/**
 * cli.ts — Interactive CLI for cli-doc-ai
 *
 * Bun loads .env automatically from the current directory.
 * Supported modes:
 *   1. Document changes (git diff)
 *   2. Document a specific file
 *   3. Document the entire application
 *   4. Create release notes
 */

import fs from 'fs';
import path from 'path';
import * as p from '@clack/prompts';
import chalk from 'chalk';

import { callAI, DEFAULT_MODEL, type OpenRouterOptions, type PRContext } from './core/openrouter.js';
import { collectGitContext, getRepoName } from './core/git.js';
import { detectVersion } from './core/version.js';
import { updateChangelog } from './core/changelog.js';
import {
  scanCodebase,
  scanSingleFile,
  formatSnapshotForPrompt,
} from './core/analyzer.js';
import {
  promptChanges,
  promptReleaseNotes,
  promptSingleFile,
  promptFullApp,
} from './core/prompts.js';

// ─── Models ───────────────────────────────────────────────────────────────────

const MODELS = [
  { value: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (free)' },
  { value: 'meta-llama/llama-3.2-3b-instruct:free',  label: 'Llama 3.2 3B (free, faster)' },
  { value: 'google/gemma-3-27b-it:free',             label: 'Gemma 3 27B (free)' },
  { value: 'qwen/qwen3-coder:free',                  label: 'Qwen3 Coder (free)' },
  { value: 'anthropic/claude-3.5-sonnet',            label: 'Claude 3.5 Sonnet (paid)' },
  { value: 'openai/gpt-4o',                          label: 'GPT-4o (paid)' },
  { value: 'google/gemini-1.5-pro',                  label: 'Gemini 1.5 Pro (paid)' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function abort(value: unknown): asserts value is NonNullable<typeof value> {
  if (p.isCancel(value)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }
}

async function spin<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const s = p.spinner();
  s.start(label);
  try {
    const v = await fn();
    s.stop(label.replace(/\.\.\.$/,  ' done.'));
    return v;
  } catch (e) {
    s.stop(chalk.red('Failed.'));
    throw e;
  }
}

// ─── Step: resolve API key ────────────────────────────────────────────────────

async function resolveApiKey(): Promise<string> {
  const fromEnv = process.env['OPENROUTER_API_KEY']?.trim();
  if (fromEnv) {
    p.note(`Loaded from ${chalk.cyan('.env')} or environment`, 'OPENROUTER_API_KEY');
    return fromEnv;
  }

  const input = await p.text({
    message: 'OpenRouter API key',
    placeholder: 'sk-or-...',
    validate: (v) => (v.trim().length < 10 ? 'Enter a valid API key' : undefined),
  });
  abort(input);
  return (input as string).trim();
}

// ─── Step: resolve model ──────────────────────────────────────────────────────

async function resolveModel(): Promise<string> {
  const fromEnv = process.env['OPENROUTER_MODEL']?.trim();
  if (fromEnv) {
    p.note(`Using ${chalk.cyan(fromEnv)}`, 'Model');
    return fromEnv;
  }

  const choice = await p.select({
    message: 'Which model?',
    options: MODELS.map((m) => ({ value: m.value, label: m.label })),
    initialValue: DEFAULT_MODEL as string,
  });
  abort(choice);
  return choice as string;
}

// ─── Step: resolve working directory ─────────────────────────────────────────

async function resolveCwd(): Promise<string> {
  const input = await p.text({
    message: 'Repository path',
    placeholder: process.cwd(),
    defaultValue: process.cwd(),
  });
  abort(input);
  const cwd = path.resolve((input as string).trim() || process.cwd());
  process.chdir(cwd);
  return cwd;
}

// ─── Mode: document changes ───────────────────────────────────────────────────

async function modeChanges(opts: OpenRouterOptions, cwd: string): Promise<void> {
  const baseRef = await p.text({
    message: 'Base branch / SHA to compare against',
    placeholder: 'origin/main',
    defaultValue: 'origin/main',
  });
  abort(baseRef);

  const { gitCtx, repoName, version } = await spin('Collecting git context...', async () => ({
    gitCtx:   await collectGitContext(baseRef as string),
    repoName: await getRepoName(),
    version:  await detectVersion(cwd),
  }));

  p.note(
    `${chalk.bold('Repo:')} ${repoName}\n` +
    `${chalk.bold('Version:')} ${version}\n\n` +
    gitCtx.commits.split('\n').slice(0, 6).map((l) => `  ${l}`).join('\n'),
    'Changes found'
  );

  const prTitle = await p.text({
    message: 'Title for this entry',
    placeholder: 'feat: my changes',
    validate: (v) => (!v.trim() ? 'Required' : undefined),
  });
  abort(prTitle);

  const prAuthor = await p.text({
    message: 'Author username',
    defaultValue: 'unknown',
  });
  abort(prAuthor);

  const versionOverride = await p.text({
    message: `Version (detected: ${version})`,
    defaultValue: version,
  });
  abort(versionOverride);
  const finalVersion = (versionOverride as string).trim() || version;

  const changelogInput = await p.text({
    message: 'Save CHANGELOG to',
    defaultValue: 'CHANGELOG.md',
  });
  abort(changelogInput);
  const changelogPath = path.resolve(cwd, (changelogInput as string).trim() || 'CHANGELOG.md');

  const ctx: PRContext = {
    prNumber: 'manual', prTitle: prTitle as string, prAuthor: prAuthor as string,
    prUrl: '', version: finalVersion, repoName,
    commits: gitCtx.commits, diffStat: gitCtx.diffStat, diffContent: gitCtx.diffContent,
  };

  const summary = await spin('Generating summary...', () =>
    callAI(promptChanges(ctx), { ...opts, maxTokens: 1024 })
  );

  const date = new Date().toISOString().split('T')[0]!;
  p.note(`${chalk.bold(`## [${finalVersion}] - ${date}`)}\n\n${summary}`, 'Preview');

  const ok = await p.confirm({ message: `Write to ${chalk.cyan(changelogPath)}?` });
  abort(ok);
  if (!ok) { p.cancel('Nothing written.'); return; }

  updateChangelog(changelogPath, {
    version: finalVersion, date, prNumber: 'manual',
    prTitle: prTitle as string, prAuthor: prAuthor as string, prUrl: '', summary,
  });

  p.outro(chalk.green('Done! ') + chalk.cyan(changelogPath));
}

// ─── Mode: document single file ───────────────────────────────────────────────

async function modeFile(opts: OpenRouterOptions, cwd: string): Promise<void> {
  const filePath = await p.text({
    message: 'Path to the file',
    placeholder: 'src/index.ts',
    validate: (v) => {
      const full = path.resolve(cwd, v.trim());
      return !fs.existsSync(full) ? `File not found: ${full}` : undefined;
    },
  });
  abort(filePath);

  const fullPath = path.resolve(cwd, (filePath as string).trim());
  const repoName = await getRepoName();
  const file = scanSingleFile(fullPath, cwd);

  const outputPath = await p.text({
    message: 'Save documentation to',
    defaultValue: `docs/${path.basename(fullPath, path.extname(fullPath))}.md`,
  });
  abort(outputPath);
  const outFull = path.resolve(cwd, (outputPath as string).trim());

  const doc = await spin(`Documenting ${file.path}...`, () =>
    callAI(promptSingleFile(file, repoName), { ...opts, maxTokens: 2048 })
  );

  p.note(doc.slice(0, 500) + (doc.length > 500 ? '\n...' : ''), 'Preview');

  const ok = await p.confirm({ message: `Write to ${chalk.cyan(outFull)}?` });
  abort(ok);
  if (!ok) { p.cancel('Nothing written.'); return; }

  const dir = path.dirname(outFull);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outFull, `# ${file.path}\n\n${doc}\n`, 'utf-8');

  p.outro(chalk.green('Done! ') + chalk.cyan(outFull));
}

// ─── Mode: document entire application ───────────────────────────────────────

async function modeFullApp(opts: OpenRouterOptions, cwd: string): Promise<void> {
  const repoName = await getRepoName();

  const outputPath = await p.text({
    message: 'Save documentation to',
    defaultValue: 'docs/application.md',
  });
  abort(outputPath);
  const outFull = path.resolve(cwd, (outputPath as string).trim());

  const { snapshot, snapshotText } = await spin('Scanning codebase...', async () => {
    const snapshot = scanCodebase(cwd);
    const snapshotText = formatSnapshotForPrompt(snapshot);
    return { snapshot, snapshotText };
  });

  p.note(
    `${chalk.bold('Files scanned:')} ${snapshot.files.length}\n` +
    `${chalk.bold('Skipped:')} ${snapshot.skipped}\n` +
    `${chalk.bold('Context size:')} ~${Math.round(snapshotText.length / 1000)}k chars`,
    'Codebase snapshot'
  );

  const doc = await spin('Generating documentation...', () =>
    callAI(promptFullApp(snapshot, repoName, snapshotText), { ...opts, maxTokens: 4096 })
  );

  p.note(doc.slice(0, 600) + (doc.length > 600 ? '\n...' : ''), 'Preview');

  const ok = await p.confirm({ message: `Write to ${chalk.cyan(outFull)}?` });
  abort(ok);
  if (!ok) { p.cancel('Nothing written.'); return; }

  const dir = path.dirname(outFull);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const date = new Date().toISOString().split('T')[0];
  fs.writeFileSync(
    outFull,
    `# ${repoName} — Application Documentation\n\n> Generated by cli-doc-ai on ${date}\n\n${doc}\n`,
    'utf-8'
  );

  p.outro(chalk.green('Done! ') + chalk.cyan(outFull));
}

// ─── Mode: release notes ──────────────────────────────────────────────────────

async function modeReleaseNotes(opts: OpenRouterOptions, cwd: string): Promise<void> {
  const baseRef = await p.text({
    message: 'Base branch / SHA to compare against',
    placeholder: 'origin/main',
    defaultValue: 'origin/main',
  });
  abort(baseRef);

  const { gitCtx, repoName, version } = await spin('Collecting git context...', async () => ({
    gitCtx:   await collectGitContext(baseRef as string),
    repoName: await getRepoName(),
    version:  await detectVersion(cwd),
  }));

  const versionOverride = await p.text({
    message: `Release version (detected: ${version})`,
    defaultValue: version,
  });
  abort(versionOverride);
  const finalVersion = (versionOverride as string).trim() || version;

  const outputPath = await p.text({
    message: 'Save release notes to',
    defaultValue: `docs/releases/${finalVersion}.md`,
  });
  abort(outputPath);
  const outFull = path.resolve(cwd, (outputPath as string).trim());

  const ctx: PRContext = {
    prNumber: 'manual', prTitle: `Release ${finalVersion}`, prAuthor: 'unknown',
    prUrl: '', version: finalVersion, repoName,
    commits: gitCtx.commits, diffStat: gitCtx.diffStat, diffContent: gitCtx.diffContent,
  };

  const notes = await spin('Generating release notes...', () =>
    callAI(promptReleaseNotes(ctx), { ...opts, maxTokens: 2048 })
  );

  const date = new Date().toISOString().split('T')[0]!;
  p.note(notes.slice(0, 600) + (notes.length > 600 ? '\n...' : ''), 'Preview');

  const ok = await p.confirm({ message: `Write to ${chalk.cyan(outFull)}?` });
  abort(ok);
  if (!ok) { p.cancel('Nothing written.'); return; }

  const dir = path.dirname(outFull);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outFull, `# Release ${finalVersion} — ${date}\n\n${notes}\n`, 'utf-8');

  p.outro(chalk.green('Done! ') + chalk.cyan(outFull));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('');
  p.intro(chalk.bgBlue.white.bold(' cli-doc-ai ') + '  AI-powered documentation generator');

  const apiKey = await resolveApiKey();
  const model  = await resolveModel();
  const cwd    = await resolveCwd();
  const opts: OpenRouterOptions = { apiKey, model };

  const mode = await p.select({
    message: 'What do you want to do?',
    options: [
      {
        value: 'changes',
        label: 'Document changes',
        hint: 'git diff → CHANGELOG entry',
      },
      {
        value: 'file',
        label: 'Document a specific file',
        hint: 'file path → .md documentation',
      },
      {
        value: 'full',
        label: 'Document the entire application',
        hint: 'scan all source files → full project doc (ideal for AI agents)',
      },
      {
        value: 'release',
        label: 'Create release notes',
        hint: 'git diff → user-facing release notes',
      },
    ],
  });
  abort(mode);

  try {
    switch (mode as string) {
      case 'changes': await modeChanges(opts, cwd); break;
      case 'file':    await modeFile(opts, cwd);    break;
      case 'full':    await modeFullApp(opts, cwd); break;
      case 'release': await modeReleaseNotes(opts, cwd); break;
    }
  } catch (err) {
    p.cancel(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

main().catch((err: Error) => {
  p.cancel(`Unexpected error: ${err.message}`);
  process.exit(1);
});
