# Changelog

All notable changes to this project will be documented in this file.

Entries are generated automatically by the [Auto Documentation workflow](.github/workflows/auto-docs.yml) using AI when a Pull Request targeting `main` is opened.

---

## Usage in other repositories

### 1. Add the secret

In your target repository, go to **Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|--------|-------|
| `OPENROUTER_API_KEY` | Your key from [openrouter.ai/keys](https://openrouter.ai/keys) |

### 2. Create the workflow file

Copy [`examples/caller-workflow.yml`](examples/caller-workflow.yml) to your repo at:

```
.github/workflows/auto-docs.yml
```

And replace `YOUR_GITHUB_USER` with your actual GitHub username or organization.

### 3. Done

Open a Pull Request targeting `main` in your repository. The action will:
- Collect commits and diff from the PR
- Call OpenRouter AI to generate a human-readable summary
- Prepend a new entry to your `CHANGELOG.md`
- Commit and push back to the PR branch automatically

---

### Available inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `openrouter-api-key` | yes | — | OpenRouter API key |
| `openrouter-model` | no | `mistralai/mistral-7b-instruct:free` | Model ID to use |
| `changelog-path` | no | `CHANGELOG.md` | Path to the changelog file |

### Available outputs

| Output | Description |
|--------|-------------|
| `changelog-updated` | `true` if CHANGELOG was written |
| `entry-version` | Version string used in the generated entry |

---
