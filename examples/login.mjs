export const session = {};

export async function prepare({ page, workspace }) {
  const origin = new URL(workspace.frontend.baseUrl);
  if (origin.hostname !== '127.0.0.1') throw new Error('体验登录需要本机前端地址');
  const response = await page.request.post(new URL('/api/demo-session', origin).href);
  if (response.status() !== 204) throw new Error(`体验登录失败，HTTP ${response.status()}`);
}
