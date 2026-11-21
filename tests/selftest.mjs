import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { source } from '../src/release.mjs';
import { systemEnv } from '../templates/runtime/system-env.mjs';
import { get, put, run, temp } from './helpers.mjs';

const work = join(temp('selftest-'), 'workspace');
const services = [];
async function start(role, ...args) {
  const cwd = join(work, role);
  const service = fork(join(cwd, 'selftest/server.mjs'), ['0', ...args], { cwd, env: systemEnv(), windowsHide: true });
  services.push(service);
  const [port] = await once(service, 'message', { signal: AbortSignal.timeout(10000) });
  return String(port);
}
try {
  console.log(`隔离体验工作区：${work}`);
  run(source, process.execPath, ['examples/create-workspace.mjs', work, '--e2e', 'on']);
  for (const dir of ['frontend', 'backend', '.matt/runtime']) {
    run(work, process.execPath, [process.env.npm_execpath, 'ci', '--prefix', dir, '--ignore-scripts', '--no-audit', '--no-fund']);
  }
  put(work, '.matt/workspace.json', 'must not load business configuration');
  put(work, 'e2e/login.mjs', 'throw new Error("must not log in")');
  put(work, 'e2e/cases/canary.yaml', 'must not collect business cases');
  put(work, '.matt/private/model.env', 'BUSINESS_ONLY=must-not-load');
  const invoke = (args, status = 0) => run(work, process.execPath, ['.matt/runtime/run.mjs', ...args], status);
  invoke(['chromium']);
  const backend = await start('backend');
  const frontend = await start('frontend', backend);
  console.log(invoke(['selftest', frontend, backend]));
  const otherBackend = await start('backend');
  const mismatch = invoke(['selftest', frontend, otherBackend], 1);
  assert.match(mismatch, /前端收到的标记与指定后端不符/);
  console.log(mismatch);
  const reports = readdirSync(join(work, '.matt/reports')).filter(name => name.startsWith('selftest-'));
  assert.equal(reports.length, 2);
  const results = reports.map(report => {
    const dir = join(work, '.matt/reports', report);
    assert.ok(readdirSync(join(dir, 'html')).some(name => name.endsWith('.html')));
    const [runId] = readdirSync(dir).filter(name => name !== 'html');
    return JSON.parse(get(dir, `${runId}/summary.json`)).status;
  });
  assert.deepEqual(results.sort(), ['failed', 'success']);
} finally {
  for (const service of services) service.kill();
}
