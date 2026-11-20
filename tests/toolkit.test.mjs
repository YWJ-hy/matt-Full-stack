import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, symlinkSync, unlinkSync } from 'node:fs';
import { basename, join } from 'node:path';
import { source, version } from '../src/release.mjs';
import { get, put, repo, run, snapshot, temp } from './helpers.mjs';

const cli = (cwd, args, status = 0, release = source) => run(cwd, process.execPath, [join(release, 'bin/matt.mjs'), ...args], status);

test('新建工作区的父会话与派单可以离线解析所有显式调用和本地参考', () => {
  const work = temp('skills-'); repo(work, 'ui', true); repo(work, 'api', false);
  cli(work, ['init', '--apply']);
  const skills = '.agents/skills';
  const router = get(work, `${skills}/matt-full-stack/SKILL.md`);
  const prompts = get(work, `${skills}/matt-full-stack/references/dispatch.md`);
  const names = new Set([...`${router}\n${prompts}`.matchAll(/\$mattpocock-skills:([a-z-]+)/g)].map(match => match[1]));
  for (const name of ['grill-with-docs', 'grilling', 'domain-modeling', 'implement', 'tdd', 'code-review', 'diagnosing-bugs', 'codebase-design']) assert.ok(names.has(name), name);
  for (const name of names) {
    const installed = get(work, `${skills}/${name}/SKILL.md`);
    assert.equal(installed, get(source, `vendor/mattpocock/${name}/SKILL.md`));
    for (const link of installed.matchAll(/\[[^\]]+\]\(([\w./-]+\.md)\)/g)) assert.ok(existsSync(join(work, skills, name, link[1])), `${name}/${link[1]}`);
  }
  assert.ok(existsSync(join(work, skills, 'diagnosing-bugs/scripts/hitl-loop.template.sh')));
});

test('发现与幂等初始化：不改子仓、不接管已有父工程', () => {
  const work = temp('init-');
  const ui = repo(work, 'store', true), api = repo(work, 'billing', false);
  for (const dir of [ui, api]) snapshot(dir);
  put(work, 'AGENTS.md', '原有父指令\r\n'); put(work, 'package.json', '{"private":true}');
  const before = readdirSync(work);
  assert.match(cli(ui, ['init', '--apply'], 1), /共同父目录/); assert.ok(!existsSync(join(ui, '.matt')));
  const report = JSON.parse(cli(work, ['discover']));
  assert.equal(report.config.frontend.repo, 'store');
  assert.equal(report.config.backend.healthUrl, 'http://localhost:3040/healthz');
  assert.equal(report.config.backend.start, 'npm run dev');
  assert.match(cli(work, ['init']), /preview/); assert.deepEqual(readdirSync(work), before);
  cli(work, ['init', '--apply']);
  const mtime = statSync(join(work, '.matt/manifest.json')).mtimeMs;
  assert.match(cli(work, ['init', '--apply']), /changes=0/);
  assert.equal(statSync(join(work, '.matt/manifest.json')).mtimeMs, mtime);
  assert.ok(get(work, 'AGENTS.md').startsWith('原有父指令\r\n'));
  assert.equal(get(work, 'package.json'), '{"private":true}');
  unlinkSync(join(work, 'e2e/cases/environment.yaml'));
  assert.match(cli(work, ['update', '--apply']), /changes=0/);
  assert.ok(!existsSync(join(work, 'e2e/cases/environment.yaml')));
  for (const dir of [ui, api]) assert.equal(run(dir, 'git', ['status', '--porcelain']), '');
  repo(work, 'another', true);
  assert.equal(JSON.parse(cli(work, ['discover'])).config.frontend.repo, null);
});

