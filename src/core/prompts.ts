import type { PRContext } from './openrouter.js';
import type { CodebaseSnapshot, ScannedFile } from './analyzer.js';

export type Language = 'en' | 'pt-BR';

function languageInstruction(lang: Language): string {
  return lang === 'pt-BR'
    ? 'IMPORTANT: write your ENTIRE response in Brazilian Portuguese (pt-BR) — headers, bullet points, everything. Do not use English'
    : 'Write in English';
}

// Repeated at the very end of long prompts (after the guidelines and all the
// codebase context) — small/free models tend to drop instructions that only
// appear once near the top of a long prompt, so recency helps here.
function languageReminder(lang: Language): string {
  return lang === 'pt-BR'
    ? '\n\nReminder: your entire response must be written in Brazilian Portuguese (pt-BR).'
    : '';
}

// Shared by prompts where what to look for depends heavily on whether the
// codebase is a frontend, a backend, a CLI/library, or fullstack.
function projectTypeStep(): string {
  return `## Step 1 — Identify the project type
Before anything else, work out what kind of project this is from the evidence in the codebase
(package.json dependencies/scripts, folder structure, file extensions, frameworks in use):
frontend (web/mobile UI), backend/API/service, CLI tool or library, or fullstack (both in the
same repo). State it as a single line at the very top of your output: "**Project type:** ...".
Use this to calibrate everything below — what's worth documenting looks very different in a UI
codebase versus a backend service versus a CLI tool.`;
}

// ─── Changelog / Changes ─────────────────────────────────────────────────────

export function promptChanges(ctx: PRContext, lang: Language): string {
  return `You are a technical writer generating a CHANGELOG entry for a software project.

Given the information below about a Pull Request or set of changes, write a concise CHANGELOG entry.

## Guidelines
- ${languageInstruction(lang)}
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
${languageReminder(lang)}
`;
}

// ─── Release Notes ────────────────────────────────────────────────────────────

export function promptReleaseNotes(ctx: PRContext, lang: Language): string {
  return `You are a technical writer creating release notes for a software project.

Write professional release notes based on the changes below.
The audience is end users and developers who consume this project.

## Guidelines
- ${languageInstruction(lang)}
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
${languageReminder(lang)}
`;
}

// ─── Single File Documentation ────────────────────────────────────────────────

export function promptSingleFile(file: ScannedFile, repoName: string, lang: Language): string {
  return `You are a technical writer documenting a source code file.

Generate clear, concise documentation for the file below.

## Guidelines
- ${languageInstruction(lang)}
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
${languageReminder(lang)}
`;
}

// ─── Full Application Documentation ──────────────────────────────────────────

export function promptFullApp(
  snapshot: CodebaseSnapshot,
  repoName: string,
  snapshotText: string,
  lang: Language
): string {
  return `You are a technical writer generating comprehensive documentation for a software project.

Generate a full documentation page based on the codebase snapshot below.
This documentation will be used by an AI support agent to answer questions about the project.

## Guidelines
- ${languageInstruction(lang)}
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
${languageReminder(lang)}
`;
}

// ─── Business Rules ───────────────────────────────────────────────────────────

