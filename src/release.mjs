import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const source = fileURLToPath(new URL('../', import.meta.url));
export const version = JSON.parse(readFileSync(join(source, 'package.json'))).version;
const runtimeFiles = names => Object.fromEntries(names.map(name => [`.matt/runtime/${name}`, `templates/runtime/${name}`]));
export const managed = {
  ...runtimeFiles(['run.mjs', 'workflow.mjs', 'system-env.mjs', 'sessions.mjs']),
  '.matt/AI_SETUP.md': 'AI_SETUP.md',
  '.agents/skills/matt-full-stack/SKILL.md': 'templates/matt-full-stack/SKILL.md',
  '.agents/skills/matt-full-stack/references/dispatch.md': 'templates/matt-full-stack/references/dispatch.md',
  '.agents/skills/matt-full-stack/references/issues.md': 'templates/matt-full-stack/references/issues.md',
  '.agents/skills/matt-full-stack/references/review.md': 'templates/matt-full-stack/references/review.md',
  '.agents/skills/matt-full-stack/references/worktrees.md': 'templates/matt-full-stack/references/worktrees.md',
};
export const e2eManaged = {
  ...runtimeFiles(['package.json', 'package-lock.json', 'project.mjs', 'selftest/environment.yaml', 'selftest/config.mjs']),
  '.matt/model.env.example': 'templates/model.env.example',
};
export const blocks = { 'AGENTS.md': 'templates/instructions.md', '.gitignore': 'templates/ignores.txt' };
export const seeds = {
  '.matt/sessions.json': 'templates/sessions.json',
  ...Object.fromEntries(['shared.md', 'frontend.md', 'backend.md', 'delivery.md'].map(name => [`spec/_templates/${name}`, `templates/spec/${name}`])),
};
export const e2eSeeds = {
  'e2e/matt.config.mjs': 'templates/matt.config.mjs',
  'e2e/login.mjs': 'templates/login.mjs',
};