test('旧版升级：预览无写入，冲突整批停止，保留合并和项目资产，再运行无变化', () => {
  const older = temp('old-tool-');
  for (const entry of ['bin', 'src', 'vendor', 'templates', 'AI_SETUP.md']) cpSync(join(source, entry), join(older, entry), { recursive: true, filter: path => basename(path) !== 'node_modules' });
  put(older, 'package.json', { version: '0.9.0', type: 'module' });
  put(older, 'AI_SETUP.md', '旧手册'); put(older, 'templates/model.env.example', '旧模板');
  const work = temp('upgrade-'); repo(work, 'ui', true); repo(work, 'api', false);
  cli(work, ['init', '--apply'], 0, older);
  const local = '.matt/AI_SETUP.md'; put(work, local, '本地合并的手册');
  const assets = ['spec/full-stack.md', 'e2e/cases/environment.yaml', 'e2e/matt.config.mjs', 'e2e/login.mjs', '.matt/workspace.json', '.matt/private/model.env'];
  for (const path of assets) put(work, path, `local: ${path}`);
  put(work, 'AGENTS.md', '原有\n' + get(work, 'AGENTS.md') + '尾部\n');
  const before = get(work, '.matt/manifest.json');
  for (const args of [['update'], ['update', '--apply']]) {
    assert.match(cli(work, args, 1), /CONFLICT .matt\/AI_SETUP.md/);
    assert.equal(get(work, '.matt/manifest.json'), before); assert.equal(get(work, '.matt/model.env.example'), '旧模板');
  }
  cli(work, ['update', '--apply', '--keep', local]);
  assert.equal(JSON.parse(get(work, '.matt/manifest.json')).version, version);
  assert.equal(get(work, local), '本地合并的手册');
  assert.equal(get(work, '.matt/model.env.example'), get(source, 'templates/model.env.example'));
  assert.match(get(work, 'AGENTS.md'), /^原有[\s\S]*尾部\n$/);
  for (const path of assets) assert.equal(get(work, path), `local: ${path}`);
  assert.match(cli(work, ['update', '--apply']), /changes=0/);
  assert.match(cli(work, ['update'], 1, older), /早于/);
});

test('碰撞与链接：不写入目标子仓，不覆盖无基线文件', () => {
  const work = temp('collision-'); const nested = repo(work, 'e2e', true); repo(work, 'api', false);
  assert.match(cli(work, ['init', '--apply'], 1), /路径/);
  assert.ok(!existsSync(join(nested, 'cases')));
  const linked = temp('link-'); repo(linked, 'ui', true); repo(linked, 'api', false);
  symlinkSync(nested, join(linked, 'spec'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.match(cli(linked, ['init', '--apply'], 1), /路径/); assert.ok(!existsSync(join(nested, 'full-stack.md')));
  const owned = temp('owned-'); repo(owned, 'ui', true); repo(owned, 'api', false); put(owned, '.matt/runtime/run.mjs', 'user file');
  assert.match(cli(owned, ['init', '--apply'], 1), /CONFLICT/); assert.equal(get(owned, '.matt/runtime/run.mjs'), 'user file');
  assert.ok(!existsSync(join(owned, '.matt/manifest.json')));
});

test('忽略凭据和报告；拒绝绕开保护段及错 cwd', () => {
  const work = temp('ignore-'); repo(work, 'ui', true); repo(work, 'api', false); run(work, 'git', ['init', '-q']); cli(work, ['init', '--apply']);
  for (const path of ['.matt/private/model.env', '.matt/private/state.json', '.matt/reports/run/result.json', 'e2e/midscene_run/report/report.html']) run(work, 'git', ['check-ignore', path]);
  put(work, '.gitignore', get(work, '.gitignore').replace('/.matt/private/', '# deleted'));
  assert.match(cli(work, ['update', '--apply', '--keep', '.gitignore'], 1), /CONFLICT/);
  mkdirSync(join(work, 'other')); assert.match(run(join(work, 'other'), process.execPath, ['../.matt/runtime/run.mjs', 'doctor'], 1), /父目录/);
});
