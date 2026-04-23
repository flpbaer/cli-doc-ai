import { execa } from 'execa';

export interface GitContext {
  commits: string;
  diffStat: string;
  diffContent: string;
}

const DIFF_EXTENSIONS = [
  '*.ts', '*.tsx', '*.js', '*.jsx',
  '*.py', '*.go', '*.java', '*.cs', '*.rb',
  '*.json', '*.yaml', '*.yml', '*.toml', '*.md',
];

const MAX_DIFF_CHARS = 12_000;

/**
 * Collects git context between two refs.
 * Falls back to origin/main..HEAD when refs are not provided.
 */
export async function collectGitContext(
  baseSha?: string,
  headSha?: string
): Promise<GitContext> {
  const range =
    baseSha && headSha ? `${baseSha}..${headSha}` : 'origin/main..HEAD';

  const commits = await safeExec(
    'git',
    ['log', '--pretty=format:%h %s', range],
    '(no commits found)'
  );

  const diffStat = await safeExec(
    'git',
    ['diff', '--stat', range],
    '(no diff stat found)'
  );

  const rawDiff = await safeExec(
    'git',
    ['diff', range, '--', ...DIFF_EXTENSIONS],
    ''
  );

  const diffContent = rawDiff.slice(0, MAX_DIFF_CHARS);

  return { commits, diffStat, diffContent };
}

/**
 * Returns the remote URL of origin, used to infer the repo name.
 */
export async function getRepoName(): Promise<string> {
  try {
    const { stdout } = await execa('git', [
      'remote',
      'get-url',
      'origin',
    ]);
    // git@github.com:user/repo.git  OR  https://github.com/user/repo.git
    const match = stdout.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    return match ? match[1] : stdout.trim();
  } catch {
    return 'local';
  }
}

async function safeExec(
  cmd: string,
  args: string[],
  fallback: string
): Promise<string> {
  try {
    const { stdout } = await execa(cmd, args);
    return stdout.trim() || fallback;
  } catch {
    return fallback;
  }
}
