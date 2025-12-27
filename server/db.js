const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || ''
};

let pool;

async function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...dbConfig,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }
  return pool;
}

async function columnExists(tableName, columnName) {
  const p = await getPool();
  const [rows] = await p.execute(
    'SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
    [dbConfig.database, tableName, columnName]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function tableExists(tableName) {
  const p = await getPool();
  const [rows] = await p.execute(
    'SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1',
    [dbConfig.database, tableName]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function ensureColumn(tableName, ddl) {
  const match = /`([^`]+)`/.exec(ddl);
  const columnName = match ? match[1] : null;
  if (!columnName) throw new Error(`invalid column ddl: ${ddl}`);
  const has = await columnExists(tableName, columnName);
  if (has) return;
  const p = await getPool();
  await p.execute(`ALTER TABLE \`${tableName}\` ADD COLUMN ${ddl}`);
}

async function tryAddIndex(tableName, ddl) {
  const p = await getPool();
  try {
    await p.execute(`ALTER TABLE \`${tableName}\` ADD ${ddl}`);
  } catch (err) {
    const code = err && err.code ? String(err.code) : '';
    if (code === 'ER_DUP_KEYNAME') return;
    throw err;
  }
}

module.exports = {
  dbConfig,
  getPool,
  columnExists,
  tableExists,
  ensureColumn,
  tryAddIndex
};
