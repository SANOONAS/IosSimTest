import { spawnSync, spawn } from 'node:child_process';
import { platform } from 'node:os';

/** Run a command, capture output. Never throws. */
export function sh(cmd, args = [], opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  return {
    ok: r.status === 0,
    code: r.status,
    out: (r.stdout ?? '').trim(),
    err: (r.stderr ?? '').trim(),
  };
}

/** Run a command, capture output, throw on non-zero. */
export function shx(cmd, args = [], opts = {}) {
  const r = sh(cmd, args, opts);
  if (!r.ok) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${r.code})\n${r.err || r.out}`);
  }
  return r.out;
}

/** Run a command with inherited stdio (user sees live output). */
export function run(cmd, args = [], opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited ${r.status}`);
}

export function has(cmd) {
  const check = platform() === 'win32' ? 'where' : 'which';
  return sh(check, [cmd]).ok;
}

export function open(url) {
  const cmd = platform() === 'win32' ? 'explorer' : (platform() === 'darwin' ? 'open' : 'xdg-open');
  spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref();
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
