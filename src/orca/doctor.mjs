import { buildPlan, report } from './plan.mjs';

export function doctor(options) {
  const plan = buildPlan(options);
  return { ...report(plan), status: plan.conflicts.length ? 'conflict' : plan.pending.length || plan.changes.length ? 'pending' : 'ready', validation: '配置与受管文件检查；未启动 worker、未运行业务测试，bot 理解规则及实际默认模型需在其会话中就绪检查。' };
}
