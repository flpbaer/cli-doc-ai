import fs from 'fs';
import path from 'path';
import { execa } from 'execa';

/**
 * Attempts to detect the current project version from common manifest files
 * or the latest git tag. Falls back to the provided fallback string.
 */
export async function detectVersion(
  cwd: string,
  fallback = 'unreleased'
): Promise<string> {
  // 1. package.json
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
        version?: string;
      };
      if (pkg.version) return pkg.version;
    } catch {
      // ignore parse errors
    }
  }

  // 2. pyproject.toml
  const pyprojectPath = path.join(cwd, 'pyproject.toml');
  if (fs.existsSync(pyprojectPath)) {
    const match = fs
      .readFileSync(pyprojectPath, 'utf-8')
      .match(/^version\s*=\s*"(.+?)"/m);
    if (match) return match[1];
  }

  // 3. Cargo.toml
  const cargoPath = path.join(cwd, 'Cargo.toml');
  if (fs.existsSync(cargoPath)) {
    const match = fs
      .readFileSync(cargoPath, 'utf-8')
      .match(/^version\s*=\s*"(.+?)"/m);
    if (match) return match[1];
  }

  // 4. Latest git tag
  try {
    const { stdout } = await execa('git', [
      'describe',
      '--tags',
      '--abbrev=0',
    ]);
    if (stdout.trim()) return stdout.trim();
  } catch {
    // no tags
  }

  return fallback;
}
