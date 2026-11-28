import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, symlinkSync, unlinkSync } from 'node:fs';
import { basename, join } from 'node:path';
import { source, version } from '../src/release.mjs';
import { skillSources } from '../src/matt-skills.mjs';
import { get, put, repo, run, snapshot, temp } from './helpers.mjs';

const cli = (cwd, args, status = 0, release = source) => run(cwd, process.execPath, [join(release, 'bin/matt.mjs'), ...args], status);

test('团队首次选择后端，新同事克隆后按相对路径复用文档，初始化不写入子仓', () => {
  const work = temp('team-docs-'), ui = repo(work, 'ui', true), api = repo(work, 'api', false);
  put(ui, 'spec/example.test.js', '// test directory'); snapshot(ui);
  put(api, 'handbook/agents/issue-tracker.md', 'shared issue convention');
  put(api, 'handbook/agents/domain.md', 'shared domain convention');
  const docs = (...args) => JSON.parse(cli(work, ['docs', ...args]));
  assert.equal(docs().status, 'unconfigured');
  const choice = ['--owner', 'backend', '--agent-docs', 'handbook/agents', '--specs', 'requirements'];
  assert.equal(docs(...choice).status, 'proposed');
  assert.ok(!existsSync(join(api, '.matt-docs.json')));
  docs(...choice, '--apply');
  assert.deepEqual(JSON.parse(get(api, '.matt-docs.json')), { version: 1, agentDocs: 'handbook/agents', specs: 'requirements' });
  snapshot(api);
  const colleague = temp('colleague-');
  for (const dir of [ui, api]) run(colleague, 'git', ['clone', '-q', dir, basename(dir)]);
  const fresh = JSON.parse(cli(colleague, ['docs']));
  assert.equal(fresh.source, join(colleague, 'api', '.matt-docs.json'));
  assert.equal(fresh.specs, join(colleague, 'api', 'requirements'));
  assert.equal(fresh.agentDocs, join(colleague, 'api', 'handbook', 'agents'));
  cli(colleague, ['init', '--host', 'orca', '--apply']);
  const instructions = get(colleague, 'AGENTS.md');
  assert.ok(instructions.includes('node .matt/runtime/docs.mjs'));
  assert.doesNotMatch(instructions, /docs\/agents\/|handbook\/agents\/|api\/requirements/);
  assert.match(cli(colleague, ['update', '--host', 'orca']), /changes=0/);
  const actual = JSON.parse(run(ui, process.execPath, [join(colleague, '.matt/runtime/docs.mjs')]));
  assert.equal(actual.agentDocs, fresh.agentDocs);
  assert.equal(actual.specs, fresh.specs);
  assert.ok(existsSync(join(actual.fallbackTemplates, 'shared.md')));
  for (const role of ['ui', 'api']) assert.equal(run(join(colleague, role), 'git', ['status', '--porcelain']), '');
  assert.ok(!existsSync(actual.specs));
  assert.ok(!existsSync(join(colleague, 'spec')));
  unlinkSync(fresh.source);
  assert.match(cli(colleague, ['docs'], 1), /缺失/);
});

test('文档配置有歧义时列出实际目录，本机选择可复用，旧项目可跨仓继承约定', () => {
  const work = temp('docs-choice-'), ui = repo(work, 'ui', true), api = repo(work, 'api', false);
  const args = ['docs', '--owner', 'parent', '--local', '--agent-docs', 'api/handbook', '--specs', 'ui/product/specs'];
  cli(work, [...args, '--apply']);
  const local = JSON.parse(cli(work, ['docs']));
  assert.equal(local.agentDocs, join(api, 'handbook'));
  assert.equal(local.specs, join(ui, 'product', 'specs'));
  const config = { version: 1, agentDocs: 'docs/agents', specs: 'spec' };
  for (const repoRoot of [api, ui]) put(repoRoot, '.matt-docs.json', config);
  const conflict = JSON.parse(cli(work, ['docs'], 2));
  assert.equal(conflict.status, 'ambiguous');
  assert.deepEqual(conflict.candidates.map(item => item.specs), [join(ui, 'spec'), join(api, 'spec')]);
  assert.match(cli(work, ['init', '--host', 'orca', '--apply'], 1), /多份文档配置/);
  cli(work, ['docs', '--owner', 'backend', '--apply']);
  assert.equal(JSON.parse(cli(work, ['docs'])).specs, join(api, 'spec'));
  assert.deepEqual(JSON.parse(get(ui, '.matt-docs.json')), config);
  for (const invalid of ['../other', 'C:/external', '.git/hooks']) {
    put(api, '.matt-docs.json', { ...config, specs: invalid });
    assert.match(cli(work, ['docs'], 1), /路径/);
  }
  symlinkSync(ui, join(api, 'elsewhere'), process.platform === 'win32' ? 'junction' : 'dir');
  put(api, '.matt-docs.json', { ...config, specs: 'elsewhere/spec' });
  assert.match(cli(work, ['docs'], 1), /链接/);
});

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

