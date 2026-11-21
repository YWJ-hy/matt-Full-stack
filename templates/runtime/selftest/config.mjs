import { randomUUID } from 'node:crypto';
import { defineNode, z } from '@midscene/test';
import { defineFileSetup, defineTestProject } from '@midscene/test/config';
import { chromium } from 'playwright';
import { systemEnv } from '../system-env.mjs';

const frontend = process.env.MATT_SELFTEST_FRONTEND;
const backend = process.env.MATT_SELFTEST_BACKEND;
const fileSetup = defineFileSetup({ name: 'fixture-browser', async setup({ onTeardown }) {
  const browser = await chromium.launch({ env: systemEnv() });
  onTeardown(() => browser.close());
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET' && (url.origin === frontend || (url.origin === backend && url.pathname === '/__matt_selftest/marker'))) return route.continue();
    return route.abort();
  });
  return { page: await context.newPage() };
} });

export default defineTestProject({
  projects: [{ name: 'selftest', fileSetup, files: { include: ['environment.yaml'] } }],
  output: { reportDir: process.env.MATT_SELFTEST_REPORT },
  nodes: [defineNode({ name: 'fixture.readMarker', description: '核对本次隔离后端的 HTTP 响应和页面显示', inputSchema: z.object({}),
    async execute({ context: { page } }) {
      const run = randomUUID();
      const path = `/__matt_selftest/marker?run=${run}`;
      const expected = await fetch(backend + path, { redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (!expected.ok) throw new Error(`后端夹具返回 HTTP ${expected.status}`);
      const { marker } = await expected.json();
      if (typeof marker !== 'string' || !marker.endsWith(`:${run}`) || marker.length <= run.length + 1) throw new Error('后端夹具未返回本次标记');
      const entry = `${frontend}/__matt_selftest.html?run=${run}`;
      const [api, navigation] = await Promise.all([
        page.waitForResponse(response => [frontend + path, backend + path].includes(response.url()), { timeout: 10000 }),
        page.goto(entry, { waitUntil: 'domcontentloaded', timeout: 10000 }),
      ]);
      if (!navigation?.ok() || page.url() !== entry) throw new Error('前端夹具入口不可用或被重定向');
      if (!api.ok() || (await api.json()).marker !== marker) throw new Error('前端收到的标记与指定后端不符，请核对代理或 API 地址');
      await page.locator('[data-matt-marker]').and(page.getByText(marker, { exact: true })).waitFor({ state: 'visible', timeout: 10000 });
    } })],
});
