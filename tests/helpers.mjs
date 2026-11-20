import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { source } from '../src/release.mjs';

export function temp(prefix) {
  mkdirSync(join(source, '.work'), { recursive: true });
  return mkdtempSync(join(source, '.work', prefix));
}
export function put(dir, name, value) {
  mkdirSync(dirname(join(dir, name)), { recursive: true });
  writeFileSync(join(dir, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}
export const get = (dir, name) => readFileSync(join(dir, name), 'utf8');
export function run(cwd, exe, args, status = 0) {
  const result = spawnSync(exe, args, { cwd, encoding: 'utf8', windowsHide: true });
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  if (result.status !== status) throw new Error(`${exe} ${args.join(' ')} => ${result.status}: ${result.error ?? output}`);
  return output;
}
export function repo(parent, name, frontend) {
  const path = join(parent, name);
  put(path, 'package.json', { name, private: true, scripts: { dev: 'node server.mjs' }, dependencies: frontend ? { vite: '*' } : { express: '*' } });
  put(path, 'README.md', frontend ? 'http://localhost:5173/' : 'http://localhost:3040/healthz');
  run(path, 'git', ['init', '-q']);
  return path;
}
export function snapshot(dir) {
  run(dir, 'git', ['add', '.']);
  run(dir, 'git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=.unused-hooks', 'commit', '-qm', 'Synthetic test fixture']);
}