test('按 Orca 指南首次安装直接采用团队默认值，重复运行沿用项目选择', () => {
  const work = temp('orca-onboarding-'); repo(work, 'ui', true); repo(work, 'api', false);
  const init = ['init', '--host', 'orca'];
  const plan = () => JSON.parse(run(work, process.execPath, ['.matt/runtime/run.mjs', 'plan']));
  assert.match(cli(work, init), /e2e.enabled=false.*e2e.provider=orca/);
  assert.ok(!existsSync(join(work, '.matt')));
  cli(work, [...init, '--apply']);
  assert.deepEqual(plan(), { enabled: false, provider: 'orca' });
  const roles = JSON.parse(run(work, process.execPath, ['.matt/runtime/sessions.mjs', '--host', 'orca']));
  for (const [role, settings] of Object.entries(roles)) {
    assert.equal(settings.worktree, ['frontend', 'backend'].includes(role));
    assert.equal(settings.modelSource, 'bot-default');
    assert.equal(settings.model, null);
  }
  assert.match(cli(work, init), /changes=0/);
  const sessions = '.matt/sessions.json';
  put(work, sessions, { version: 1, roles: { frontend: { model: 'team-model', worktree: false } } });
  const local = get(work, sessions);
  cli(work, ['update', '--host', 'orca', '--e2e', 'on', '--e2e-provider', 'midscene', '--apply']);
  assert.match(cli(work, [...init, '--apply']), /changes=0/);
  assert.equal(get(work, sessions), local);
  assert.deepEqual(plan(), { enabled: true, provider: 'midscene' });
});

test('Orca 首次启用走原生浏览器；切换工具和开关互相独立，Midscene 资产可复用', () => {
  const work = temp('orca-provider-'); repo(work, 'ui', true); repo(work, 'api', false);
  cli(work, ['init', '--apply', '--e2e', 'off']);
  put(work, '.matt/orca.json', { projectId: 'ticket' });
  const plan = () => JSON.parse(run(work, process.execPath, ['.matt/runtime/run.mjs', 'plan']));
  const midsceneConfig = 'e2e/matt.config.mjs';
  assert.match(cli(work, ['update', '--e2e', 'on']), /e2e.provider=orca/);
  assert.deepEqual(plan(), { enabled: false, provider: null });
  cli(work, ['update', '--apply', '--e2e', 'on']);
  assert.deepEqual(plan(), { enabled: true, provider: 'orca' });
  for (const file of [midsceneConfig, '.matt/runtime/package.json', '.matt/model.env.example']) assert.ok(!existsSync(join(work, file)));
  assert.ok(existsSync(join(work, '.agents/skills/matt-full-stack/references/acceptance.md')));
  assert.match(run(work, process.execPath, ['.matt/runtime/run.mjs', 'test'], 1), /Orca 原生浏览器/);
  assert.ok(!existsSync(join(work, '.matt/reports')));

  cli(work, ['update', '--e2e-provider', 'midscene', '--apply']);
  assert.deepEqual(plan(), { enabled: true, provider: 'midscene' });
  assert.ok(existsSync(join(work, midsceneConfig)));
  put(work, midsceneConfig, '// project settings');
  cli(work, ['update', '--e2e-provider', 'orca', '--e2e', 'off', '--apply']);
  assert.deepEqual(plan(), { enabled: false, provider: 'orca' });
  cli(work, ['update', '--e2e', 'on', '--apply']);
  assert.deepEqual(plan(), { enabled: true, provider: 'orca' });
  cli(work, ['update', '--e2e-provider', 'midscene', '--apply']);
  assert.equal(get(work, midsceneConfig), '// project settings');
  assert.match(cli(work, ['update']), /changes=0/);
});

