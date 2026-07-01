# cli-doc-ai

GitHub Action + CLI that uses AI (OpenRouter) to automatically generate CHANGELOG entries from PR commits and diffs, and to generate project documentation (business rules, implementation templates, casual overview) and enrich task descriptions — so code review has more context and is more assertive.

## How it works

- Collects commits and diff between your PR branch and `main`
- Detects the current version from `package.json`, `pyproject.toml`, `Cargo.toml`, or the latest git tag
- Sends the context to an AI model via OpenRouter
- Prepends a new entry to your `CHANGELOG.md`

---

## GitHub Action (automatic)

Runs on every PR opened against `main` and commits the updated CHANGELOG back to the branch.

**1. Add the secret**

In your repo: `Settings → Secrets and variables → Actions`

| Secret | Value |
|--------|-------|
| `OPENROUTER_API_KEY` | Your key from [openrouter.ai/keys](https://openrouter.ai/keys) |

**2. Create `.github/workflows/auto-docs.yml`**

```yaml
name: Auto Documentation

on:
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened]

permissions:
  contents: write
  pull-requests: read

jobs:
  generate-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          ref: ${{ github.head_ref }}
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: YOUR_GITHUB_USER/cli-doc-ai@v1
        with:
          openrouter-api-key: ${{ secrets.OPENROUTER_API_KEY }}
          # openrouter-model: 'anthropic/claude-3.5-sonnet'  # optional, default is free
          # changelog-path: 'docs/CHANGELOG.md'              # optional, default is CHANGELOG.md

      - name: Commit updated CHANGELOG
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add CHANGELOG.md
          git diff --staged --quiet || git commit -m "docs: update CHANGELOG for PR #${{ github.event.pull_request.number }} [skip ci]"
          git push origin ${{ github.head_ref }}
```

---

## CLI (manual)

Run locally whenever you want to document changes without opening a PR.

**Install**

```bash
bun add -g cli-doc-ai
```

**Run**

```bash
# API key from env (recommended)
OPENROUTER_API_KEY=sk-or-... doc-ai

# or enter it interactively
doc-ai
```

The CLI will guide you through:
- Choosing an AI provider (OpenRouter or a local Ollama server)
- Choosing an AI model (free options available)
- Choosing the language for the generated file (English or Português)
- Picking the base branch to compare against
- Setting the version and release title
- Previewing the generated entry before writing

### Using a local Ollama server instead of OpenRouter

No API key needed — everything runs on your machine.

```bash
# make sure Ollama is running and you've pulled a model
ollama pull llama3.1

AI_PROVIDER=ollama doc-ai
# optional: OLLAMA_BASE_URL (default http://localhost:11434), OLLAMA_MODEL
```

### Output language

The generated file's language defaults to a prompt (English or Português). Skip it by setting
`DOC_LANGUAGE=en` or `DOC_LANGUAGE=pt-BR` in your `.env`.

---

## Documentation agents (for better code review context)

Besides CHANGELOG entries, the CLI can scan your codebase and generate documentation meant to
be fed as context to an AI code-review agent (or read by your team), so reviews can be more
specific and assertive:

| Mode | Output | What it's for |
|------|--------|----------------|
| Document the entire application | `docs/application.md` | Architecture, key components, data models |
| Document business rules | `docs/business-rules.md` | Domain validations, invariants, and rules a PR must respect |
| Document implementation templates | `docs/templates.md` | Recurring conventions/recipes a PR should follow |
| Document a casual overview | `docs/overview.md` | Plain-language onboarding summary |

## Enrich a task description

Turns a rough task into a detailed implementation spec (acceptance criteria, relevant business
rules, suggested approach, edge cases, open questions), using the documentation above as ground
truth — so there's less ambiguity before the code is even written.

The task can come from:
- Pasted text
- A local file
- A GitHub issue (requires the [`gh` CLI](https://cli.github.com/) installed and authenticated —
  falls back to pasting manually if it's not available)

For best results, generate the business rules and templates docs first.

---

## Action inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `openrouter-api-key` | yes | — | OpenRouter API key |
| `openrouter-model` | no | `mistralai/mistral-7b-instruct:free` | Any model from openrouter.ai |
| `changelog-path` | no | `CHANGELOG.md` | Path to the changelog file |

## Action outputs

| Output | Description |
|--------|-------------|
| `changelog-updated` | `true` if the file was written |
| `entry-version` | Version string used in the entry |

---

## Free models (default)

No cost, no config needed. If the requested model is rate-limited upstream, the CLI automatically
retries with the next one in this list:

- `meta-llama/llama-3.3-70b-instruct:free`
- `qwen/qwen3-coder:free`
- `meta-llama/llama-3.2-3b-instruct:free`
- `nvidia/nemotron-nano-9b-v2:free`

These are spread across different upstream providers on purpose — if one provider is congested,
the others are usually still available. For better quality (and no shared rate limits), set
`openrouter-model` to `anthropic/claude-3.5-sonnet` or `openai/gpt-4o` (requires credits on your
OpenRouter account), or use a local Ollama model instead (see above).

---

## Version detection

Reads version automatically from (in order): `package.json` → `pyproject.toml` → `Cargo.toml` → latest git tag → `PR-{number}`.

## Local development

```bash
bun install
bun run build   # compiles TypeScript to dist/
bun run dev     # watch mode
```
