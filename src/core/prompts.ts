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

// ─── Business Rules ───────────────────────────────────────────────────────────

export function promptBusinessRules(
  snapshot: CodebaseSnapshot,
  repoName: string,
  snapshotText: string
): string {
  return `You are a senior software architect performing a business-rules audit of a codebase.

Read the codebase snapshot below and extract the business rules, validations, invariants,
calculations, and domain constraints that are encoded in the code — not generic CRUD behavior.
This document will be used as context by an AI code-review agent so it can flag PRs that
violate a known rule, so be specific and point to where each rule lives.

## Guidelines
- Write in English
- Group rules by domain/module
- For each rule, state: the rule itself, where it's enforced (file/function), and why it likely
  exists if inferable from the code (comments, naming, validation logic)
- Explicitly mark rules that are ambiguous or only implicit in the code with "⚠ NEEDS CONFIRMATION"
  so a human can validate them later — do not invent intent that isn't supported by the code
- Skip purely technical/infrastructure concerns (those belong in a different document)
- Format as Markdown with headers and bullet points
- Total files scanned: ${snapshot.totalFiles} (${snapshot.skipped > 0 ? `${snapshot.skipped} skipped due to size limit` : 'all included'})

## Repository: ${repoName}

${snapshotText}
`;
}

// ─── Implementation Templates ─────────────────────────────────────────────────

export function promptImplementationTemplates(
  snapshot: CodebaseSnapshot,
  repoName: string,
  snapshotText: string
): string {
  return `You are a staff engineer documenting the implementation conventions of a codebase.

Read the codebase snapshot below and extract the recurring patterns a contributor should follow
when adding new code — module structure, naming, error handling, testing approach, and any
"how to add a new X" recipe you can infer by comparing similar files.

## Guidelines
- Write in English
- Structure as a checklist/recipe per pattern (e.g. "Adding a new CLI mode", "Adding a new prompt")
- Each recipe should be concrete enough that both an implementer and an AI code-review agent can
  check "does this PR follow the template for X?"
- Only document patterns you can actually observe being repeated in the code — do not prescribe
  conventions that aren't already in use
- Format as Markdown with headers and bullet points
- Total files scanned: ${snapshot.totalFiles} (${snapshot.skipped > 0 ? `${snapshot.skipped} skipped due to size limit` : 'all included'})

## Repository: ${repoName}

${snapshotText}
`;
}

// ─── Casual Overview ──────────────────────────────────────────────────────────

export function promptCasualOverview(
  snapshot: CodebaseSnapshot,
  repoName: string,
  snapshotText: string
): string {
  return `You are explaining this codebase to a new teammate on their first day, or to a
non-technical stakeholder, in a casual conversation.

## Guidelines
- Write in English, plain language, no jargon (or explain it immediately when unavoidable)
- Analogies are welcome if they help
- Focus on: what problem this project solves, who uses it, and how the main pieces fit together
  at a high level — skip implementation detail
- Keep it short — a few short paragraphs, not an exhaustive reference
- Format as Markdown
- Total files scanned: ${snapshot.totalFiles} (${snapshot.skipped > 0 ? `${snapshot.skipped} skipped due to size limit` : 'all included'})

## Repository: ${repoName}

${snapshotText}
`;
}

// ─── Task Enrichment ──────────────────────────────────────────────────────────

export function promptTaskEnrichment(
  taskText: string,
  docsContext: string,
  repoName: string
): string {
  return `You are a tech lead turning a rough task description into a clear, specific
implementation spec, using this project's documented business rules and implementation
templates as the ground truth.

## Guidelines
- Write in English
- Structure with these sections:
  1. **Goal** — restate the task in one or two precise sentences
  2. **Acceptance Criteria** — concrete, testable bullet points
  3. **Relevant Business Rules** — rules from the docs below that this task must respect, citing
     which document they come from
  4. **Suggested Implementation Approach** — which existing pattern/template to follow, citing
     the docs below
  5. **Edge Cases to Consider**
  6. **Open Questions** — anything the task or the docs don't cover; do NOT invent behavior that
     isn't supported by the docs or the task description — surface it as a question instead
- If the project documentation below is missing or doesn't cover this task, say so plainly in
  the relevant section rather than guessing
- Format as Markdown

## Repository: ${repoName}

## Raw Task Description
${taskText}

## Project Documentation Context
${docsContext || '(no project documentation found — generate business-rules/templates docs first for a more accurate result)'}
`;
}
