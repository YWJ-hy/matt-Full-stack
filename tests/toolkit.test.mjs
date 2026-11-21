import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readdirSync, realpathSync, statSync, symlinkSync, unlinkSync } from 'node:fs';
import { basename, join } from 'node:path';
import { source, version } from '../src/release.mjs';
import { skillSources } from '../src/matt-skills.mjs';
import { get, put, repo, run, snapshot, temp } from './helpers.mjs';

const cli = (cwd, args, status = 0, release = source) => run(cwd, process.execPath, [join(release, 'bin/matt.mjs'), ...args], status);

test('两种模式保留父层约定；独立工作树各角色按完整引用读取父层工单，而非子仓同号单', () => {
  const work = temp('parent-matt-');
  const ui = repo(work, 'ui', true), api = repo(work, 'api', false);
  const ticket = '.scratch/claim/issues/123-claim.md';
  for (const dir of [ui, api]) { put(dir, ticket, `#123 in ${basename(dir)}`); snapshot(dir); }
  const docs = ['docs/agents/issue-tracker.md', 'docs/agents/domain.md'];
  const setup = '$mattpocock-skills:setup-matt-pocock-skills';
  assert.ok(cli(work, ['init', '--e2e', 'off', '--apply']).includes(setup));
  for (const path of docs) assert.ok(!existsSync(join(work, path)));
  for (const path of docs) put(work, path, `workspace convention: ${path}`);
  put(work, ticket, '#123 领取后刷新保留处理人');
  const block = '\n## Agent skills\n' + docs.join('\n') + '\n';
  put(work, 'AGENTS.md', get(work, 'AGENTS.md') + block);
  assert.ok(cli(work, ['update', '--e2e', 'on', '--apply']).includes(setup));
  const checkout = join(temp('implementation-'), 'worktree');
  run(ui, 'git', ['worktree', 'add', '--detach', checkout, 'HEAD']);
  const plans = JSON.parse(run(checkout, process.execPath, [join(work, '.matt/runtime/sessions.mjs')]));
  assert.equal(get(checkout, ticket), '#123 in ui');
  for (const role of ['frontend', 'backend', 'standards', 'spec']) {
    assert.equal(plans[role].workspaceRoot, work);
    for (const path of docs) assert.equal(get(plans[role].workspaceRoot, path), `workspace convention: ${path}`);
    assert.equal(get(plans[role].workspaceRoot, ticket), '#123 领取后刷新保留处理人');
  }
  assert.ok(get(work, 'AGENTS.md').endsWith(block));
  assert.ok(!existsSync(join(work, '.git')));
  for (const dir of [ui, api]) assert.equal(run(dir, 'git', ['status', '--porcelain']), '');
});

test('仅开发：不安装 E2E 资产，仍可派单；预览和切换模式不丢项目文件', () => {
  const work = join(temp('dispatch-'), 'demo');
  run(source, process.execPath, ['examples/create-workspace.mjs', work, '--e2e', 'off']);
  const path = '.matt/workflow.json';
  const enabled = () => JSON.parse(get(work, path)).e2e.enabled;
  assert.equal(enabled(), false);
  for (const file of ['e2e', '.matt/runtime/package.json', '.matt/runtime/node_modules', '.matt/runtime/selftest', 'frontend/selftest', 'backend/selftest', '.matt/model.env.example']) assert.ok(!existsSync(join(work, file)), file);
  assert.equal(JSON.parse(run(work, process.execPath, ['.matt/runtime/sessions.mjs', 'frontend'])).role, 'frontend');
  const invoke = args => run(work, process.execPath, ['.matt/runtime/run.mjs', ...args], 1);
  for (const command of ['setup', 'selftest', 'chromium', 'model-config', 'model', 'doctor', 'nodes', 'test']) assert.match(invoke([command]), /已关闭 E2E/);
  assert.ok(!existsSync(join(work, '.matt/reports')));
  const spec = '已确认的接口契约'; put(work, 'spec/ticket.md', spec);
  const sessions = get(work, '.matt/sessions.json');
  assert.match(cli(work, ['update', '--e2e', 'on']), /seed e2e\/matt.config.mjs/);
  assert.equal(enabled(), false);
  cli(work, ['update', '--e2e', 'on', '--apply']);
  assert.equal(enabled(), true);
  assert.match(invoke(['setup', '4273', '4274']), /MIDSCENE_MODEL_API_KEY/);
  const assets = ['e2e/cases/ticket.yaml', 'e2e/login.mjs', '.matt/private/model.env'];
  for (const file of assets) put(work, file, `local: ${file}`);
  cli(work, ['update', '--e2e', 'off', '--apply']);
  assert.equal(enabled(), false);
  assert.match(cli(work, ['init', '--apply']), /changes=0/);
  assert.match(invoke(['test']), /已关闭 E2E/);
  cli(work, ['update', '--e2e', 'on', '--apply']);
  for (const file of assets) assert.equal(get(work, file), `local: ${file}`);
  assert.equal(get(work, '.matt/sessions.json'), sessions);
  assert.equal(get(work, 'spec/ticket.md'), spec);
});

