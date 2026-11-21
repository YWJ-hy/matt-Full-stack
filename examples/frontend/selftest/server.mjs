import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const backendPort = Number(process.argv[3] ?? 4274);
const frontendPort = Number(process.argv[2] ?? 4273);
if (!Number.isInteger(backendPort) || backendPort < 1 || backendPort > 65535) throw new Error('需要本机后端夹具端口');
const root = fileURLToPath(new URL('./page/', import.meta.url));
const server = await createServer({
  root, configFile: false, envDir: false, publicDir: false, appType: 'mpa',
  server: { host: '127.0.0.1', port: frontendPort, strictPort: frontendPort !== 0, hmr: false,
    fs: { allow: [root] }, proxy: { '/__matt_selftest/marker': `http://127.0.0.1:${backendPort}` } },
});
await server.listen();
const { port } = server.httpServer.address();
console.log(`Vite 隔离测试页已启动：127.0.0.1:${port}`);
process.send?.(port);
