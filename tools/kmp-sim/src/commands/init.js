import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertKmpProject } from '../lib/project.js';
import { GITIGNORE } from '../lib/git.js';
import { ok, info, warn, dim } from '../lib/ui.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = join(__dirname, '..', '..', 'templates');

export const WORKFLOW_PATH = '.github/workflows/kmp-sim.yml';
export const GATE_PATH = '.github/kmp-sim/gate.cjs';
export const STREAM_PATH = '.github/kmp-sim/stream.sh';

const VERSION_RE = /kmp-sim-template-version:\s*(\d+)/;
const versionOf = (text) => Number(text.match(VERSION_RE)?.[1] ?? 0);

export function scaffold(cwd, { force = false } = {}) {
  let changed = false;

  for (const [rel, src] of [
    [WORKFLOW_PATH, 'kmp-sim.yml'],
    [GATE_PATH, 'gate.cjs'],
    [STREAM_PATH, 'stream.sh'],
  ]) {
    const dest = join(cwd, rel);
    const templatePath = join(TEMPLATES, src);

    if (!existsSync(templatePath)) {
      warn(`Template not found: ${templatePath}`);
      continue;
    }

    const template = readFileSync(templatePath, 'utf8');
    if (existsSync(dest) && !force) {
      const existing = readFileSync(dest, 'utf8');
      if (existing === template) continue;

      const [have, want] = [versionOf(existing), versionOf(template)];
      if (have >= want) {
        warn(`${rel} differs from the bundled template (kmp-sim init --force to overwrite)`);
        continue;
      }
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, template);
      ok(`updated ${rel} (template v${have} → v${want})`);
      changed = true;
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, template);
    ok(`wrote ${rel}`);
    changed = true;
  }

  const gitignore = join(cwd, '.gitignore');
  if (!existsSync(gitignore)) {
    writeFileSync(gitignore, GITIGNORE);
    ok('wrote .gitignore');
    changed = true;
  }

  return changed;
}

export async function init(cwd, flags) {
  assertKmpProject(cwd);
  const changed = scaffold(cwd, { force: flags.force });
  if (!changed) info('already initialized — nothing to do');
  console.log(`\nNext: ${dim('kmp-sim up')}`);
}