test('首次非交互安装需明确选择；非法配置和丢失选择不会静默开启模型', () => {
  const work = temp('choice-'); repo(work, 'ui', true); repo(work, 'api', false);
  assert.match(cli(work, ['init', '--apply'], 1), /请选择模式/);
  assert.match(cli(work, ['init', '--e2e', 'maybe', '--apply'], 1), /on 或 off/);
  assert.ok(!existsSync(join(work, '.matt')));
  cli(work, ['init', '--apply', '--e2e', 'off']);
  const path = '.matt/workflow.json';
  put(work, path, { e2e: { enabled: 'false' } });
  assert.match(cli(work, ['update', '--apply'], 1), /布尔值/);
  assert.match(run(work, process.execPath, ['.matt/runtime/run.mjs', 'model'], 1), /布尔值/);
  unlinkSync(join(work, path));
  assert.match(cli(work, ['update', '--apply'], 1), /缺少 .matt\/workflow.json/);
  cli(work, ['update', '--e2e', 'off', '--apply']);
  assert.equal(JSON.parse(get(work, path)).e2e.enabled, false);
});

test('体验环境必须补齐模型、验证模型和隔离链路才能完成初始化', () => {
  const work = join(temp('model-setup-'), 'demo');
  const created = run(source, process.execPath, ['examples/create-workspace.mjs', work, '--e2e', 'on']);
  assert.match(created, /模型.*隔离/);
  put(work, '.matt/workspace.json', 'must not read business settings');
  const invoke = (args, status = 0) => run(work, process.execPath, ['.matt/runtime/run.mjs', ...args], status);
  const setup = ['setup', '4273', '4274'];
  const missing = invoke(setup, 1);
  for (const field of ['BASE_URL', 'NAME', 'FAMILY', 'API_KEY']) assert.match(missing, new RegExp(`MIDSCENE_MODEL_${field}`));
  const path = '.matt/private/model.env';
  const partial = 'MIDSCENE_MODEL_BASE_URL=https://fixture.invalid/v1\nMIDSCENE_MODEL_NAME=fixture\nMIDSCENE_MODEL_API_KEY=test-only-value\n';
  put(work, path, partial + 'MIDSCENE_MODEL_FAMILY=" "\n');
  const incomplete = invoke(['model-config'], 1);
  assert.match(incomplete, /MIDSCENE_MODEL_FAMILY/);
  assert.doesNotMatch(incomplete, /MIDSCENE_MODEL_API_KEY|test-only-value/);
  put(work, path, partial + 'MIDSCENE_MODEL_FAMILY=fixture\n');
  invoke(['model-config']);
  const stub = '.matt/runtime/node_modules/@midscene/test/bin/midscene-test';
  put(work, stub, `console.error(process.env.MIDSCENE_MODEL_API_KEY); process.exit(1)`);
  const rejected = invoke(setup, 1);
  assert.match(rejected, /模型验证失败/);
  assert.doesNotMatch(rejected, /test-only-value|初始化完成/);
  assert.equal(existsSync(join(work, '.matt/reports')), false);
  const guard = `const args = process.argv.slice(2); if (args.join(' ') === 'model verify') process.exit(process.env.MIDSCENE_MODEL_API_KEY === 'test-only-value' ? 0 : 1); if (args[0] !== 'environment.yaml' || process.env.MIDSCENE_MODEL_API_KEY) process.exit(2);`;
  put(work, stub, guard + 'process.exit(1)');
  assert.doesNotMatch(invoke(setup, 1), /初始化完成/);
  put(work, stub, guard);
  assert.match(invoke(setup), /初始化完成/);
});

