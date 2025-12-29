async function ensureForRecharge(conn, userId, addQuota, options = {}) {
  const pkgType = Number(options.packageType || 1);
  const subType = Number(options.subscriptionType || 1);
  const durationMs = Number(options.durationMs || 30 * 24 * 60 * 60 * 1000);
  const now = Date.now();
  const end = now + durationMs;
  const [rows] = await conn.execute(
    'SELECT id, remaining_quota FROM package_subscription WHERE user_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE',
    [String(userId)]
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    await conn.execute(
      'INSERT INTO package_subscription (user_id, package_type, subscription_type, remaining_quota, subscription_start_date, subscription_end_date, create_time, update_time, quota_source, first_login) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [String(userId), 0, subType, Number(addQuota || 0), now, end, now, now, 1, false]
    );
    return;
  }
  const current = Number(rows[0].remaining_quota || 0);
  await conn.execute('UPDATE package_subscription SET remaining_quota = ?, update_time = ? WHERE id = ? LIMIT 1', [
    current + Number(addQuota || 0),
    now,
    rows[0].id
  ]);
}

module.exports = {
  ensureForRecharge
};

