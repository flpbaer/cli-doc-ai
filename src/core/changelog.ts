import fs from 'fs';
import path from 'path';

export interface ChangelogEntry {
  version: string;
  date: string;
  prNumber: string;
  prTitle: string;
  prAuthor: string;
  prUrl: string;
  summary: string;
}

/**
 * Reads the existing CHANGELOG file or returns a default header.
 */
export function readChangelog(filePath: string): string {
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8');
  }
  return '# Changelog\n\nAll notable changes to this project will be documented in this file.\n';
}

/**
 * Renders a single CHANGELOG entry block.
 */
export function renderEntry(entry: ChangelogEntry): string {
  const prLink = entry.prUrl
    ? `[#${entry.prNumber}](${entry.prUrl})`
    : `#${entry.prNumber}`;

  return (
    `## [${entry.version}] - ${entry.date}\n\n` +
    `> PR ${prLink} — **${entry.prTitle}** by @${entry.prAuthor}\n\n` +
    `${entry.summary}\n\n` +
    `---\n`
  );
}

/**
 * Prepends a new entry right after the first H1 heading, or at the top
 * of the file if no heading is found.
 */
export function prependEntry(existing: string, entry: string): string {
  const h1Match = existing.match(/^# .+\n(\n)?/m);

  if (h1Match?.index !== undefined) {
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

/**
 * Writes the updated CHANGELOG to disk, creating parent directories if needed.
 */
export function writeChangelog(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Full pipeline: read → prepend entry → write.
 * Returns the rendered entry string.
 */
export function updateChangelog(
  filePath: string,
  entry: ChangelogEntry
): string {
  const existing = readChangelog(filePath);
  const rendered = renderEntry(entry);
  const updated = prependEntry(existing, rendered);
  writeChangelog(filePath, updated);
  return rendered;
}