test('环境自测必须指定两个独立本机测试端口，不回退到业务配置', () => {
  const work = temp('isolated-'); repo(work, 'ui', true); repo(work, 'api', false);
  cli(work, ['init', '--apply', '--e2e', 'on']);
  put(work, '.matt/workspace.json', '业务配置不应读取');
  for (const args of [[], ['4273', '4273'], ['https://example.org', '4274'], ['0', '65536']]) {
    assert.match(run(work, process.execPath, ['.matt/runtime/run.mjs', 'selftest', ...args], 1), /独立.*端口/);
  }
});

test('按角色生成会话计划，切换工具映射并拒绝无效配置', () => {
  const work = temp('sessions-'); repo(work, 'ui', true); repo(work, 'api', false);
  cli(work, ['init', '--apply', '--e2e', 'off']);
  const command = (args = [], status = 0) => run(join(work, 'ui'), process.execPath, [join(work, '.matt/runtime/sessions.mjs'), ...args], status);
  const defaults = JSON.parse(command());
  assert.equal(defaults.backend.model, 'inherit');
  assert.equal(defaults.frontend.worktree, false);
  assert.equal(defaults.standards.access, 'read-only');
  assert.equal(defaults.spec.freshContext, true);
  const path = '.matt/sessions.json';
  const roles = { frontend: { model: '@coding', worktree: true }, spec: { model: 'fixed-model' } };
  put(work, path, { version: 1, roles });
  assert.equal(JSON.parse(command(['spec'])).model, 'fixed-model');
  command(['frontend'], 1);
  put(work, '.matt/private/models.json', { coding: 'model-A' });
  put(work, '.matt/private/alternate.json', { coding: 'model-B' });
  const first = JSON.parse(command()).frontend;
  assert.equal(first.model, 'model-A'); assert.equal(first.worktree, true);
  assert.equal(JSON.parse(command(['frontend', '--models', '.matt/private/alternate.json'])).model, 'model-B');
  const custom = get(work, path);
  assert.match(cli(work, ['update', '--apply']), /changes=0/);
  assert.equal(get(work, path), custom);
  for (const invalid of [{ frontend: { worktree: 'false' } }, { typo: {} }, { spec: { modle: 'oops' } }]) {
    put(work, path, { version: 1, roles: invalid }); command([], 1);
  }
});

