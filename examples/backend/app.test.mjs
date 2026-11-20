import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from './app.mjs';

test('体验客服登录后能读取两张合成工单', async context => {
  const server = createApp().listen(0, '127.0.0.1');
  context.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/api/tickets`)).status, 401);
  const login = await fetch(`${base}/api/demo-session`, { method: 'POST' });
  assert.equal(login.status, 204);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const result = await fetch(`${base}/api/tickets`, { headers: { cookie } });
  assert.deepEqual((await result.json()).map(ticket => ticket.id), ['QA-101', 'QA-102']);
});
