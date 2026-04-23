# cli-doc-ai

GitHub Action + CLI that automatically generates CHANGELOG entries using AI (OpenRouter) based on PR commits and diffs.

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
- Choosing an AI model (free options available)
- Picking the base branch to compare against
- Setting the version and release title
- Previewing the generated entry before writing

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

No cost, no config needed:

- `mistralai/mistral-7b-instruct:free`
- `meta-llama/llama-3-8b-instruct:free`
- `google/gemma-7b-it:free`

For better quality, set `openrouter-model` to `anthropic/claude-3.5-sonnet` or `openai/gpt-4o`.

---

## Version detection

Reads version automatically from (in order): `package.json` → `pyproject.toml` → `Cargo.toml` → latest git tag → `PR-{number}`.

## Local development

```bash
bun install
bun run build   # compiles TypeScript to dist/
bun run dev     # watch mode
```
