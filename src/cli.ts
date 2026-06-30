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
  type CodebaseSnapshot,
} from './core/analyzer.js';
import {
  promptChanges,
  promptReleaseNotes,
  promptSingleFile,
  promptFullApp,
  promptBusinessRules,
  promptImplementationTemplates,
  promptCasualOverview,
  promptTaskEnrichment,
} from './core/prompts.js';
import { loadDocsContext } from './core/docsContext.js';
import { fetchGitHubIssue } from './core/issue.js';

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

// ─── Mode: codebase-scan documentation agents ────────────────────────────────
//
// Shared skeleton for every mode that scans the whole codebase, sends it to
// the AI with a specific lens (full app / business rules / templates /
// casual overview), and writes the result to a markdown file.

interface DocAgentConfig {
  defaultOutputPath: string;
  heading: string;
  generatingLabel: string;
  buildPrompt: (snapshot: CodebaseSnapshot, repoName: string, snapshotText: string) => string;
}

async function runDocAgent(
  opts: OpenRouterOptions,
  cwd: string,
  cfg: DocAgentConfig
): Promise<void> {
  const repoName = await getRepoName();

  const outputPath = await p.text({
    message: 'Save documentation to',
    defaultValue: cfg.defaultOutputPath,
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

  const doc = await spin(cfg.generatingLabel, () =>
    callAI(cfg.buildPrompt(snapshot, repoName, snapshotText), { ...opts, maxTokens: 4096 })
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
    `# ${repoName} — ${cfg.heading}\n\n> Generated by cli-doc-ai on ${date}\n\n${doc}\n`,
    'utf-8'
  );

  p.outro(chalk.green('Done! ') + chalk.cyan(outFull));
}

async function modeFullApp(opts: OpenRouterOptions, cwd: string): Promise<void> {
  return runDocAgent(opts, cwd, {
    defaultOutputPath: 'docs/application.md',
    heading: 'Application Documentation',
    generatingLabel: 'Generating documentation...',
    buildPrompt: promptFullApp,
  });
}

async function modeBusinessRules(opts: OpenRouterOptions, cwd: string): Promise<void> {
  return runDocAgent(opts, cwd, {
    defaultOutputPath: 'docs/business-rules.md',
    heading: 'Business Rules',
    generatingLabel: 'Auditing business rules...',
    buildPrompt: promptBusinessRules,
  });
}

async function modeTemplates(opts: OpenRouterOptions, cwd: string): Promise<void> {
  return runDocAgent(opts, cwd, {
    defaultOutputPath: 'docs/templates.md',
    heading: 'Implementation Templates',
    generatingLabel: 'Extracting implementation templates...',
    buildPrompt: promptImplementationTemplates,
  });
}

async function modeOverview(opts: OpenRouterOptions, cwd: string): Promise<void> {
  return runDocAgent(opts, cwd, {
    defaultOutputPath: 'docs/overview.md',
    heading: 'Overview',
    generatingLabel: 'Writing casual overview...',
    buildPrompt: promptCasualOverview,
  });
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

// ─── Mode: enrich task ────────────────────────────────────────────────────────

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || `task-${Date.now()}`;
}

async function modeEnrichTask(opts: OpenRouterOptions, cwd: string): Promise<void> {
  const source = await p.select({
    message: 'Where is the task coming from?',
    options: [
      { value: 'paste', label: 'Paste the task description', hint: 'short text, typed/pasted' },
      { value: 'file', label: 'Read from a file', hint: 'good for longer descriptions' },
      { value: 'issue', label: 'Fetch a GitHub issue', hint: 'requires the gh CLI, authenticated' },
    ],
  });
  abort(source);

  let taskTitle = 'task';
  let taskText = '';

  if (source === 'paste') {
    const input = await p.text({
      message: 'Paste the task description',
      placeholder: 'Add a "forgot password" flow to the login page...',
      validate: (v) => (!v.trim() ? 'Required' : undefined),
    });
    abort(input);
    taskText = (input as string).trim();
    taskTitle = taskText.split('\n')[0]!;
  } else if (source === 'file') {
    const filePath = await p.text({
      message: 'Path to the task file',
      placeholder: 'tasks/forgot-password.md',
      validate: (v) => {
        const full = path.resolve(cwd, v.trim());
        return !fs.existsSync(full) ? `File not found: ${full}` : undefined;
      },
    });
    abort(filePath);
    const fullPath = path.resolve(cwd, (filePath as string).trim());
    taskText = fs.readFileSync(fullPath, 'utf-8').trim();
    taskTitle = path.basename(fullPath, path.extname(fullPath));
  } else {
    const ref = await p.text({
      message: 'Issue reference',
      placeholder: '123, owner/repo#123, or a full issue URL',
      validate: (v) => (!v.trim() ? 'Required' : undefined),
    });
    abort(ref);

    const issue = await spin('Fetching issue...', () => fetchGitHubIssue((ref as string).trim()));
    taskText = `${issue.title}\n\n${issue.body}`;
    taskTitle = issue.title;
  }

  const repoName = await getRepoName();
  const docsContext = loadDocsContext(cwd);

  if (docsContext.included.length === 0) {
    p.log.warn(
      'No project documentation found (docs/application.md, business-rules.md, templates.md, overview.md). ' +
      'Run one of the documentation modes first for a more accurate result.'
    );
    const proceed = await p.confirm({ message: 'Continue without project documentation?' });
    abort(proceed);
    if (!proceed) { p.cancel('Nothing generated.'); return; }
  } else {
    p.note(docsContext.included.join('\n'), 'Using project documentation');
  }

  const enriched = await spin('Enriching task...', () =>
    callAI(promptTaskEnrichment(taskText, docsContext.text, repoName), { ...opts, maxTokens: 3072 })
  );

  console.log('');
  console.log(chalk.bold('── Enriched task ───────────────────────────────'));
  console.log(enriched);
  console.log(chalk.bold('─────────────────────────────────────────────────'));
  console.log('');

  const outputPath = await p.text({
    message: 'Save to file? (leave empty to skip)',
    defaultValue: `docs/tasks/${slugify(taskTitle)}.md`,
  });
  abort(outputPath);
  const trimmedOutput = (outputPath as string).trim();
  if (!trimmedOutput) { p.outro(chalk.green('Done.')); return; }

  const outFull = path.resolve(cwd, trimmedOutput);
  const dir = path.dirname(outFull);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outFull, `# ${taskTitle}\n\n${enriched}\n`, 'utf-8');

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
        value: 'business-rules',
        label: 'Document business rules',
        hint: 'scan codebase → domain rules & validations (for code-review context)',
      },
      {
        value: 'templates',
        label: 'Document implementation templates',
        hint: 'scan codebase → conventions/recipes to follow (for code-review context)',
      },
      {
        value: 'overview',
        label: 'Document a casual overview',
        hint: 'scan codebase → plain-language onboarding doc',
      },
      {
        value: 'release',
        label: 'Create release notes',
        hint: 'git diff → user-facing release notes',
      },
      {
        value: 'enrich-task',
        label: 'Enrich a task description',
        hint: 'raw task + project docs → detailed implementation spec',
      },
    ],
  });
  abort(mode);

  try {
    switch (mode as string) {
      case 'changes':        await modeChanges(opts, cwd); break;
      case 'file':           await modeFile(opts, cwd);    break;
      case 'full':           await modeFullApp(opts, cwd); break;
      case 'business-rules': await modeBusinessRules(opts, cwd); break;
      case 'templates':      await modeTemplates(opts, cwd); break;
      case 'overview':       await modeOverview(opts, cwd); break;
      case 'release':        await modeReleaseNotes(opts, cwd); break;
      case 'enrich-task':    await modeEnrichTask(opts, cwd); break;
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
