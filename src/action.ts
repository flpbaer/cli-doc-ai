/**
 * action.ts
 *
 * Entry point when running as a GitHub Composite Action.
 * All inputs come from environment variables set by the action.yml.
 */

import path from 'path';
import fs from 'fs';
import { generateSummary, DEFAULT_MODEL, type PRContext } from './core/openrouter.js';
import { updateChangelog } from './core/changelog.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[action] ERROR: Required environment variable "${name}" is not set.`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  const apiKey = requireEnv('OPENROUTER_API_KEY');
  const model = process.env['OPENROUTER_MODEL'] ?? DEFAULT_MODEL;

  // When running as a Composite Action, CALLER_WORKSPACE points to the
  // invoking repository. Fall back to cwd for standalone use.
  const workspace = process.env['CALLER_WORKSPACE'] ?? process.cwd();
  const changelogRelative = process.env['CHANGELOG_PATH'] ?? 'CHANGELOG.md';
  const changelogPath = path.resolve(workspace, changelogRelative);

  const ctx: PRContext = {
    prNumber:    process.env['PR_NUMBER']    ?? 'N/A',
    prTitle:     process.env['PR_TITLE']     ?? 'N/A',
    prAuthor:    process.env['PR_AUTHOR']    ?? 'N/A',
    prUrl:       process.env['PR_URL']       ?? '',
    version:     process.env['VERSION']      ?? 'unreleased',
    repoName:    process.env['REPO_NAME']    ?? '',
    commits:     process.env['COMMITS']      ?? '(no commits found)',
    diffStat:    process.env['DIFF_STAT']    ?? '(no diff stat found)',
    diffContent: process.env['DIFF_CONTENT'] ?? '',
  };

  console.log(`[action] Model      : ${model}`);
  console.log(`[action] PR         : #${ctx.prNumber} — ${ctx.prTitle}`);
  console.log(`[action] Version    : ${ctx.version}`);
  console.log(`[action] Workspace  : ${workspace}`);
  console.log(`[action] CHANGELOG  : ${changelogPath}`);
  console.log(`[action] Commits    :\n${ctx.commits}\n`);

  console.log('[action] Calling OpenRouter API...');
  const summary = await generateSummary(ctx, { apiKey, model, repoName: ctx.repoName });

  console.log('[action] AI summary:\n');
  console.log(summary);
  console.log('');

  const date = new Date().toISOString().split('T')[0]!;

  updateChangelog(changelogPath, {
    version:  ctx.version,
    date,
    prNumber: ctx.prNumber,
    prTitle:  ctx.prTitle,
    prAuthor: ctx.prAuthor,
    prUrl:    ctx.prUrl,
    summary,
  });

  console.log(`[action] CHANGELOG updated: ${changelogPath}`);

  // Write output for the action.yml
  const outputFile = process.env['GITHUB_OUTPUT'];
  if (outputFile) {
    fs.appendFileSync(outputFile, 'changelog_updated=true\n');
  }
}

main().catch((err: Error) => {
  console.error('[action] FATAL:', err.message);
  process.exit(1);
});
