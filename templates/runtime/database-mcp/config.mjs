import { json } from '../workspace-files.mjs';

export const configPath = '.matt/private/database.json';
export const emptyConfig = { version: 1, connectionString: '', qualityTestConnectionString: '' };

export function databaseConfig(root) {
  const config = json(root, configPath, emptyConfig);
  if (config?.version !== 1 || Object.keys(config).some(key => !Object.hasOwn(emptyConfig, key))) {
    throw new Error(`请核对 ${configPath} 的版本和字段`);
  }
  for (const field of ['connectionString', 'qualityTestConnectionString']) {
    const value = config[field] ?? '';
    if (typeof value !== 'string' || (value !== '' && !validPostgresUrl(value))) {
      throw new Error(`${configPath} 的 ${field} 需要完整的 PostgreSQL 连接 URL 或空字符串`);
    }
  }
  return config;
}

function validPostgresUrl(value) {
  try {
    const url = new URL(value);
    return ['postgres:', 'postgresql:'].includes(url.protocol) && !!url.hostname && url.pathname.length > 1;
  } catch { return false; }
}

export function connectionFor(config, role) {
  if (role === 'quality') return config.qualityTestConnectionString;
  if (role === 'matt' || role === 'backend') return config.connectionString;
}
