import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { source } from '../src/release.mjs';
import { systemEnv } from '../templates/runtime/system-env.mjs';
import { get, put, repo, run, snapshot, temp } from './helpers.mjs';

const work = temp('browser-');
const services = [];
async function start(dir, env) {
  const child = fork(join(dir, 'server.mjs'), [], { cwd: dir, env: { ...systemEnv(), ...env }, windowsHide: true });
  services.push(child);
  const [port] = await once(child, 'message', { signal: AbortSignal.timeout(10000) });
  return `http://127.0.0.1:${port}`;
}
const invoke = (args, status = 0) => run(work, process.execPath, ['.matt/runtime/run.mjs', ...args], status);
try {
  console.log(`临时消费工作区：${work}`);
  const ui = repo(work, 'store', true), api = repo(work, 'sales', false);
  put(api, 'server.mjs', get(source, 'tests/fixtures/backend.mjs')); snapshot(api);
  put(ui, 'server.mjs', get(source, 'tests/fixtures/frontend.mjs')); snapshot(ui);
  const password = randomUUID(), order = `QA-${randomUUID().slice(0, 8)}`;
  const backend = await start(api, { FIXTURE_PASSWORD: password, FIXTURE_ORDER: order });
  const frontend = await start(ui, { FIXTURE_BACKEND: backend });
  run(work, process.execPath, [join(source, 'bin/matt.mjs'), 'init', '--apply', '--e2e', 'on']);
  const config = JSON.parse(get(work, '.matt/workspace.json'));
  Object.assign(config.frontend, { baseUrl: frontend, healthUrl: frontend });
  Object.assign(config.backend, { baseUrl: backend, healthUrl: backend + '/healthz' });
  put(work, '.matt/workspace.json', config);
  put(work, '.matt/private/test-account', password);
  put(work, 'e2e/login.mjs', `import {readFileSync} from 'node:fs';
export const session = {};
export async function prepare({page, workspace}) {
  const res = await page.request.post(workspace.frontend.baseUrl+'/session', { data: readFileSync('.matt/private/test-account','utf8') });
  if (!res.ok()) throw new Error('Test account login failed');
}`);
  const orderYaml = expected => `cases:\n  - name: Read authenticated order\n    steps:\n      - app.open: /orders\n      - app.visible:\n          selector: output:not(:empty)\n          text: ${expected}\n`;
  put(work, 'e2e/cases/order.yaml', orderYaml(order));
  if (!process.env.npm_execpath) throw new Error('请从 npm run test:browser 启动');
  console.log(run(work, process.execPath, [process.env.npm_execpath, 'ci', '--prefix', '.matt/runtime', '--ignore-scripts', '--no-audit', '--no-fund']));
  console.log(invoke(['chromium']), invoke(['doctor']), invoke(['nodes']));
  assert.equal((await fetch(backend + '/api/order')).status, 401);
  console.log(invoke(['test']));
  put(work, 'e2e/cases/order.yaml', orderYaml('WRONG-EXPECTED-CODE'));
  console.log(invoke(['test', 'e2e/cases/order.yaml'], 1));
  put(work, 'e2e/cases/order.yaml', orderYaml(order));
  const receipts = readdirSync(join(work, '.matt/reports')).filter(name => name !== 'html').map(name => JSON.parse(get(work, `.matt/reports/${name}/receipt.json`)));
  assert.deepEqual(receipts.map(receipt => receipt.result).sort(), ['runner-failed', 'runner-passed']);
  for (const receipt of receipts) for (const role of ['frontend', 'backend']) {
    assert.match(receipt.checkoutBefore[role].sha, /^[0-9a-f]{40}$/); assert.equal(receipt.checkoutAfter[role].dirty, false);
  }
  console.log('已验证：无登录 401、浏览器授权读回、错误预期返回非零、版本留证。');
} finally {
  for (const service of services) service.kill();
}
