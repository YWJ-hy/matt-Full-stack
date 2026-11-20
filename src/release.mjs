import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const source = fileURLToPath(new URL('../', import.meta.url));
export const version = JSON.parse(readFileSync(join(source, 'package.json'))).version;
const runtime = ['package.json', 'package-lock.json', 'project.mjs', 'run.mjs', 'system-env.mjs', 'sessions.mjs'];
export const managed = {
  ...Object.fromEntries(runtime.map(name => [`.matt/runtime/${name}`, `templates/runtime/${name}`])),
  '.matt/AI_SETUP.md': 'AI_SETUP.md',
  '.matt/model.env.example': 'templates/model.env.example',
  '.agents/skills/matt-full-stack/SKILL.md': 'templates/matt-full-stack/SKILL.md',
  '.agents/skills/matt-full-stack/references/dispatch.md': 'templates/matt-full-stack/references/dispatch.md',
};
export const blocks = { 'AGENTS.md': 'templates/instructions.md', '.gitignore': 'templates/ignores.txt' };
export const seeds = {
  '.matt/sessions.json': 'templates/sessions.json',
  'spec/full-stack.md': 'templates/spec.md',
  'e2e/cases/environment.yaml': 'templates/environment.yaml',
  'e2e/matt.config.mjs': 'templates/matt.config.mjs',
  'e2e/login.mjs': 'templates/login.mjs',
};