test('Orca 团队中的旧 enabled:true 仍运行 Midscene，配置错误不触发其他工具', () => {
  const work = temp('legacy-provider-'); repo(work, 'ui', true); repo(work, 'api', false);
  cli(work, ['init', '--apply', '--e2e', 'on']);
  const path = '.matt/workflow.json';
  put(work, '.matt/orca.json', { projectId: 'ticket' });
  put(work, path, { owner: 'project', e2e: { enabled: true } });
  const yaml = 'e2e/cases/legacy.yaml';
  put(work, yaml, 'cases: []');
  put(work, '.matt/runtime/node_modules/@midscene/test/bin/midscene-test', "if (!process.argv[2].endsWith('legacy.yaml')) process.exit(1); console.log('ran legacy.yaml');");
  assert.match(run(work, process.execPath, ['.matt/runtime/run.mjs', 'test', yaml]), /ran legacy.yaml/);
  cli(work, ['update', '--apply']);
  const upgraded = get(work, path);
  assert.deepEqual(JSON.parse(upgraded), { owner: 'project', e2e: { enabled: true, provider: 'midscene' } });
  assert.match(run(work, process.execPath, ['.matt/runtime/run.mjs', 'test', yaml]), /ran legacy.yaml/);
  assert.match(cli(work, ['update', '--apply', '--e2e-provider', 'other'], 1), /orca 或 midscene/);
  assert.equal(get(work, path), upgraded);
  put(work, path, { e2e: { enabled: true, provider: null } });
  assert.match(run(work, process.execPath, ['.matt/runtime/run.mjs', 'test', yaml], 1), /orca 或 midscene/);
});

