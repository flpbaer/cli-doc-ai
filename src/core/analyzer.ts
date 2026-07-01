import fs from 'fs';
import path from 'path';

// Files/dirs to always ignore when scanning
const IGNORE = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt',
  '__pycache__', '.venv', 'venv', 'vendor', 'coverage', '.turbo',
  '.cache', '.parcel-cache', 'tmp', 'temp', '.DS_Store',
]);

// Extensions worth reading for context
const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.java', '.cs', '.rb', '.rs', '.php', '.swift',
  '.vue', '.svelte',
  '.json', '.yaml', '.yml', '.toml', '.env.example',
  '.md', '.mdx',
  '.sql', '.prisma', '.graphql',
  '.sh', '.bash',
  '.css', '.scss',
]);

// Files to always try to read (even without matching extension)
const PRIORITY_FILES = new Set([
  'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod',
  'README.md', 'readme.md', 'Makefile', 'Dockerfile',
  'docker-compose.yml', 'docker-compose.yaml',
  '.env.example', 'tsconfig.json',
]);

const MAX_FILE_CHARS = 3_000;
const MAX_TOTAL_CHARS = 60_000;
// Directory depth is cheap to traverse (it doesn't consume the char budget
// above) — this is just a guard against pathological trees, not a real
// limit. Conventional package structures (e.g. Java's src/main/java/com/
// company/product/service/) routinely sit 7-8 levels deep before reaching
// any actual business logic, so this needs to be generous.
const MAX_DEPTH = 20;

export interface ScannedFile {
  path: string;       // relative path from cwd
  content: string;    // truncated content
  lines: number;
}

export interface CodebaseSnapshot {
  tree: string;       // ASCII directory tree
  files: ScannedFile[];
  totalFiles: number;
  skipped: number;
}

// ─── Tree builder ─────────────────────────────────────────────────────────────

function buildTree(dir: string, prefix = '', depth = 0): string {
  if (depth > MAX_DEPTH) return '';

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return '';
  }

  const filtered = entries
    .filter((e) => !IGNORE.has(e.name) && !e.name.startsWith('.') || PRIORITY_FILES.has(e.name))
    .sort((a, b) => {
      // dirs first, then files
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  return filtered
    .map((entry, i) => {
      const isLast = i === filtered.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const childPrefix = isLast ? prefix + '    ' : prefix + '│   ';
      const line = prefix + connector + entry.name;

      if (entry.isDirectory()) {
        const subtree = buildTree(path.join(dir, entry.name), childPrefix, depth + 1);
        return subtree ? `${line}/\n${subtree}` : `${line}/`;
      }

      return line;
    })
    .join('\n');
}

// ─── File collector ───────────────────────────────────────────────────────────

function collectFiles(
  dir: string,
  cwd: string,
  depth = 0,
  budget: { remaining: number }
): ScannedFile[] {
  if (depth > MAX_DEPTH || budget.remaining <= 0) return [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: ScannedFile[] = [];

  // Priority files first, then directories, then regular files — so we
  // descend into the actual source tree before the shared char budget gets
  // spent on whatever plain files happen to sit next to it (e.g. a pile of
  // environment/config files in the same folder as `src/`).
  const rank = (e: fs.Dirent) => (PRIORITY_FILES.has(e.name) ? 0 : e.isDirectory() ? 1 : 2);
  const sorted = entries.sort((a, b) => rank(a) - rank(b));

  for (const entry of sorted) {
    if (IGNORE.has(entry.name)) continue;
    if (entry.name.startsWith('.') && !PRIORITY_FILES.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(cwd, fullPath);

    if (entry.isDirectory()) {
      const nested = collectFiles(fullPath, cwd, depth + 1, budget);
      results.push(...nested);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (!CODE_EXTENSIONS.has(ext) && !PRIORITY_FILES.has(entry.name)) continue;

      try {
        const raw = fs.readFileSync(fullPath, 'utf-8');
        const truncated = raw.slice(0, MAX_FILE_CHARS);
        const lines = raw.split('\n').length;

        budget.remaining -= truncated.length;
        results.push({ path: relPath, content: truncated, lines });

        if (budget.remaining <= 0) break;
      } catch {
        // binary or unreadable — skip
      }
    }
  }

  return results;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function scanCodebase(cwd: string): CodebaseSnapshot {
  const tree = buildTree(cwd);
  const budget = { remaining: MAX_TOTAL_CHARS };
  const files = collectFiles(cwd, cwd, 0, budget);
  const allEntries = fs.readdirSync(cwd, { withFileTypes: true });
  const totalFiles = allEntries.filter((e) => e.isFile()).length;

  return {
    tree,
    files,
    totalFiles,
    skipped: budget.remaining <= 0 ? totalFiles - files.length : 0,
  };
}

export function scanSingleFile(filePath: string, cwd: string): ScannedFile {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return {
    path: path.relative(cwd, filePath),
    content: raw.slice(0, MAX_FILE_CHARS * 3), // more budget for single file
    lines: raw.split('\n').length,
  };
}

export function formatSnapshotForPrompt(snapshot: CodebaseSnapshot): string {
  const parts: string[] = [
    '## Directory Structure\n```\n' + snapshot.tree + '\n```',
  ];

  for (const file of snapshot.files) {
    const truncated = file.content.length < file.lines * 40;
    parts.push(
      `## ${file.path}${truncated ? ' (truncated)' : ''}\n\`\`\`\n${file.content}\n\`\`\``
    );
  }

  return parts.join('\n\n');
}
