import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as git from '../lib/git.js';
import * as gh from '../lib/gh.js';
import { sh, sleep, open as openUrl } from '../lib/proc.js';
import { assertKmpProject, defaultRepoName } from '../lib/project.js';
import { scaffold, WORKFLOW_PATH } from './init.js';
import { saveSession } from '../lib/session.js';
import { info, ok, warn, step, spinner, bold, dim, cyan, green } from '../lib/ui.js';

const WORKFLOW = 'kmp-sim.yml';

export async function up(cwd, flags) {
  const platform = flags.platform ?? 'android';
  assertKmpProject(cwd);
  gh.requireAuth();

  step('Preparing repository');

  if (!git.isRepo(cwd)) {
    git.init(cwd);
    ok('git init');
  }

  const branch = git.currentBranch(cwd);
  const message = flags.message ?? `kmp-sim: ${new Date().toISOString()}`;

  if (git.isDirty(cwd) || !git.hasCommits(cwd)) {
    git.commitAll(cwd, message);
    ok(`committed on ${bold(branch)}`);
  } else {
    info(`working tree clean on ${bold(branch)}`);
  }

  let repo = gh.nameWithOwner(cwd);
  if (!repo) {
    const name = flags.repo ?? defaultRepoName(cwd);
    const isPublic = Boolean(flags.public);
    step(`Creating ${isPublic ? 'public' : 'private'} repo ${bold(name)}`);
    if (!isPublic) {
      warn(`private repos bill macOS/Linux minutes at higher rates — use ${dim('--public')} for free minutes`);
    }
    repo = gh.createRepo(cwd, name, { isPublic, branch });
    ok(`created ${repo}`);
  } else {
    git.push(cwd, branch);
    ok(`pushed to ${repo}`);
  }

  if (scaffold(cwd) || git.isDirty(cwd)) {
    git.commitAll(cwd, 'kmp-sim: add simulator streaming workflow');
    git.push(cwd, branch);
    ok('pushed kmp-sim workflow');
  }

  await assertWorkflowIsDispatchable(cwd, repo, branch);
  await ensureRegistered(cwd, repo, branch);

  const sha = git.headSha(cwd);
  const session = randomBytes(4).toString('hex');
  const gateToken = randomBytes(24).toString('base64url');
  const context = `kmp-sim/${session}`;

  step('Dispatching build');

  await gh.dispatch(cwd, WORKFLOW, branch, {
    session,
    gate_token: gateToken,
    minutes: String(flags.minutes ?? 30),
    cache: String(flags.cache !== false)
  });

  const run = await waitForRun(cwd, session);
  ok(`run ${cyan(run.url)}`);
  saveSession(cwd, { session, runId: run.databaseId, sha, repo, context, url: run.url });

  const base = await waitForStream(cwd, { repo, sha, context, runId: run.databaseId });
  const url = `${base.replace(/\/$/, '')}/?k=${gateToken}`;

  console.log('');
  console.log(`  ${green('●')} ${bold(platform === 'ios' ? 'Simulator' : 'Emulator')} is live`);
  console.log(`  ${url}`);
  console.log('');
  console.log(dim(`  Anyone with that link can drive the ${platform === 'ios' ? 'simulator' : 'emulator'}.`));
  console.log(dim(`  Stop it early with: kmp-sim down`));
  console.log('');

  if (flags.open !== false) openUrl(url);
  return url;
}

async function assertWorkflowIsDispatchable(cwd, repo, branch) {
  const meta = gh.api(`repos/${repo}`);
  const defaultBranch = meta?.default_branch ?? 'main';
  if (branch === defaultBranch) return;

  const onDefault = gh.api(`repos/${repo}/contents/${WORKFLOW_PATH}?ref=${defaultBranch}`);
  if (onDefault) return;

  throw new Error(
    `${WORKFLOW_PATH} is not on the default branch (${defaultBranch}).\n` +
      `GitHub only exposes workflow_dispatch for workflows present there.\n` +
      `Merge ${branch} into ${defaultBranch}, or run kmp-sim from ${defaultBranch}.`,
  );
}

async function ensureRegistered(cwd, repo, branch) {
  const spin = spinner('waiting for GitHub to register the workflow');
  try {
    if (await gh.waitForWorkflowRegistration(cwd, repo, WORKFLOW_PATH, { timeoutMs: 120000 })) return;

    spin.update('nudging GitHub to rescan the workflow');
    const file = join(cwd, WORKFLOW_PATH);
    const body = readFileSync(file, 'utf8').replace(/\n# kmp-sim-revision:.*\n$/, '\n');
    writeFileSync(file, `${body}# kmp-sim-revision: ${Date.now()}\n`);
    git.commitAll(cwd, 'kmp-sim: refresh workflow registration');
    git.push(cwd, branch);

    if (await gh.waitForWorkflowRegistration(cwd, repo, WORKFLOW_PATH, { timeoutMs: 120000 })) return;
  } finally {
    spin.stop();
  }
  throw new Error(
    `GitHub never registered ${WORKFLOW_PATH}.\n` +
      `Check that Actions is enabled: https://github.com/${repo}/settings/actions`,
  );
}

async function waitForRun(cwd, session) {
  const spin = spinner('waiting for GitHub to queue the run');
  for (let i = 0; i < 40; i++) {
    const run = gh.findRun(cwd, WORKFLOW, session);
    if (run) {
      spin.stop();
      return run;
    }
    await sleep(3000);
  }
  spin.stop();
  throw new Error('GitHub never queued the run. Check: gh run list --workflow kmp-sim.yml');
}

async function waitForStream(cwd, { repo, sha, context, runId }) {
  const spin = spinner('starting runner');
  const deadline = Date.now() + 45 * 60 * 1000;

  try {
    while (Date.now() < deadline) {
      const status = gh.readStatus(cwd, repo, sha, context);
      if (status?.state === 'success' && status.target_url) return status.target_url;

      const run = gh.getRun(cwd, runId);
      if (run?.status === 'completed') {
        throw new Error(
          `Run finished (${run.conclusion}) without publishing a stream URL.\n` +
            `Logs: gh run view ${runId} --log-failed`,
        );
      }
      spin.update(describe(run));
      await sleep(5000);
    }
  } finally {
    spin.stop();
  }
  throw new Error('Timed out after 45 minutes waiting for the stream URL.');
}

function describe(run) {
  const job = run?.jobs?.[0];
  if (!job) return 'waiting for a runner';
  const active = job.steps?.find((s) => s.status === 'in_progress');
  const done = job.steps?.filter((s) => s.status === 'completed').length ?? 0;
  const total = job.steps?.length ?? 0;
  return active ? `${active.name} ${dim(`(${done}/${total})`)}` : `${job.status.replace('_', ' ')}`;
}