test('新建工作区只注册父工作流，随包 skill 及引用完整，其他工作流使用宿主入口', () => {
  const work = temp('skills-'); repo(work, 'ui', true); repo(work, 'api', false);
  cli(work, ['init', '--apply', '--e2e', 'off']);
  const skills = '.agents/skills';
  const router = get(work, `${skills}/matt-full-stack/SKILL.md`);
  const prompts = get(work, `${skills}/matt-full-stack/references/dispatch.md`);
  const review = get(work, `${skills}/matt-full-stack/references/review.md`);
  assert.ok(router.includes('(references/review.md)') && prompts.includes('(review.md)'));
  assert.ok(router.includes('(references/issues.md)') && review.includes('(issues.md)'));
  assert.equal(get(work, `${skills}/matt-full-stack/references/issues.md`), get(source, 'templates/matt-full-stack/references/issues.md'));
  const skillNames = text => new Set([...text.matchAll(/\$mattpocock-skills:([a-z-]+)/g)].map(match => match[1]));
  const names = skillNames(`${router}\n${prompts}\n${review}`);
  const automatic = skillNames([router, prompts, review].join('\n').split('\n').filter(line => !line.startsWith('> 手动入口：')).join('\n'));
  for (const [directory, files] of Object.entries(skillSources)) {
    const name = basename(directory);
    assert.ok(names.has(name), name);
    for (const file of files) assert.ok(existsSync(join(source, 'vendor/mattpocock', name, file)), `${name}/${file}`);
    const reference = get(source, `vendor/mattpocock/${name}/SKILL.md`);
    if (/^disable-model-invocation: true$/m.test(reference)) assert.ok(!automatic.has(name), `${name} 只能由用户调用`);
    for (const link of reference.matchAll(/\[[^\]]+\]\(([\w./-]+\.md)\)/g)) assert.ok(existsSync(join(source, 'vendor/mattpocock', name, link[1])), `${name}/${link[1]}`);
  }
  for (const name of ['research', 'prototype', 'pr']) assert.ok(router.includes(`$mattpocock-skills:${name}`), name);
  assert.deepEqual(readdirSync(join(work, skills)), ['matt-full-stack']);
});

test('独立审查：按安装指南在指定仓解析同名 main，补丁和提交使用本仓分支点', () => {
  const work = temp('standalone-review-');
  const ui = repo(work, 'client app', true), api = repo(work, 'service', false);
  cli(work, ['init', '--apply', '--e2e', 'off']);
  const config = JSON.parse(get(work, '.matt/workspace.json'));
  const guide = get(work, '.agents/skills/matt-full-stack/references/review.md');
  const commands = [...guide.matchAll(/`git -C "<checkout>" ([^`]+)`/g)].map(match => match[1].replaceAll('"', '').split(' '));
  const origins = [];
  for (const [role, dir] of [['frontend', ui], ['backend', api]]) {
    snapshot(dir);
    const git = (...args) => run(dir, 'git', args).trim();
    git('branch', '-M', 'main');
    const origin = git('rev-parse', 'HEAD'); origins.push(origin);
    git('branch', 'feature');
    put(dir, 'main-only', role); snapshot(dir);
    const main = git('rev-parse', 'HEAD');
    git('checkout', '-q', 'feature');
    put(dir, `${role}-only`, role); snapshot(dir);
    const head = git('rev-parse', 'HEAD');
    const checkout = join(work, config[role].repo);
    const params = { '<基线ref>^{commit}': 'main^{commit}', '<基线SHA>': main, '<待审SHA>': head };
    const invoke = key => run(work, 'git', ['-C', checkout, ...commands.find(args => args.includes(key)).map(arg => params[arg] ?? arg)]).trim();
    assert.equal(realpathSync(invoke('--show-toplevel')), realpathSync(dir));
    assert.equal(invoke('--verify'), main);
    const base = invoke('merge-base');
    assert.equal(base, origin);
    assert.equal(git('diff', '--name-only', `${base}...${head}`), `${role}-only`);
    put(dir, `${role}-only`, `${role} WIP`);
    assert.equal(git('diff', '--name-only', base), `${role}-only`);
  }
  assert.notEqual(origins[0], origins[1]);
  assert.ok(!existsSync(join(work, '.git')));
});

test('补丁审查：按安装指南获取最终差异，在基线 checkout 还原本单而不夹带其他改动', () => {
  const work = temp('patch-review-');
  const ui = repo(work, 'ui', true); repo(work, 'api', false); snapshot(ui);
  cli(work, ['init', '--apply', '--e2e', 'off']);
  const guide = get(work, '.agents/skills/matt-full-stack/references/review.md');
  const git = (...args) => run(ui, 'git', args);
  const base = git('rev-parse', 'HEAD').trim();
  put(ui, 'README.md', 'index only\n'); git('add', 'README.md');
  put(ui, 'README.md', 'final contents\n');
  put(ui, 'new test.txt', 'regression\n'); put(ui, 'unrelated.txt', 'not part of this task\n');
  const before = git('status', '--porcelain');
  assert.equal(git('diff', `${base}...HEAD`), '');

  const commands = [...guide.matchAll(/`git (diff [^`]+)`/g)].map(match => match[1].split(' '));
  const paths = { '<起始SHA>': base, '<本单路径…>': 'README.md', '<新文件>': 'new test.txt' };
  const render = args => args.map(arg => paths[arg] ?? arg);
  const tracked = git(...render(commands.find(args => args.includes('<本单路径…>'))));
  const added = run(ui, 'git', render(commands.find(args => args.includes('<新文件>'))), 1);
  put(work, 'change.patch', tracked + added);
  const checkout = join(work, 'review');
  git('worktree', 'add', '--detach', checkout, base);
  for (const options of [['--check'], []]) run(checkout, 'git', ['apply', ...options, join(work, 'change.patch')]);
  for (const path of ['README.md', 'new test.txt']) assert.equal(get(checkout, path), get(ui, path));
  assert.ok(!existsSync(join(checkout, 'unrelated.txt')));
  assert.equal(git('status', '--porcelain'), before);
  assert.equal(git('show', ':README.md'), 'index only\n');
});

