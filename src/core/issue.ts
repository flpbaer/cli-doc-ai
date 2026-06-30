import { execa } from 'execa';

export interface GitHubIssue {
  title: string;
  body: string;
  url: string;
}

/**
 * Fetches a GitHub issue via the `gh` CLI.
 * `ref` can be an issue number, "owner/repo#123", or a full issue URL.
 */
export async function fetchGitHubIssue(ref: string): Promise<GitHubIssue> {
  try {
    const { stdout } = await execa('gh', [
      'issue', 'view', ref,
      '--json', 'title,body,url',
    ]);
    const data = JSON.parse(stdout) as GitHubIssue;
    return data;
  } catch (err) {
    throw new Error(
      `Could not fetch issue "${ref}" via the gh CLI. ` +
      `Make sure "gh" is installed and authenticated (gh auth login), or paste the task manually instead.\n` +
      `Underlying error: ${(err as Error).message}`
    );
  }
}
