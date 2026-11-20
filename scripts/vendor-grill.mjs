import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { skillFiles } from '../src/matt-skills.mjs';

const revision = 'abeeaf95660ba9e8b7c753eb38f441ca707a8823';
const root = fileURLToPath(new URL('../vendor/mattpocock/', import.meta.url));
const paths = {
  LICENSE: 'LICENSE',
  ...Object.fromEntries(skillFiles.map(({ source, local }) => [source, local])),
};
for (const [source, dest] of Object.entries(paths)) {
  const response = await fetch(`https://raw.githubusercontent.com/mattpocock/skills/${revision}/${source}`);
  if (!response.ok) throw new Error(`${source} HTTP ${response.status}`);
  const target = join(root, dest);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
}
