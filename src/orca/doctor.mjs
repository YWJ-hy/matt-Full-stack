import { buildPlan, report } from './plan.mjs';

export function doctor(options) {
  const plan = buildPlan(options);
  return { ...report(plan), status: plan.conflicts.length ? 'conflict' : plan.pending.length || plan.changes.length ? 'pending' : 'ready', validation: '配置与受管文件检查；未启动 worker、未运行业务测试，实际执行状态由任务启动回执核实。' };
}
