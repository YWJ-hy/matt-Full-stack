import { createServer } from 'node:http';

const server = createServer(async (request, response) => {
  if (['/api/order', '/session'].includes(request.url)) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const upstream = await fetch(process.env.FIXTURE_BACKEND + request.url, { method: request.method, headers: { cookie: request.headers.cookie ?? '' }, body: chunks.length ? Buffer.concat(chunks) : undefined });
    for (const cookie of upstream.headers.getSetCookie()) response.setHeader('Set-Cookie', cookie);
    response.writeHead(upstream.status); return response.end(await upstream.text());
  }
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(`<main><h1>QA fixture</h1><output></output></main><script>
    fetch('/api/order').then(async response => {
      document.querySelector('output').textContent = response.ok ? (await response.json()).code : 'unauthorized';
    });</script>`);
});
server.listen(0, '127.0.0.1', () => process.send(server.address().port));
