import type { PRContext } from './openrouter.js';
import type { CodebaseSnapshot, ScannedFile } from './analyzer.js';

// ─── Changelog / Changes ─────────────────────────────────────────────────────

export function promptChanges(ctx: PRContext): string {
  return `You are a technical writer generating a CHANGELOG entry for a software project.

Given the information below about a Pull Request or set of changes, write a concise CHANGELOG entry.

## Guidelines
- Write in English
- Use present tense ("Adds", "Fixes", "Removes")
- Be objective and technical, no fluff
- Highlight behavioral changes, new features, and bug fixes
- Prefix breaking changes with "⚠ BREAKING CHANGE:"
- Return 3–8 bullet points ONLY, no headers, no extra text

## Context
- Title: ${ctx.prTitle}
- Author: ${ctx.prAuthor}
- Repository: ${ctx.repoName}

## Commits
${ctx.commits}

## Changed Files
${ctx.diffStat}

## Diff
\`\`\`diff
${ctx.diffContent}
\`\`\`
`;
}

// ─── Release Notes ────────────────────────────────────────────────────────────

export function promptReleaseNotes(ctx: PRContext): string {
  return `You are a technical writer creating release notes for a software project.

Write professional release notes based on the changes below.
The audience is end users and developers who consume this project.

## Guidelines
- Write in English
- Use clear, friendly but technical language
- Group changes into sections: ### New Features, ### Bug Fixes, ### Improvements, ### Breaking Changes (only if present)
- Omit sections that have no content
- Each item is a bullet point with a short explanation of the user impact
- End with a one-sentence upgrade note if there are breaking changes
- Return ONLY the release notes content, no version header (it will be added automatically)

## Context
- Version: ${ctx.version}
- Repository: ${ctx.repoName}

## Commits
${ctx.commits}

## Changed Files
${ctx.diffStat}

## Diff
\`\`\`diff
${ctx.diffContent}
\`\`\`
`;
}

// ─── Single File Documentation ────────────────────────────────────────────────

export function promptSingleFile(file: ScannedFile, repoName: string): string {
  return `You are a technical writer documenting a source code file.

Generate clear, concise documentation for the file below.

## Guidelines
- Write in English
- Include: purpose of the file, what it exports, key functions/classes/types with a one-line description each
- Note any important side effects or dependencies
- Keep it scannable — use bullet points and short paragraphs
- Do NOT repeat the code back, only describe it
- Format as Markdown

## File: ${file.path} (${file.lines} lines)
Repository: ${repoName}

\`\`\`
${file.content}
\`\`\`
`;
}

// ─── Full Application Documentation ──────────────────────────────────────────

export function promptFullApp(
  snapshot: CodebaseSnapshot,
  repoName: string,
  snapshotText: string
): string {
  return `You are a technical writer generating comprehensive documentation for a software project.

Generate a full documentation page based on the codebase snapshot below.
This documentation will be used by an AI support agent to answer questions about the project.

## Guidelines
- Write in English
- Structure with these sections (omit sections that don't apply):
  1. **Overview** — what the project does in 2–3 sentences
  2. **Architecture** — main modules, layers, data flow
  3. **Key Components** — most important files/modules and their responsibility
  4. **Data Models** — main types, schemas, entities
  5. **API / Interfaces** — public endpoints or exported interfaces (if any)
  6. **Configuration** — env vars, config files
  7. **How to Run** — setup and run commands inferred from the codebase
- Be thorough but concise — this will be embedded in an AI agent's context
- Format as Markdown with headers and bullet points
- Total files scanned: ${snapshot.totalFiles} (${snapshot.skipped > 0 ? `${snapshot.skipped} skipped due to size limit` : 'all included'})

## Repository: ${repoName}

${snapshotText}
`;
}
