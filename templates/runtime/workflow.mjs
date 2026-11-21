export const workflowPath = '.matt/workflow.json';

export function parseWorkflow(text) {
  let config;
  try { config = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error(`${workflowPath} 需要有效的 JSON`); }
  if (typeof config?.e2e?.enabled !== 'boolean') throw new Error(`${workflowPath} 的 e2e.enabled 必须为布尔值 true 或 false`);
  return config;
}
