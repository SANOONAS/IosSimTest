import { sh, shx } from './proc.js';

export function requireAuth() {
  const check = process.platform === 'win32' ? 'where' : 'which';
  if (!sh(check, ['gh']).ok) {
    throw new Error('GitHub CLI not found. Install it: https://cli.github.com/');
  }
  if (!sh('gh', ['auth', 'status']).ok) {
    throw new Error('Not logged in to GitHub. Run: gh auth login');
  }
}

export function api(path, extra = []) {
  const r = sh('gh', ['api', path, ...extra]);
  if (!r.ok) return null;
  try {
    return JSON.parse(r.out);
  } catch {
    return null;
  }
}

export function nameWithOwner(cwd) {
  const r = sh('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], { cwd });
  return r.ok ? r.out : null;
}

export function createRepo(cwd, name, { isPublic, branch }) {
  const args = [
    'repo', 'create', name,
    isPublic ? '--public' : '--private',
    '--source=.', '--remote=origin', '--push',
  ];
  shx('gh', args, { cwd });
  sh('git', ['branch', '--set-upstream-to', `origin/${branch}`, branch], { cwd });
  return nameWithOwner(cwd);
}

export function repoExists(cwd) {
  return nameWithOwner(cwd) !== null;
}

export function isPublicRepo(cwd) {
  const r = sh('gh', ['repo', 'view', '--json', 'visibility', '-q', '.visibility'], { cwd });
  return r.ok && r.out.toUpperCase() === 'PUBLIC';
}

export async function dispatch(cwd, workflow, ref, inputs, { attempts = 12 } = {}) {
  const args = ['workflow', 'run', workflow, '--ref', ref];
  for (const [k, v] of Object.entries(inputs)) args.push('-f', `${k}=${v}`);

  let last;
  for (let i = 0; i < attempts; i++) {
    const r = sh('gh', args, { cwd });
    if (r.ok) return;
    last = r.err || r.out;
    if (!/could not find|not found|404|does not exist/i.test(last)) break;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`Could not dispatch ${workflow} on ${ref}:\n${last}`);
}

export async function waitForWorkflowRegistration(cwd, repo, path, { timeoutMs = 180000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = api(`repos/${repo}/actions/workflows`);
    if (list?.workflows?.some((w) => w.path === path)) return true;
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
  return false;
}

export function findRun(cwd, workflow, session) {
  const r = sh('gh', [
    'run', 'list', '--workflow', workflow, '--limit', '25',
    '--json', 'databaseId,displayTitle,status,conclusion,url,createdAt',
  ], { cwd });
  if (!r.ok) return null;
  let runs;
  try {
    runs = JSON.parse(r.out);
  } catch {
    return null;
  }
  return runs.find((run) => run.displayTitle?.includes(session)) ?? null;
}

export function getRun(cwd, id) {
  const r = sh('gh', [
    'run', 'view', String(id),
    '--json', 'databaseId,status,conclusion,url,displayTitle,jobs',
  ], { cwd });
  if (!r.ok) return null;
  try {
    return JSON.parse(r.out);
  } catch {
    return null;
  }
}

export function inFlightRuns(cwd, workflow) {
  const r = sh('gh', [
    'run', 'list', '--workflow', workflow, '--limit', '50',
    '--json', 'databaseId,status,displayTitle,url',
  ], { cwd });
  if (!r.ok) return [];
  try {
    return JSON.parse(r.out).filter((run) => run.status !== 'completed');
  } catch {
    return [];
  }
}

export async function waitForArtifact(cwd, repo, runId, name, { timeoutMs = 45 * 60 * 1000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = api(`repos/${repo}/actions/runs/${runId}/artifacts`);
    const hit = list?.artifacts?.find((a) => a.name === name && !a.expired);
    if (hit) return hit;
    const run = getRun(cwd, runId);
    if (run?.status === 'completed' && run.conclusion !== 'success') {
      throw new Error(`run finished (${run.conclusion}) without producing ${name}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
  throw new Error(`timed out waiting for artifact ${name}`);
}

export function downloadArtifact(cwd, runId, name, dir) {
  shx('gh', ['run', 'download', String(runId), '-n', name, '-D', dir], { cwd });
}

export function setSecret(cwd, name, value) {
  const r = sh('gh', ['secret', 'set', name], { cwd, input: value });
  if (!r.ok) throw new Error(`could not set ${name}: ${r.err || r.out}`);
}

export function listSecrets(cwd) {
  const r = sh('gh', ['secret', 'list', '--json', 'name', '-q', '.[].name'], { cwd });
  return r.ok ? r.out.split('\n').filter(Boolean) : [];
}

export function cancelRun(cwd, id) {
  return sh('gh', ['run', 'cancel', String(id)], { cwd }).ok;
}

export function readStatus(cwd, repo, sha, context) {
  const list = api(`repos/${repo}/commits/${sha}/statuses`, ['--jq', '.']);
  if (!Array.isArray(list)) return null;
  return list.find((s) => s.context === context) ?? null;
}
