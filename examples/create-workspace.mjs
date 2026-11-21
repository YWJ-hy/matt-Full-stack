import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { askE2e, parseE2eOption } from '../src/e2e-option.mjs';

const examples = fileURLToPath(new URL('.', import.meta.url));

async function create() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { e2e: { type: 'string' } } });
  if (positionals.length !== 1) throw new Error('用法：node examples/create-workspace.mjs <新目录> [--e2e off|on]');
  const enabled = parseE2eOption(values.e2e) ?? await askE2e();
  const workspace = resolve(positionals[0]);
  mkdirSync(workspace);
  for (const role of ['frontend', 'backend']) {
    const repo = join(workspace, role);
    cpSync(join(examples, role), repo, {
      recursive: true,
      filter: file => !['.git', 'node_modules', 'dist'].includes(basename(file)) && (enabled || basename(file) !== 'selftest'),
    });
    const git = args => execFileSync('git', args, { cwd: repo, stdio: 'inherit' });
    git(['init', '-q']);
    git(['add', '--', '.']);
    git(['-c', 'user.name=Matt Demo', '-c', 'user.email=demo@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=.unused-hooks', 'commit', '-qm', 'Start ticket desk exercise']);
  }
  const cli = fileURLToPath(new URL('../bin/matt.mjs', import.meta.url));
  execFileSync(process.execPath, [cli, 'init', '--apply', '--e2e', enabled ? 'on' : 'off'], { cwd: workspace, stdio: 'inherit' });
  cpSync(join(examples, 'REQUIREMENT.md'), join(workspace, 'REQUIREMENT.md'));
  if (enabled) {
    mkdirSync(join(workspace, 'e2e/cases'), { recursive: true });
    cpSync(join(examples, 'baseline.yaml'), join(workspace, 'e2e/cases/ticket-list.yaml'));
    cpSync(join(examples, 'login.mjs'), join(workspace, 'e2e/login.mjs'));
  }
  console.log(`在 ${workspace} 完成上述环境步骤后，新开需求会话：$matt-full-stack 实现 REQUIREMENT.md 中的「客服领取工单」。`);
}

try { await create(); } catch (error) { console.error(error.message); process.exitCode = 1; }