test('分端规格模板可在仅开发模式使用；升级保留旧规格以及项目自己的模板和评审稿', () => {
  const work = temp('split-spec-'); repo(work, 'ui', true); repo(work, 'api', false);
  const names = ['shared.md', 'frontend.md', 'backend.md', 'delivery.md', 'tasks.md', 'task.md', 'api.md', 'acceptance.md'];
  cli(work, ['init', '--apply', '--e2e', 'off']);
  for (const name of names) assert.equal(get(work, `spec/_templates/${name}`), get(source, `templates/spec/${name}`));
  assert.deepEqual(readdirSync(join(work, 'spec')), ['_templates']);

  const manifest = JSON.parse(get(work, '.matt/manifest.json'));
  manifest.version = '1.10.0';
  manifest.seeded = manifest.seeded.filter(path => !path.startsWith('spec/_templates/')).concat('spec/full-stack.md');
  put(work, '.matt/manifest.json', manifest);
  for (const name of names) unlinkSync(join(work, 'spec/_templates', name));
  const owned = ['spec/full-stack.md', 'spec/old-ticket.md', 'spec/_templates/frontend.md', 'spec/ticket/shared.md', 'spec/ticket/frontend.md'];
  for (const path of owned) put(work, path, `project: ${path}`);
  cli(work, ['update']);
  assert.ok(!existsSync(join(work, 'spec/_templates/shared.md')));
  cli(work, ['update', '--apply']);
  for (const path of owned) assert.equal(get(work, path), `project: ${path}`);
  for (const name of names.filter(name => name !== 'frontend.md')) assert.equal(get(work, `spec/_templates/${name}`), get(source, `templates/spec/${name}`));
  assert.ok(!existsSync(join(work, 'spec/ticket/backend.md')));
  assert.match(cli(work, ['update']), /changes=0/);
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
  assert.equal(defaults.frontend.freshContext, true);
  assert.equal(defaults.backend.freshContext, true);
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

test('工作树派单只读绑定各端当前分支与提交，不猜默认分支、不替宿主创建', () => {
  const work = temp('worktree-base-');
  const ui = repo(work, 'client app', true), api = repo(work, 'service', false);
  cli(work, ['init', '--apply', '--e2e', 'off']);
  const settings = { version: 1, roles: { frontend: { worktree: true }, backend: { worktree: true }, spec: { worktree: true } } };
  put(work, '.matt/sessions.json', settings);
  const probe = (role, status = 0) => run(api, process.execPath, [join(work, '.matt/runtime/sessions.mjs'), role, '--worktree-base'], status);
  assert.match(probe('frontend', 1), /尚无提交/);
  for (const [role, dir, branch] of [['frontend', ui, 'dev/checkout-ui'], ['backend', api, 'feature/tickets']]) {
    snapshot(dir);
    const git = (...args) => run(dir, 'git', args).trim();
    git('branch', '-M', 'main'); git('checkout', '-qb', branch);
    put(dir, 'feature', role); snapshot(dir); put(dir, 'local-wip', 'not part of the commit');
    const trees = git('worktree', 'list', '--porcelain');
    const sha = git('rev-parse', 'HEAD'); assert.notEqual(sha, git('rev-parse', 'main'));
    assert.deepEqual(JSON.parse(probe(role)).worktreeBase, { checkout: realpathSync(dir), branch, sha, dirty: true, startSha: sha, targetBranch: branch, targetSha: sha });
    assert.equal(git('worktree', 'list', '--porcelain'), trees);
    assert.equal(git('status', '--porcelain'), '?? local-wip');
    unlinkSync(join(dir, 'local-wip')); assert.equal(JSON.parse(probe(role)).worktreeBase.dirty, false);
  }
  run(ui, 'git', ['checkout', '-q', '--detach']);
  assert.match(probe('frontend', 1), /detached HEAD/);
  assert.match(probe('spec', 1), /仅用于/);
  settings.roles.backend.worktree = false; put(work, '.matt/sessions.json', settings);
  assert.match(probe('backend', 1), /worktree: true/);
});

test('每个任务按仓库固定起点，依赖交付独立于最终目标，连续阶段复用原树', () => {
  const work = temp('task-bases-');
  const ui = repo(work, 'ui', true), api = repo(work, 'api', false);
  const git = (dir, ...args) => run(dir, 'git', args).trim();
  for (const dir of [ui, api]) { snapshot(dir); git(dir, 'branch', '-M', 'target'); }
  cli(work, ['init', '--apply', '--e2e', 'off']);
  put(work, '.matt/sessions.json', { version: 1, roles: { frontend: { worktree: true }, backend: { worktree: true } } });
  const probe = (role, args = [], status = 0) => run(work, process.execPath, ['.matt/runtime/sessions.mjs', role, '--host', 'orca', '--worktree-base', ...args], status);
  const base = role => JSON.parse(probe(role)).worktreeBase;
  const first = join(work, 'ui-T01'), second = join(work, 'ui-T02'), server = join(work, 'api-T01');
  // Git's checkout hook stands in for the host setup receipt in this isolated fixture.
  for (const dir of [ui, api]) {
    const hooks = join(dir, '.git', 'hooks');
    put(hooks, 'post-checkout', '#!/bin/sh\necho setup >> "$(git rev-parse --git-path setup-runs)"\n');
    chmodSync(join(hooks, 'post-checkout'), 0o755);
    git(dir, 'config', 'core.hooksPath', hooks);
  }
  git(ui, 'worktree', 'add', '-qb', 'task/T01', first, base('frontend').startSha);
  git(api, 'worktree', 'add', '-qb', 'task/T01', server, base('backend').startSha);
  put(first, 'contract.txt', 'v1'); snapshot(first);
  const dependency = git(first, 'rev-parse', 'HEAD');
  const options = ['--target-branch', 'target', '--requires-sha', dependency];
  const dependent = JSON.parse(probe('frontend', options)).worktreeBase;
  assert.equal(dependent.startSha, dependency);
  assert.equal(dependent.targetSha, git(ui, 'rev-parse', 'target'));
  assert.notEqual(dependent.targetSha, dependency);
  assert.match(probe('frontend', [...options, '--start-sha', dependent.targetSha], 1), /未包含依赖/);
  assert.match(probe('backend', options, 1), /没有可核实的提交/);
  git(ui, 'worktree', 'add', '-qb', 'task/T02', second, dependent.startSha);
  assert.equal(get(second, 'contract.txt'), 'v1');
  put(first, 'stage-two.txt', 'same task, second stage'); snapshot(first);
  assert.equal(existsSync(join(second, 'stage-two.txt')), false);
  for (const dir of [first, second, server]) {
    const receipt = git(dir, 'rev-parse', '--path-format=absolute', '--git-path', 'setup-runs');
    assert.equal(readFileSync(receipt, 'utf8').trim(), 'setup');
  }
  assert.equal(git(ui, 'rev-parse', 'target'), dependent.targetSha);
});

test('隔离试合并揭示文本冲突和组合回归，落地前发现目标前移', () => {
  const work = temp('trial-merge-');
  const ui = repo(work, 'ui', true); repo(work, 'api', false);
  const git = (dir, ...args) => run(dir, 'git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args]).trim();
  put(ui, 'rules.txt', 'old\n');
  put(ui, 'policy.mjs', 'export const allow = () => true;\n');
  snapshot(ui); git(ui, 'branch', '-M', 'target');
  cli(work, ['init', '--apply', '--e2e', 'off']);
  put(work, '.matt/sessions.json', { version: 1, roles: { frontend: { worktree: true } } });
  const target = () => JSON.parse(run(work, process.execPath, ['.matt/runtime/sessions.mjs', 'frontend', '--worktree-base', '--target-branch', 'target'])).worktreeBase.targetSha;
  const task = join(work, 'task'), trial = join(work, 'trial');
  git(ui, 'worktree', 'add', '-qb', 'task/batch', task, target());
  put(task, 'rules.txt', 'batch workflow\n'); snapshot(task);
  const conflictHead = git(task, 'rev-parse', 'HEAD');
  put(ui, 'rules.txt', 'restricted workflow\n');
  put(ui, 'policy.mjs', 'export const allow = role => role === "supervisor";\n');
  snapshot(ui);
  const checkedTarget = target();
  const upstream = join(work, 'shared.git');
  git(work, 'init', '--bare', upstream);
  git(ui, 'remote', 'add', 'team', upstream);
  git(ui, 'push', '-u', 'team', 'target:release-team');
  git(ui, 'worktree', 'add', '--detach', trial, checkedTarget);
  run(trial, 'git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'merge', '--no-commit', conflictHead], 1);
  assert.equal(git(trial, 'diff', '--name-only', '--diff-filter=U'), 'rules.txt');
  git(trial, 'merge', '--abort');
  // An independent new entry point merges cleanly while bypassing the target's changed policy.
  git(task, 'switch', '-qc', 'task/entry', 'HEAD^');
  put(task, 'entry.mjs', 'export const runBatch = () => true;\n'); snapshot(task);
  const taskHead = git(task, 'rev-parse', 'HEAD');
  git(trial, 'merge', '--no-edit', taskHead);
  const check = 'import {runBatch} from "./entry.mjs"; import {allow} from "./policy.mjs"; process.exit(runBatch("guest") === allow("guest") ? 0 : 1)';
  run(trial, process.execPath, ['--input-type=module', '-e', check], 1);
  put(trial, 'entry.mjs', 'export { allow as runBatch } from "./policy.mjs";\n'); snapshot(trial);
  run(trial, process.execPath, ['--input-type=module', '-e', check]);
  const verified = git(trial, 'rev-parse', 'HEAD');
  assert.equal(target(), checkedTarget);
  const coworker = join(work, 'coworker');
  git(work, 'clone', '-q', '-b', 'release-team', upstream, coworker);
  put(coworker, 'team-change.txt', 'coworker commit'); snapshot(coworker);
  git(coworker, 'push');
  git(ui, 'fetch', 'team');
  assert.equal(git(ui, 'rev-parse', '--abbrev-ref', 'target@{upstream}'), 'team/release-team');
  assert.notEqual(git(ui, 'rev-parse', 'target@{upstream}'), checkedTarget);
  git(ui, 'merge', '--ff-only', 'target@{upstream}');
  assert.notEqual(target(), checkedTarget);
  git(trial, 'merge', '--no-edit', target());
  assert.notEqual(git(trial, 'rev-parse', 'HEAD'), verified);
  run(trial, process.execPath, ['--input-type=module', '-e', check]);
});

test('新建工作区只注册父工作流，随包 skill 及引用完整，其他工作流使用宿主入口', () => {
  const work = temp('skills-'); repo(work, 'ui', true); repo(work, 'api', false);
  cli(work, ['init', '--apply', '--e2e', 'off']);
  const skills = '.agents/skills';
  const router = get(work, `${skills}/matt-full-stack/SKILL.md`);
  const prompts = get(work, `${skills}/matt-full-stack/references/dispatch.md`);
  const review = get(work, `${skills}/matt-full-stack/references/review.md`);
  assert.ok(router.includes('(references/review.md)') && prompts.includes('(review.md)'));
  assert.ok(router.includes('(references/worktrees.md)') && prompts.includes('(worktrees.md)') && review.includes('(worktrees.md)'));
  assert.equal(get(work, `${skills}/matt-full-stack/references/worktrees.md`), get(source, 'templates/matt-full-stack/references/worktrees.md'));
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
  for (const entry of ['bin', 'src', 'vendor', 'templates', 'AI_SETUP.md', 'ORCA_SETUP.md']) cpSync(join(source, entry), join(older, entry), { recursive: true, filter: path => basename(path) !== 'node_modules' });
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
  const assets = ['spec/full-stack.md', 'spec/_templates/delivery.md', 'spec/_templates/tasks.md', 'e2e/cases/environment.yaml', 'e2e/matt.config.mjs', 'e2e/login.mjs', '.matt/workspace.json', '.matt/private/model.env'];
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
  assert.match(cli(linked, ['init', '--apply', '--e2e', 'off'], 1), /路径/); assert.ok(!existsSync(join(nested, '_templates')));
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
