import { closeSync, mkdirSync, openSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { version } from '../release.mjs';
import { encode, read, safePath, write } from './files.mjs';
import { buildPlan, installerCommand, report, statePath, team } from './plan.mjs';
import { installDatabaseDependencies, syncDatabaseBinding } from './database.mjs';

export function apply(options) {
  // Validate destinations and all conflicts before registering projects or proposing bots.
  let plan = buildPlan(options);
  if (plan.conflicts.length) return { ...report(plan), status: 'conflict', applied: [] };
  const lockPath = safePath(plan.root, '.matt/private/orca-install.lock');
  mkdirSync(dirname(lockPath), { recursive: true });
  const lock = openSync(lockPath, 'wx');
  const applied = [];
  try {
    writeFileSync(lock, String(process.pid));
    plan = buildPlan(options);
    if (plan.conflicts.length) return { ...report(plan), status: 'conflict', applied };
    for (const [role, repo] of Object.entries(plan.repos)) {
      if (repo.selector) continue;
      options.client.run(['repo', 'add', '--path', repo.checkout]);
      applied.push({ action: 'register-repo', role, path: repo.checkout });
    }
    // Read the registered identities back; an accepted command alone isn't a binding.
    if (applied.length) {
      plan = buildPlan(options);
      if (Object.values(plan.repos).some(repo => !repo.selector)) throw new Error('注册后仍无法核对 Orca 项目，保留现场，未重复注册');
      if (plan.conflicts.length) return { ...report(plan), status: 'conflict', applied };
    }
    for (const change of plan.changes) {
      write(change.root, change.path, change.next, change.old, change.mode);
      applied.push({ action: change.action, role: change.role, path: change.path });
    }
    const state = structuredClone(plan.state);
    state.toolkitVersion = version;
    for (const bot of plan.bots) {
      if (!bot.home) continue;
      state.bots[bot.role] = { ...state.bots[bot.role], id: bot.id, home: bot.home, files: bot.files };
      delete state.offers[bot.role];
    }
    let previousState = read(plan.root, statePath);
    const save = () => {
      const next = encode(state);
      write(plan.root, statePath, next, previousState);
      previousState = next;
    };
    save();
    if (plan.database.installDependencies) {
      installDatabaseDependencies(plan.root);
      applied.push({ action: 'install-dependencies', path: '.matt/runtime/database-mcp' });
    }
    for (const binding of plan.database.bindings) {
      syncDatabaseBinding(plan.root, binding, options.client);
      if (plan.database.enabledRoles.includes(binding.role)) state.bots[binding.role].databaseTool = true;
      else delete state.bots[binding.role].databaseTool;
      save();
      if (['add', 'remove'].includes(binding.action)) applied.push({ action: binding.action, name: 'matt_db_schema', role: binding.role });
    }

    if (plan.callerRole === 'matt') {
      for (const bot of plan.bots.filter(bot => bot.status === 'missing' && bot.role !== 'matt')) {
        const purpose = team.roles[bot.role].purpose;
        const does = `先从你自己的 bot home 执行 ${installerCommand(plan.root)} 完成项目团队登记，再读取 skills/matt-orca/SKILL.md，报告就绪检查和缺项。`;
        // Persist before the external call. A lost reply must never cause another offer.
        state.offers[bot.role] = { name: bot.name, status: 'unknown' };
        save();
        const receipt = options.client.run(['bot', 'create', '--offer', '--name', bot.name, '--purpose', purpose, '--does', does, '--reports', '向主控交回安装、派单、测试与审查的实际证据及阻塞项。']);
        if (receipt.offered !== true) throw new Error(`${bot.name} 的创建卡片未得到明确回执，请在 Orca 核对；未自动重试`);
        state.offers[bot.role] = { name: bot.name, status: 'pending' };
        save();
        applied.push({ action: 'offer', role: bot.role, name: bot.name });
      }
    }
    const final = buildPlan(options);
    const result = report(final);
    return { ...result, status: final.conflicts.length ? 'conflict' : final.pending.length || final.changes.length ? 'pending' : 'ready', applied };
  } finally { closeSync(lock); unlinkSync(lockPath); }
}