test('升级按旧清单清理原样副本，整个保留本地定制的 skill', () => {
  const work = temp('dup-'); repo(work, 'ui', true); repo(work, 'api', false);
  cli(work, ['init', '--apply', '--e2e', 'on']);
  const manifest = JSON.parse(get(work, '.matt/manifest.json'));
  manifest.version = '1.2.0';
  for (const path of ['implement/SKILL.md', 'tdd/SKILL.md', 'tdd/tests.md', 'tdd/mocking.md']) {
    const body = get(source, `vendor/mattpocock/${path}`);
    const name = `.agents/skills/${path}`;
    put(work, name, body);
    manifest.files[name] = { upstream: createHash('sha256').update(body.replaceAll('\r\n', '\n')).digest('hex') };
  }
  put(work, '.matt/manifest.json', manifest);
  put(work, '.agents/skills/tdd/tests.md', 'project tests');
  put(work, '.agents/skills/code-review/SKILL.md', 'project review');
  assert.match(cli(work, ['update']), /remove-duplicate .*implement/);
  assert.ok(existsSync(join(work, '.agents/skills/implement/SKILL.md')));
  cli(work, ['update', '--apply']);
  assert.ok(!existsSync(join(work, '.agents/skills/implement/SKILL.md')));
  assert.ok(existsSync(join(work, '.agents/skills/tdd/SKILL.md')));
  assert.equal(get(work, '.agents/skills/tdd/tests.md'), 'project tests');
  assert.equal(get(work, '.agents/skills/code-review/SKILL.md'), 'project review');
  assert.match(cli(work, ['update']), /changes=0/);
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
  cli(work, ['init', '--apply', '--e2e', 'on']);
  const mtime = statSync(join(work, '.matt/manifest.json')).mtimeMs;
  assert.match(cli(work, ['init', '--apply']), /changes=0/);
  assert.equal(statSync(join(work, '.matt/manifest.json')).mtimeMs, mtime);
  assert.ok(get(work, 'AGENTS.md').startsWith('原有父指令\r\n'));
  assert.equal(get(work, 'package.json'), '{"private":true}');
  assert.ok(!existsSync(join(work, 'e2e/cases/environment.yaml')));
  unlinkSync(join(work, 'e2e/login.mjs'));
  assert.match(cli(work, ['update', '--apply']), /changes=0/);
  assert.ok(!existsSync(join(work, 'e2e/login.mjs')));
  for (const dir of [ui, api]) assert.equal(run(dir, 'git', ['status', '--porcelain']), '');
  repo(work, 'another', true);
  assert.equal(JSON.parse(cli(work, ['discover'])).config.frontend.repo, null);
});

