import { json } from '../workspace-files.mjs';

export const configPath = '.matt/private/database.json';
export const emptyConfig = { version: 1, connectionString: '', qualityTestConnectionString: '', developmentWriteConnectionString: '' };

export function databaseConfig(root) {
  const config = json(root, configPath, emptyConfig);
  if (config?.version !== 1 || Object.keys(config).some(key => !Object.hasOwn(emptyConfig, key))) {
    throw new Error(`请核对 ${configPath} 的版本和字段`);
  }
  for (const field of ['connectionString', 'qualityTestConnectionString', 'developmentWriteConnectionString']) {
    const value = config[field] ?? '';
    if (typeof value !== 'string' || (value !== '' && !validPostgresUrl(value))) {
      throw new Error(`${configPath} 的 ${field} 需要完整的 PostgreSQL 连接 URL 或空字符串`);
    }
  }
  if (config.developmentWriteConnectionString) developmentTarget(config.developmentWriteConnectionString);
  return config;
}

// A write URL must identify its endpoint explicitly. In particular, pg accepts
// query parameters overriding the host, user and database displayed in the URL.
export function developmentTarget(value) {
  const url = new URL(value);
  if (!url.username || url.hash || [...url.searchParams.keys()].some(name => name !== 'sslmode')) {
    throw new Error('开发库写连接需要明确账号与库名，URL 参数仅支持 sslmode');
  }
  return url.username + '@' + url.hostname + ':' + (url.port || '5432') + url.pathname;
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
