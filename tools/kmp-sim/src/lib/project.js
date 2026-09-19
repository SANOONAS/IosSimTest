import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

/** Throws unless `cwd` looks like a KMP project. */
export function assertKmpProject(cwd) {
  const gradlePath = join(cwd, 'build.gradle.kts');
  const sharedPath = join(cwd, 'app', 'shared');

  if (!existsSync(gradlePath)) {
    throw new Error(`No build.gradle.kts in ${cwd} — run kmp-sim from a KMP project root.`);
  }

  if (!existsSync(sharedPath)) {
    throw new Error(`No app/shared directory in ${cwd} — kmp-sim targets KMP projects with this structure.`);
  }

  // Check if it's the ChilBro project specifically or has a similar structure
  return { name: basename(cwd) };
}

export function defaultRepoName(cwd) {
  return basename(cwd).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'kmp-app';
}
