import { readFileSync } from 'node:fs';
import { defineNode, z } from '@midscene/test';
import { defineFileSetup, defineTestProject } from '@midscene/test/config';
import { createMidsceneNodes } from '@midscene/test/midscene';
import { PlaywrightAgent } from '@midscene/web/playwright/agent';
import { chromium } from 'playwright';
import { systemEnv } from './system-env.mjs';

export function project({ session = {}, prepare = async () => {}, nodes = [] } = {}) {
  const workspace = JSON.parse(readFileSync('.matt/workspace.json', 'utf8'));
  const fileSetup = defineFileSetup({ name: 'isolated-browser', async setup({ onTeardown }) {
    const browser = await chromium.launch({ env: systemEnv() });
    onTeardown(() => browser.close());
    const context = await browser.newContext({ ...session, baseURL: workspace.frontend.baseUrl });
    const page = await context.newPage();
    await prepare({ page, context, workspace });
    const state = { page, workspace };
    onTeardown(async () => { await state.agent?.destroy(); });
    return state;
  } });
  return defineTestProject({
    projects: [{ name: 'chromium', fileSetup, files: { include: ['cases/**/*.{yaml,yml}'] }, maxConcurrentFiles: 1 }],
    output: { reportDir: '../.matt/reports/html' },
    nodes: [
      ...createMidsceneNodes({ agentClass: PlaywrightAgent, getAgent: ({ context }) => context.agent ??= new PlaywrightAgent(context.page) }),
      defineNode({ name: 'app.open', description: '打开前端同源业务路径', stringInputKey: 'path', inputSchema: z.object({ path: z.string() }),
        async execute({ input, context }) {
          const base = new URL(context.workspace.frontend.baseUrl);
          const url = new URL(input.path, base);
          if (!['http:', 'https:'].includes(url.protocol) || url.origin !== base.origin || url.username || url.password) throw new Error('需要同源测试地址');
          const result = await context.page.goto(url.href, { waitUntil: 'domcontentloaded' });
          if (!result?.ok()) throw new Error(`导航失败：HTTP ${result?.status()}`);
        } }),
      defineNode({ name: 'app.visible', description: '检查可见 DOM 元素，可选精确文本', inputSchema: z.object({ selector: z.string(), text: z.string().optional() }),
        async execute({ input, context }) {
          const element = context.page.locator(input.selector);
          await element.waitFor({ state: 'visible', timeout: 10000 });
          if (input.text !== undefined && (await element.innerText()).trim() !== input.text) throw new Error('可见文本与预期不符');
        } }),
      ...nodes,
    ],
  });
}