export function promptBusinessRules(
  snapshot: CodebaseSnapshot,
  repoName: string,
  snapshotText: string,
  lang: Language
): string {
  return `You are a Staff+ Software Architect and Domain Analyst.

Your task is NOT to explain how the code works.
Your task is to reverse engineer the business domain from the source code and produce a Business Rules Specification that will be used by an AI Code Review Agent.

The purpose of this document is to allow future PR reviews to detect when a change silently breaks an existing business rule.

${projectTypeStep()}

# Primary Goal

Extract every business rule that exists in the codebase.

A business rule is any decision that changes the behavior of the system based on domain concepts—not technical implementation.

Think like someone trying to answer:

"If another developer changes this logic, what business behavior could accidentally be broken?"

---

# What to Extract

## 1. Domain Rules

Capture every explicit or implicit business rule, including:

- validations
- restrictions
- permissions
- eligibility rules
- lifecycle/state transitions
- workflows
- required sequences
- business calculations
- quotas
- limits
- domain invariants
- uniqueness rules
- dependencies between entities
- synchronization rules
- temporal rules
- feature availability rules
- client-side validations that enforce business logic
- hidden assumptions encoded in conditionals

Example:

✓ Customer cannot have more than one active subscription.

✓ Product can only be cancelled before shipment.

✓ Discount applies only to Premium users.

✓ Invoice total is calculated excluding cancelled items.

---

## 2. Business Calculations

Document every calculation that has business meaning.

Examples:

- pricing
- taxes
- commissions
- score
- ranking
- discounts
- percentages
- points
- limits
- deadlines
- expiration

For every calculation describe:

- formula
- inputs
- outputs
- special cases
- exceptions

---

## 3. State Machines

Whenever entities change state, document:

Allowed transitions

Example

Draft
→ Pending
→ Approved
→ Completed

Invalid transitions

Required conditions

Side effects

---

## 4. Authorization Rules

Document every permission encoded in code.

Examples

Who can:

- create
- edit
- delete
- approve
- cancel
- view

Include frontend permission checks if they mirror backend business rules.

---

## 5. Cross-Entity Rules

Detect relationships like:

- creating X automatically updates Y
- deleting X invalidates Z
- changing status A requires entity B
- event X triggers process Y

These are often spread across services and easy to miss.

---

## 6. Hidden Business Assumptions

Infer assumptions from:

- if statements
- switch statements
- enums
- validators
- comments
- naming
- duplicated validations
- UI restrictions

Mark inferred rules as:

⚠ NEEDS CONFIRMATION

Never invent behavior.

Only infer when there is reasonable evidence.

---

## 7. Business Constants

Capture constants that represent business meaning rather than technical configuration.

Examples:

- max attempts
- grace periods
- timeout windows
- maximum quantity
- minimum age
- percentage values
- business thresholds

Ignore infrastructure/configuration constants.

---

## 8. Domain Vocabulary

Create a glossary describing:

Entity

Meaning

Responsibilities

Relationships

Important statuses

Important flags

This helps future AI reviews understand the language of the project.

---

# Ignore Completely

Do NOT include:

- framework setup
- dependency injection
- logging
- environment variables
- API wiring
- DTO mapping
- repositories
- generic CRUD
- serializers
- formatting
- build scripts
- lint
- tests (unless they reveal business rules)
- technical utilities
- infrastructure
- authentication implementation details (unless they affect business permissions)

---

# Evidence

Every rule MUST include:

Rule

Evidence

Location

Confidence

Example:

### Customer cannot have multiple active subscriptions

**Rule**

A customer may own only one active subscription.

**Evidence**

The service checks for an existing ACTIVE subscription before creating another.

**Location**

SubscriptionService.create()

subscription.repository.findActiveByCustomer()

**Confidence**

HIGH

---

# Output Format

Group everything by business domain/module.

Example

# Subscription

...

# Payments

...

# Orders

...

# Notifications

...

Each rule should use the following template:

## Rule Name

**Rule**

...

**Why it exists**

...

**Evidence**

...

**Files**

...

**Confidence**

HIGH | MEDIUM | LOW

---

# Important

Do NOT summarize the project.

Do NOT explain architecture.

Do NOT document implementation details unless they reveal business behavior.

Prefer missing a questionable rule over inventing one.

Be exhaustive.

If multiple files implement the same rule, merge them into a single rule with multiple evidence locations.

${languageInstruction(lang)}

Files scanned:
${snapshot.totalFiles}
${snapshot.skipped > 0 ? `${snapshot.skipped} skipped due to size limit` : 'All included'}

## Repository: ${repoName}

${snapshotText}
${languageReminder(lang)}
`;
}

