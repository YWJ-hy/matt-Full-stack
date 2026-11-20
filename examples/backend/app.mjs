import express from 'express';
import { randomUUID } from 'node:crypto';

export function createApp() {
  const app = express();
  const session = randomUUID();
  const tickets = [
    { id: 'QA-101', title: '更换收货地址', owner: null },
    { id: 'QA-102', title: '查询退款进度', owner: '客服乙' },
  ];
  app.get('/healthz', (request, response) => response.json({ ready: true }));
  app.post('/api/demo-session', (request, response) => {
    response.cookie('desk_demo', session, { httpOnly: true, sameSite: 'strict', path: '/api' });
    response.sendStatus(204);
  });
  app.use('/api', (request, response, next) => {
    if (request.headers.cookie?.split(/;\s*/).includes(`desk_demo=${session}`)) return next();
    response.sendStatus(401);
  });
  app.get('/api/tickets', (request, response) => response.json(tickets));
  return app;
}
