export const workflowPath = '.matt/workflow.json';

export function validateProvider(value) {
  if (value !== undefined && !['orca', 'midscene'].includes(value)) throw new Error('e2e.provider 只接受 orca 或 midscene');
  return value;
}

export function parseWorkflow(text) {
  let config;
  try { config = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error(`${workflowPath} 需要有效的 JSON`); }
  if (typeof config?.e2e?.enabled !== 'boolean') throw new Error(`${workflowPath} 的 e2e.enabled 必须为布尔值 true 或 false`);
  validateProvider(config.e2e.provider);
  return config;
}

// The original E2E switch always selected Midscene.
export function savedProvider(e2e) {
  return e2e.provider ?? (e2e.enabled ? 'midscene' : undefined);
}