// Second pass: have the model critique its own draft and strip out anything
// that's really just technical/infrastructure config disguised as a "rule".
// Small/free models are inconsistent at applying this filter while also
// generating from a large codebase dump — reviewing an already-short list
// one item at a time is a much easier task and catches what the first pass
// misses.
export function promptRefineBusinessRules(draft: string, lang: Language): string {
  return `You are editing the document below in place. You are NOT writing a report about the
edit — you ARE the new version of the document.

For each rule entry, ask: is this a genuine business/domain rule (a validation, calculation,
eligibility check, state transition, or invariant that encodes a decision about the business
domain), or is it actually just technical/infrastructure configuration (token limits, file-size
limits, env vars, default values, dependency injection, logging, generic CRUD, build/lint
tooling)? Delete every entry that is really just technical/infrastructure configuration, even if
it was phrased to sound like a rule. Keep everything else — including its evidence, location, and
confidence fields — exactly as written.

If, after deleting, very few or no genuine business rules remain, do not pad the document back
out — output a short section (using the same heading style as the draft) stating plainly that
this project has little to no real business logic and why (e.g. "this is a technical/infra tool"
or "the scanned files were mostly configuration").

## Output format — read carefully, this is not optional
- Output ONLY the edited document itself.
- Do NOT write a report, summary, or list of what you removed and why (no "Removed:", no
  "I removed X because...", no meta-commentary about the review process at all).
- Do NOT add any heading, preamble, or sign-off that wasn't in the original document's structure.
- The very first character of your response must be the first character of the (possibly
  trimmed) document itself — e.g. it should start the same way the draft starts.
- ${languageInstruction(lang)}

## Draft to edit
${draft}
${languageReminder(lang)}
`;
}

// ─── Implementation Templates ─────────────────────────────────────────────────

export function promptImplementationTemplates(
  snapshot: CodebaseSnapshot,
  repoName: string,
  snapshotText: string,
  lang: Language
): string {
  return `You are a staff engineer documenting the implementation conventions of a codebase.

Read the codebase snapshot below and extract the recurring patterns a contributor should follow
when adding new code — module structure, naming, error handling, testing approach, and any
"how to add a new X" recipe you can infer by comparing similar files.

${projectTypeStep()}

Examples of what a "recipe" looks like depending on the project type (pick what actually applies
— do not force-fit a recipe type that has no evidence in the code):
- Frontend: "Adding a new component/page", "Adding a new form with validation", "Adding a new
  route", "Consuming a new API endpoint from the client"
- Backend: "Adding a new API endpoint", "Adding a new service/use case", "Adding a new DB
  migration/model", "Adding a new background job"
- CLI/library: "Adding a new command/mode", "Adding a new exported function", "Adding a new
  config option"

## Guidelines
- ${languageInstruction(lang)}
- Structure as a checklist/recipe per pattern
- Each recipe should be concrete enough that both an implementer and an AI code-review agent can
  check "does this PR follow the template for X?"
- Only document patterns you can actually observe being repeated in the code — do not prescribe
  conventions that aren't already in use
- Format as Markdown with headers and bullet points
- Total files scanned: ${snapshot.totalFiles} (${snapshot.skipped > 0 ? `${snapshot.skipped} skipped due to size limit` : 'all included'})

## Repository: ${repoName}

${snapshotText}
${languageReminder(lang)}
`;
}

// ─── Casual Overview ──────────────────────────────────────────────────────────

export function promptCasualOverview(
  snapshot: CodebaseSnapshot,
  repoName: string,
  snapshotText: string,
  lang: Language
): string {
  return `You are explaining this codebase to a new teammate on their first day, or to a
non-technical stakeholder, in a casual conversation.

## Guidelines
- ${languageInstruction(lang)}, plain language, no jargon (or explain it immediately when unavoidable)
- Analogies are welcome if they help
- Focus on: what problem this project solves, who uses it, and how the main pieces fit together
  at a high level — skip implementation detail
- Keep it short — a few short paragraphs, not an exhaustive reference
- Format as Markdown
- Total files scanned: ${snapshot.totalFiles} (${snapshot.skipped > 0 ? `${snapshot.skipped} skipped due to size limit` : 'all included'})

## Repository: ${repoName}

${snapshotText}
${languageReminder(lang)}
`;
}

// ─── Task Enrichment ──────────────────────────────────────────────────────────

export function promptTaskEnrichment(
  taskText: string,
  docsContext: string,
  repoName: string,
  lang: Language
): string {
  return `You are a tech lead turning a rough task description into a clear, specific
implementation spec, using this project's documented business rules and implementation
templates as the ground truth.

## Guidelines
- ${languageInstruction(lang)}
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
${languageReminder(lang)}
`;
}
