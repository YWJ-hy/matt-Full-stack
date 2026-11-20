import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const token = randomUUID();
const server = createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json');
  if (request.url === '/healthz') return response.end('{}');
  if (request.url === '/session' && request.method === 'POST') {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    if (Buffer.concat(chunks).toString() === process.env.FIXTURE_PASSWORD) {
      response.setHeader('Set-Cookie', `fixture=${token}; HttpOnly; SameSite=Strict; Path=/`);
      return response.end('{}');
    }
  }
  if (request.url === '/api/order' && request.headers.cookie === `fixture=${token}`) return response.end(JSON.stringify({ code: process.env.FIXTURE_ORDER }));
  response.writeHead(401); response.end('{}');
});
server.listen(0, '127.0.0.1', () => process.send(server.address().port));
