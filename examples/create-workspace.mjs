import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const examples = fileURLToPath(new URL('.', import.meta.url));

function create() {
  if (process.argv.length !== 3) throw new Error('用法：node examples/create-workspace.mjs <新目录>');
  const workspace = resolve(process.argv[2]);
  mkdirSync(workspace);
  for (const role of ['frontend', 'backend']) {
    const repo = join(workspace, role);
    cpSync(join(examples, role), repo, {
      recursive: true,
      filter: file => !['.git', 'node_modules', 'dist'].includes(basename(file)),
    });
    const git = args => execFileSync('git', args, { cwd: repo, stdio: 'inherit' });
    git(['init', '-q']);
    git(['add', '--', '.']);
    git(['-c', 'user.name=Matt Demo', '-c', 'user.email=demo@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=.unused-hooks', 'commit', '-qm', 'Start ticket desk exercise']);
  }
  const cli = fileURLToPath(new URL('../bin/matt.mjs', import.meta.url));
  execFileSync(process.execPath, [cli, 'init', '--apply'], { cwd: workspace, stdio: 'inherit' });
  cpSync(join(examples, 'REQUIREMENT.md'), join(workspace, 'REQUIREMENT.md'));
  cpSync(join(examples, 'baseline.yaml'), join(workspace, 'e2e/cases/ticket-list.yaml'));
  cpSync(join(examples, 'login.mjs'), join(workspace, 'e2e/login.mjs'));
  console.log(`请在 ${workspace} 打开父会话并发送：请按 $matt-full-stack 完成 REQUIREMENT.md，先验证工单列表基线，再分别派发前后端并验收。`);
}

try { create(); } catch (error) { console.error(error.message); process.exitCode = 1; }
