#!/usr/bin/env node

/**
 * generate-docs.js
 *
 * Reads PR context from environment variables, calls OpenRouter AI to generate
 * a human-readable summary, and prepends the entry to CHANGELOG.md.
 *
 * When used as a GitHub Composite Action, CALLER_WORKSPACE points to the
 * repository that invoked the action, so the CHANGELOG is written there.
 */

import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || 'mistralai/mistral-7b-instruct:free';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// When running as a Composite Action, write to the caller's workspace.
// When running standalone (inside this very repo), fall back to cwd.
const WORKSPACE = process.env.CALLER_WORKSPACE || process.cwd();
const CHANGELOG_RELATIVE = process.env.CHANGELOG_PATH || 'CHANGELOG.md';
const CHANGELOG_PATH = path.resolve(WORKSPACE, CHANGELOG_RELATIVE);

// PR context
const PR_NUMBER   = process.env.PR_NUMBER   || 'N/A';
const PR_TITLE    = process.env.PR_TITLE    || 'N/A';
const PR_AUTHOR   = process.env.PR_AUTHOR   || 'N/A';
const PR_URL      = process.env.PR_URL      || '';
const VERSION     = process.env.VERSION     || 'unreleased';
const REPO_NAME   = process.env.REPO_NAME   || '';
const COMMITS     = process.env.COMMITS     || '(no commits found)';
const DIFF_STAT   = process.env.DIFF_STAT   || '(no diff stat found)';
const DIFF_CONTENT = process.env.DIFF_CONTENT || '';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

if (!OPENROUTER_API_KEY) {
  console.error(
    '[generate-docs] ERROR: OPENROUTER_API_KEY is not set.\n' +
    'Add it in Settings → Secrets → Actions of your repository.'
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildPrompt() {
  return `You are a technical writer generating a CHANGELOG entry for a software project.

Given the information below about a Pull Request, write a concise, clear CHANGELOG entry.

## Guidelines
- Write in English
- Use present tense (e.g. "Adds", "Fixes", "Removes")
- Be objective and technical, avoid fluff
- Highlight important behavioral changes, new features, and bug fixes
- Mention breaking changes explicitly with a "⚠ BREAKING CHANGE:" prefix if detected
- Keep the summary between 3 and 8 bullet points
- Do NOT include the version header or date — those will be added automatically
- Return ONLY the bullet points, nothing else

## Pull Request Information
- Title: ${PR_TITLE}
- Author: ${PR_AUTHOR}
- Repository: ${REPO_NAME}

## Commits
${COMMITS}

## Changed Files (stat)
${DIFF_STAT}

## Diff (truncated to 12000 chars)
\`\`\`diff
${DIFF_CONTENT}
\`\`\`
`;
}

async function callOpenRouter(prompt) {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': `https://github.com/${REPO_NAME}`,
      'X-Title': 'GitHub Actions Auto Documentation',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('OpenRouter returned an empty response: ' + JSON.stringify(data));
  }

  return content.trim();
}

function readChangelog() {
  if (fs.existsSync(CHANGELOG_PATH)) {
    return fs.readFileSync(CHANGELOG_PATH, 'utf-8');
  }
  return '# Changelog\n\nAll notable changes to this project will be documented in this file.\n';
}

function buildEntry(aiSummary) {
  const date = new Date().toISOString().split('T')[0];
  const prLink = PR_URL ? `[#${PR_NUMBER}](${PR_URL})` : `#${PR_NUMBER}`;

  return (
    `## [${VERSION}] - ${date}\n\n` +
    `> PR ${prLink} — **${PR_TITLE}** by @${PR_AUTHOR}\n\n` +
    `${aiSummary}\n\n` +
    `---\n`
  );
}

function prependEntry(existing, entry) {
  const h1Match = existing.match(/^# .+\n(\n)?/m);

  if (h1Match && h1Match.index !== undefined) {
    const insertAt = h1Match.index + h1Match[0].length;
    return (
      existing.slice(0, insertAt) +
      '\n' +
      entry +
      '\n' +
      existing.slice(insertAt)
    );
  }

  return entry + '\n' + existing;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[generate-docs] Model        : ${OPENROUTER_MODEL}`);
  console.log(`[generate-docs] PR           : #${PR_NUMBER} — ${PR_TITLE}`);
  console.log(`[generate-docs] Version      : ${VERSION}`);
  console.log(`[generate-docs] Workspace    : ${WORKSPACE}`);
  console.log(`[generate-docs] CHANGELOG    : ${CHANGELOG_PATH}`);
  console.log(`[generate-docs] Commits      :\n${COMMITS}\n`);

  console.log('[generate-docs] Calling OpenRouter API...');
  const aiSummary = await callOpenRouter(buildPrompt());

  console.log('[generate-docs] AI summary:\n');
  console.log(aiSummary);
  console.log('');

  const existing = readChangelog();
  const entry = buildEntry(aiSummary);
  const updated = prependEntry(existing, entry);

  fs.writeFileSync(CHANGELOG_PATH, updated, 'utf-8');
  console.log(`[generate-docs] CHANGELOG.md updated successfully.`);

  // Output for the action
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    fs.appendFileSync(outputFile, 'changelog_updated=true\n');
  }
}

main().catch((err) => {
  console.error('[generate-docs] FATAL:', err.message);
  process.exit(1);
});