test('旧版升级：预览无写入，冲突整批停止，保留合并和项目资产，再运行无变化', () => {
  const older = temp('old-tool-');
  for (const entry of ['bin', 'src', 'vendor', 'templates', 'AI_SETUP.md']) cpSync(join(source, entry), join(older, entry), { recursive: true, filter: path => basename(path) !== 'node_modules' });
  put(older, 'package.json', { version: '0.9.0', type: 'module' });
  put(older, 'AI_SETUP.md', '旧手册'); put(older, 'templates/model.env.example', '旧模板');
  put(older, 'templates/matt-full-stack/SKILL.md', '旧流程'); put(older, 'templates/instructions.md', '旧入口');
  const work = temp('upgrade-'); repo(work, 'ui', true); repo(work, 'api', false);
  cli(work, ['init', '--apply', '--e2e', 'on'], 0, older);
  const oldManifest = JSON.parse(get(work, '.matt/manifest.json'));
  oldManifest.seeded = oldManifest.seeded.filter(name => name !== '.matt/workflow.json');
  put(work, '.matt/manifest.json', oldManifest);
  unlinkSync(join(work, '.matt/workflow.json'));
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
  assert.equal(JSON.parse(get(work, '.matt/workflow.json')).e2e.enabled, true);
  assert.equal(JSON.parse(get(work, '.matt/manifest.json')).version, version);
  assert.equal(get(work, local), '本地合并的手册');
  assert.equal(get(work, '.matt/model.env.example'), get(source, 'templates/model.env.example'));
  assert.equal(get(work, '.agents/skills/matt-full-stack/SKILL.md'), get(source, 'templates/matt-full-stack/SKILL.md'));
  assert.ok(get(work, 'AGENTS.md').includes(get(source, 'templates/instructions.md').trimEnd()));
  assert.match(get(work, 'AGENTS.md'), /^原有[\s\S]*尾部\n$/);
  for (const path of assets) assert.equal(get(work, path), `local: ${path}`);
  assert.match(cli(work, ['update', '--apply']), /changes=0/);
  assert.match(cli(work, ['update'], 1, older), /早于/);
});

test('碰撞与链接：不写入目标子仓，不覆盖无基线文件', () => {
  const work = temp('collision-'); const nested = repo(work, 'e2e', true); repo(work, 'api', false);
  assert.match(cli(work, ['init', '--apply', '--e2e', 'on'], 1), /路径/);
  assert.ok(!existsSync(join(nested, 'cases')));
  const linked = temp('link-'); repo(linked, 'ui', true); repo(linked, 'api', false);
  symlinkSync(nested, join(linked, 'spec'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.match(cli(linked, ['init', '--apply', '--e2e', 'off'], 1), /路径/); assert.ok(!existsSync(join(nested, 'full-stack.md')));
  const owned = temp('owned-'); repo(owned, 'ui', true); repo(owned, 'api', false); put(owned, '.matt/runtime/run.mjs', 'user file');
  assert.match(cli(owned, ['init', '--apply', '--e2e', 'off'], 1), /CONFLICT/); assert.equal(get(owned, '.matt/runtime/run.mjs'), 'user file');
  assert.ok(!existsSync(join(owned, '.matt/manifest.json')));
});

test('忽略凭据和报告；拒绝绕开保护段及错 cwd', () => {
  const work = temp('ignore-'); repo(work, 'ui', true); repo(work, 'api', false); run(work, 'git', ['init', '-q']); cli(work, ['init', '--apply', '--e2e', 'on']);
  for (const path of ['.matt/private/model.env', '.matt/private/state.json', '.matt/reports/run/result.json', 'e2e/midscene_run/report/report.html']) run(work, 'git', ['check-ignore', path]);
  put(work, '.gitignore', get(work, '.gitignore').replace('/.matt/private/', '# deleted'));
  assert.match(cli(work, ['update', '--apply', '--keep', '.gitignore'], 1), /CONFLICT/);
  mkdirSync(join(work, 'other')); assert.match(run(join(work, 'other'), process.execPath, ['../.matt/runtime/run.mjs', 'doctor'], 1), /父目录/);
});
