const { getPool } = require('../config/db');

async function upsertTotalRecharged(conn, userId, addQuota, quotaSource) {
  const [rows] = await conn.execute(
    'SELECT id, total_recharged FROM user_crawler_quota WHERE user_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE',
    [String(userId)]
  );
  const now = Date.now();
  if (!Array.isArray(rows) || rows.length === 0) {
    await conn.execute(
      'INSERT INTO user_crawler_quota (user_id, total_recharged, create_time, update_time, quota_source, current_package_type) VALUES (?, ?, ?, ?, ?, 0)',
      [String(userId), Number(addQuota || 0), now, now, Number(quotaSource || 0)]
    );
    return;
  }
  const current = Number(rows[0].total_recharged || 0);
  await conn.execute('UPDATE user_crawler_quota SET total_recharged = ?, update_time = ? WHERE id = ? LIMIT 1', [
    current + Number(addQuota || 0),
    now,
    rows[0].id
  ]);
}

module.exports = {
  upsertTotalRecharged
};

