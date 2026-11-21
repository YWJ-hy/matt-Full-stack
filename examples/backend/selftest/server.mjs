import { randomUUID } from 'node:crypto';
import express from 'express';

const instance = randomUUID();
const app = express();
app.get('/__matt_selftest/marker', (request, response) => {
  const run = request.query.run;
  if (typeof run !== 'string' || !/^[a-f0-9-]{36}$/.test(run)) return response.sendStatus(400);
  response.set('Cache-Control', 'no-store').json({ marker: `${instance}:${run}` });
});
const server = app.listen(Number(process.argv[2] ?? 4274), '127.0.0.1', () => {
  const { port } = server.address();
  console.log(`Express 内存夹具已启动：127.0.0.1:${port}`);
  process.send?.(port);
});
