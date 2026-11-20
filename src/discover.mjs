import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';

function text(dir, name) {
  const file = join(dir, name);
  const stat = lstatSync(file, { throwIfNoEntry: false });
  return stat?.isFile() && stat.size < 524288 ? readFileSync(file, 'utf8') : '';
}

function inspect(dir, repo) {
  const names = readdirSync(dir);
  let pkg = {};
  try { pkg = JSON.parse(text(dir, 'package.json') || '{}') ?? {}; } catch {}
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const frontend = deps.some(name => ['vite', 'next', 'react', 'vue', '@angular/core', 'nuxt'].includes(name));
  const backend = deps.some(name => ['express', 'koa', 'fastify', '@nestjs/core', 'hono'].includes(name)) ||
    ['pom.xml', 'build.gradle', 'manage.py', 'go.mod', 'requirements.txt', 'pyproject.toml'].some(name => names.includes(name));
  const role = frontend === backend ? null : frontend ? 'frontend' : 'backend';
  const pm = pkg.packageManager?.split('@')[0] || (names.includes('pnpm-lock.yaml') ? 'pnpm' : names.includes('yarn.lock') ? 'yarn' : names.includes('bun.lock') ? 'bun' : 'npm');
  const script = ['dev', 'start:dev', 'serve', 'start'].find(name => typeof pkg.scripts?.[name] === 'string');
  let start = script ? `${pm} run ${script}` : null;
  if (!start && names.includes('manage.py')) start = 'python manage.py runserver';
  if (!start && names.includes('mvnw') && text(dir, 'pom.xml').includes('spring-boot')) start = './mvnw spring-boot:run';
  if (!start && names.some(name => /^(docker-)?compose\.ya?ml$/.test(name))) start = 'docker compose up';
  const docs = names.filter(name => /^readme(?:\.md)?$/i.test(name)).map(name => text(dir, name)).join('\n');
  const urls = [...new Set(docs.match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+(?:\/[\w/.-]*)?/g) || [])];
  const health = urls.filter(url => /\/(?:healthz?|readyz?|actuator\/health)\/?$/i.test(url));
  const ports = [...new Set(urls.map(url => new URL(url).origin))];
  const flag = pkg.scripts?.[script]?.match(/(?:--port(?:=|\s+)|\bPORT=)(\d+)\b/);
  const baseUrl = ports.length === 1 ? ports[0] : flag ? `http://localhost:${flag[1]}` : !ports.length && deps.includes('vite') ? 'http://localhost:5173' : !ports.length && deps.includes('next') ? 'http://localhost:3000' : null;
  return { repo, role, start, baseUrl, healthUrl: health.length === 1 ? health[0] : role === 'frontend' ? baseUrl : null };
}

export function discover(root) {
  const candidates = readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory() && !entry.name.startsWith('.') &&
    lstatSync(join(root, entry.name, '.git'), { throwIfNoEntry: false })).map(entry => inspect(join(root, entry.name), entry.name));
  const config = {};
  for (const role of ['frontend', 'backend']) {
    const matches = candidates.filter(candidate => candidate.role === role);
    const { repo, start, baseUrl, healthUrl } = matches.length === 1 ? matches[0] : {};
    config[role] = { repo: repo ?? null, start: start ?? null, baseUrl: baseUrl ?? null, healthUrl: healthUrl ?? null };
  }
  return { candidates, config };
}
