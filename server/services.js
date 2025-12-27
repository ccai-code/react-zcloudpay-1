const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { getPool } = require('./db');

function setUsersHasPasswordEnc(value) {
  void value;
}

function normalizePlan(input) {
  const v = (input || '').toString().trim().toUpperCase();
  if (v === 'FORMAL') return 'FORMAL';
  return 'TRIAL';
}

function planToAmountFen(plan) {
  if (process.env.TEST_PAY_FEN) {
    const v = Number(process.env.TEST_PAY_FEN);
    if (Number.isFinite(v) && v > 0) return Math.floor(v);
  }
  return plan === 'FORMAL' ? 100000 : 20000;
}

function planToCredits(plan) {
  return plan === 'FORMAL' ? 100000 : 10000;
}

function planToDescription(plan) {
  return plan === 'FORMAL' ? '额度充值-1000元（100000额度）' : '体验账号-200元（10000额度）';
}

function generateOutTradeNo() {
  return `zwsk_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

async function getUserByAccount(account) {
  const p = await getPool();
  const [rows] = await p.execute(
    'SELECT user_id, username, channel_name, password_plain FROM users WHERE user_id = ? LIMIT 1',
    [String(account)]
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0];
}

function generateSixDigitPassword() {
  const n = crypto.randomInt(0, 1000000);
  return String(n).padStart(6, '0');
}

async function createUserWithRandomCredentials({ channelName }) {
  const p = await getPool();
  const userId = crypto.randomUUID();
  const passwordPlain = generateSixDigitPassword();
  const channel = (channelName || '').toString();

  let seq = 1;
  try {
    const [rows] = await p.execute('SELECT COUNT(1) AS c FROM users');
    const c = Array.isArray(rows) && rows.length > 0 ? Number(rows[0].c || 0) : 0;
    seq = Number.isFinite(c) && c >= 0 ? c + 1 : 1;
  } catch {}
  const username = `会员${seq}号`;

  const passwordHash = await bcrypt.hash(String(passwordPlain), 10);
  try {
    await p.execute('INSERT INTO users (user_id, username, channel_name, password_plain, password) VALUES (?, ?, ?, ?, ?)', [
      userId,
      username,
      channel,
      passwordPlain,
      passwordHash
    ]);
  } catch (err) {
    const code = err && err.code ? String(err.code) : '';
    if (code !== 'ER_BAD_FIELD_ERROR') throw err;
    await p.execute('INSERT INTO users (user_id, username, channel_name, password_plain) VALUES (?, ?, ?, ?)', [
      userId,
      username,
      channel,
      passwordPlain
    ]);
  }

  return { user_id: userId, account: userId, username, password: passwordPlain };
}

async function createPendingPayOrder({ outTradeNo, userId, channelName, amountFen, quotaAmount }) {
  const p = await getPool();
  await p.execute(
    'INSERT INTO pay_orders (out_trade_no, user_id, channel_name, amount_fen, quota_amount, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
    [outTradeNo, String(userId), (channelName || '').toString(), Number(amountFen || 0), Number(quotaAmount || 0), 'PENDING']
  );
}

async function getBalanceByUserId(conn, userId) {
  const [rows] = await conn.execute('SELECT COALESCE(SUM(change_amount), 0) AS balance FROM user_quota_log WHERE user_id = ?', [
    String(userId)
  ]);
  const r = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  return r && r.balance !== null && r.balance !== undefined ? Number(r.balance || 0) : 0;
}

async function ensureQuotaRowAndAddRecharge(conn, userId, addQuota, quotaSource) {
  const [rows] = await conn.execute(
    'SELECT id, total_recharged FROM user_crawler_quota WHERE user_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE',
    [String(userId)]
  );
  const now = Date.now();
  if (!Array.isArray(rows) || rows.length === 0) {
    await conn.execute(
      'INSERT INTO user_crawler_quota (user_id, total_recharged, create_time, update_time, quota_source) VALUES (?, ?, ?, ?, ?)',
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

async function settlePayOrder({
  outTradeNo,
  wxAmountFen,
  transactionId,
  paidAt,
  eventId,
  eventType,
  notifyTime,
  source
}) {
  void eventId;
  void eventType;
  void notifyTime;
  void source;
  const p = await getPool();
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();

    const [orderRows] = await conn.execute(
      'SELECT id, user_id, channel_name, amount_fen, quota_amount, status, created_at, paid_at FROM pay_orders WHERE out_trade_no = ? LIMIT 1 FOR UPDATE',
      [outTradeNo]
    );
    if (!Array.isArray(orderRows) || orderRows.length === 0) {
      await conn.rollback();
      conn.release();
      return null;
    }
    const order = orderRows[0];
    if (typeof wxAmountFen === 'number' && wxAmountFen !== order.amount_fen) {
      await conn.rollback();
      conn.release();
      return null;
    }

    if (order.status !== 'PAID') {
      await conn.execute(
        'UPDATE pay_orders SET status = ?, transaction_id = ?, paid_at = ?, updated_at = NOW() WHERE id = ? LIMIT 1',
        ['PAID', transactionId || null, paidAt ? new Date(paidAt) : null, order.id]
      );
    }

    const [userRows] = await conn.execute('SELECT user_id, channel_name, password_plain FROM users WHERE user_id = ? LIMIT 1 FOR UPDATE', [
      String(order.user_id)
    ]);
    if (!Array.isArray(userRows) || userRows.length === 0) {
      await conn.rollback();
      conn.release();
      return null;
    }
    const user = userRows[0];

    const addQuota = Number(order.quota_amount || 0);
    if (order.status !== 'PAID' && addQuota > 0) {
      await conn.execute(
        'INSERT INTO user_quota_log (user_id, change_amount, action, create_time, package_type, subscription_type, quota_source) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [String(user.user_id), addQuota, 'PAY_RECHARGE', Date.now(), null, null, 1]
      );
      await ensureQuotaRowAndAddRecharge(conn, user.user_id, addQuota, 1);
    } else if (order.status === 'PAID' && addQuota > 0) {
      const [existsRows] = await conn.execute(
        'SELECT 1 FROM user_quota_log WHERE user_id = ? AND action = ? AND create_time >= ? ORDER BY id DESC LIMIT 1',
        [String(user.user_id), 'PAY_RECHARGE', Date.now() - 5000]
      );
      void existsRows;
    }

    const balance = await getBalanceByUserId(conn, user.user_id);
    const createdTs = order.created_at ? Number(new Date(order.created_at).getTime()) : null;
    const paidTs = order.paid_at ? Number(new Date(order.paid_at).getTime()) : null;

    await conn.commit();
    conn.release();
    const plan = Number(order.amount_fen || 0) >= 100000 ? 'FORMAL' : 'TRIAL';
    return {
      account: String(user.user_id),
      dealer_name: (order.channel_name || user.channel_name || '').toString(),
      plan,
      amount_fen: Number(order.amount_fen || 0),
      status: 'PAID',
      created_ts: createdTs === null ? Date.now() : createdTs,
      paid_ts: paidTs === null ? (paidAt ? new Date(paidAt).getTime() : Date.now()) : paidTs,
      order_no: String(outTradeNo),
      balance,
      password: user.password_plain || null
    };
  } catch (err) {
    try {
      await conn.rollback();
    } catch {}
    conn.release();
    throw err;
  }
}

async function rechargeAccount(account, amount, orderNo) {
  const p = await getPool();
  const addCredits = Math.max(0, Math.floor(Number(amount || 0) * 100));
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();
    const [userRows] = await conn.execute('SELECT user_id, channel_name, password_plain FROM users WHERE user_id = ? LIMIT 1 FOR UPDATE', [
      String(account)
    ]);
    if (!Array.isArray(userRows) || userRows.length === 0) {
      await conn.rollback();
      conn.release();
      return null;
    }
    const user = userRows[0];
    await conn.execute(
      'INSERT INTO user_quota_log (user_id, change_amount, action, create_time, package_type, subscription_type, quota_source) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [String(user.user_id), addCredits, 'MANUAL_RECHARGE', Date.now(), null, null, 2]
    );
    await ensureQuotaRowAndAddRecharge(conn, user.user_id, addCredits, 2);
    const balance = await getBalanceByUserId(conn, user.user_id);
    await conn.commit();
    conn.release();
    return { account: String(account), amount: Math.floor(Number(amount || 0)), credits: addCredits, balance, ts: Date.now() };
  } catch (err) {
    try {
      await conn.rollback();
    } catch {}
    conn.release();
    throw err;
  }
}

async function verifyChannelPartnerLogin({ account, password }) {
  if (!account || !password) return false;
  const p = await getPool();
  const phone = String(account).trim();
  const [rows] = await p.execute(
    'SELECT password FROM channel_partners WHERE phone = ? ORDER BY id DESC LIMIT 1',
    [phone]
  );
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const stored = rows[0].password === null || rows[0].password === undefined ? '' : String(rows[0].password);
  const input = String(password);
  return stored === input;
}

async function registerChannelPartner({ phone, password, channelName }) {
  const p = await getPool();
  const phoneVal = String(phone || '').trim();
  const channelVal = String(channelName || phoneVal).trim() || phoneVal;
  const passwordVal = String(password || '') || generateSixDigitPassword();

  if (!phoneVal) {
    return { status: 400, payload: { ok: false, message: '参数错误' }, error: null };
  }

  try {
    const [rows] = await p.execute('SELECT id FROM channel_partners WHERE phone = ? ORDER BY id DESC LIMIT 1', [phoneVal]);
    if (Array.isArray(rows) && rows.length > 0) {
      return { status: 409, payload: { ok: false, message: '手机号已注册' }, error: null };
    }
  } catch (err) {
    return { status: 500, payload: { ok: false, message: '注册失败' }, error: err };
  }

  try {
    await p.execute('INSERT INTO channel_partners (phone, password, channel_name) VALUES (?, ?, ?)', [
      phoneVal,
      passwordVal,
      channelVal
    ]);
    return { status: 200, payload: { ok: true, phone: phoneVal, channel_name: channelVal, password: passwordVal }, error: null };
  } catch (err) {
    const code = err && err.code ? String(err.code) : '';
    if (code === 'ER_DUP_ENTRY') {
      return { status: 409, payload: { ok: false, message: '手机号已注册' }, error: null };
    }
    if (code === 'ER_BAD_FIELD_ERROR') {
      try {
        await p.execute('INSERT INTO channel_partners (phone, password) VALUES (?, ?)', [phoneVal, passwordVal]);
        return { status: 200, payload: { ok: true, phone: phoneVal, channel_name: channelVal, password: passwordVal }, error: null };
      } catch (err2) {
        const code2 = err2 && err2.code ? String(err2.code) : '';
        if (code2 === 'ER_DUP_ENTRY') {
          return { status: 409, payload: { ok: false, message: '手机号已注册' }, error: null };
        }
        return { status: 500, payload: { ok: false, message: '注册失败' }, error: err2 };
      }
    }
    return { status: 500, payload: { ok: false, message: '注册失败' }, error: err };
  }
}

async function getChannelNameByPhone(phone) {
  const p = await getPool();
  const fallback = String(phone).trim();
  try {
    const [rows] = await p.execute('SELECT channel_name FROM channel_partners WHERE phone = ? ORDER BY id DESC LIMIT 1', [
      fallback
    ]);
    if (!Array.isArray(rows) || rows.length === 0) return fallback;
    const v = rows[0].channel_name;
    const s = v === null || v === undefined ? '' : String(v).trim();
    return s || fallback;
  } catch (err) {
    const code = err && err.code ? String(err.code) : '';
    if (code === 'ER_BAD_FIELD_ERROR') return fallback;
    throw err;
  }
}

async function getProfile(account) {
  const p = await getPool();
  const [rows] = await p.execute('SELECT user_id, username, channel_name FROM users WHERE user_id = ? LIMIT 1', [String(account)]);
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const r = rows[0];
  const balance = await getBalance(String(r.user_id));
  return {
    id: r.user_id,
    account: r.user_id,
    dealer_name: r.channel_name,
    channel_name: r.channel_name,
    plan: null,
    service_status: balance > 0 ? 'ACTIVE' : 'PENDING',
    credits: balance,
    activated_ts: null,
    username: r.username || null
  };
}

async function getBalance(account) {
  const p = await getPool();
  const [rows] = await p.execute('SELECT COALESCE(SUM(change_amount), 0) AS balance FROM user_quota_log WHERE user_id = ?', [
    String(account)
  ]);
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  const r = rows[0];
  return r.balance === null || r.balance === undefined ? 0 : Number(r.balance || 0);
}

async function getHistory(account) {
  const p = await getPool();
  const [uRows] = await p.execute('SELECT user_id FROM users WHERE user_id = ? LIMIT 1', [String(account)]);
  if (!Array.isArray(uRows) || uRows.length === 0) return [];
  const userId = uRows[0].user_id;
  const [rows] = await p.execute(
    'SELECT change_amount, action, create_time FROM user_quota_log WHERE user_id = ? ORDER BY create_time DESC LIMIT 200',
    [userId]
  );
  return Array.isArray(rows)
    ? rows.map(r => ({
        amount: null,
        credits: typeof r.change_amount === 'number' ? r.change_amount : Number(r.change_amount || 0),
        balance: null,
        order_no: null,
        transaction_id: null,
        ts: r.create_time === null ? null : Number(r.create_time || 0),
        action: r.action || null
      }))
    : [];
}

async function consumeCredits({ account, credits, remark }) {
  const p = await getPool();
  const cost = Math.max(0, Math.floor(Number(credits || 0)));
  void remark;
  if (!account || cost <= 0) {
    return { status: 400, payload: { ok: false, message: '参数错误' }, error: null };
  }
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();
    const [userRows] = await conn.execute('SELECT user_id, channel_name FROM users WHERE user_id = ? LIMIT 1 FOR UPDATE', [
      String(account).trim()
    ]);
    if (!Array.isArray(userRows) || userRows.length === 0) {
      await conn.rollback();
      conn.release();
      return { status: 404, payload: { ok: false, message: '账号不存在' }, error: null };
    }
    const user = userRows[0];
    const currentCredits = await getBalanceByUserId(conn, user.user_id);
    if (currentCredits < cost) {
      await conn.rollback();
      conn.release();
      return { status: 400, payload: { ok: false, message: '额度不足' }, error: null };
    }
    const nextBalance = currentCredits - cost;
    await conn.execute(
      'INSERT INTO user_quota_log (user_id, change_amount, action, create_time, package_type, subscription_type, quota_source) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [String(user.user_id), -cost, 'CONSUME', Date.now(), null, null, 3]
    );

    await conn.commit();
    conn.release();
    return { status: 200, payload: { ok: true, balance: nextBalance }, error: null };
  } catch (error) {
    try {
      await conn.rollback();
    } catch {}
    conn.release();
    return { status: 500, payload: { ok: false, message: '扣减失败' }, error };
  }
}

async function getLocalOrderRecord(outTradeNo) {
  const p = await getPool();
  const [rows] = await p.execute(
    'SELECT po.out_trade_no, po.channel_name, po.amount_fen, po.status, UNIX_TIMESTAMP(po.created_at) * 1000 AS created_ts, UNIX_TIMESTAMP(po.paid_at) * 1000 AS paid_ts, u.user_id, u.password_plain FROM pay_orders po JOIN users u ON po.user_id COLLATE utf8mb4_unicode_ci = u.user_id COLLATE utf8mb4_unicode_ci WHERE po.out_trade_no = ? LIMIT 1',
    [outTradeNo]
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const r = rows[0];
  const balance = await getBalance(String(r.user_id));
  const plan = Number(r.amount_fen || 0) >= 100000 ? 'FORMAL' : 'TRIAL';
  return {
    account: r.user_id,
    dealer_name: r.channel_name,
    plan,
    amount_fen: r.amount_fen,
    status: r.status,
    created_ts: Number(r.created_ts),
    paid_ts: r.paid_ts === null ? null : Number(r.paid_ts),
    order_no: r.out_trade_no,
    balance,
    password: r.password_plain || null
  };
}

async function getDealerOrders(dealerName) {
  const p = await getPool();
  const [rows] = await p.execute(
    'SELECT u.user_id, u.password_plain, po.out_trade_no, po.amount_fen, po.status, UNIX_TIMESTAMP(po.created_at) * 1000 AS created_ts, UNIX_TIMESTAMP(po.paid_at) * 1000 AS paid_ts FROM pay_orders po JOIN users u ON po.user_id COLLATE utf8mb4_unicode_ci = u.user_id COLLATE utf8mb4_unicode_ci WHERE po.channel_name COLLATE utf8mb4_unicode_ci = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci ORDER BY po.created_at DESC LIMIT 200',
    [String(dealerName)]
  );
  return Array.isArray(rows)
    ? rows.map(r => ({
        dealer_name: dealerName,
        account: r.user_id,
        plan: Number(r.amount_fen || 0) >= 100000 ? 'FORMAL' : 'TRIAL',
        amount: Math.round((r.amount_fen || 0) / 100),
        status: r.status,
        created_ts: Number(r.created_ts),
        paid_ts: r.paid_ts === null ? null : Number(r.paid_ts),
        out_trade_no: r.out_trade_no,
        balance: null,
        password: r.password_plain || null
      }))
    : [];
}

async function getDealerAccounts(dealerAccount) {
  const p = await getPool();
  const [rows] = await p.execute(
    "SELECT u.user_id, u.username, u.password_plain, COALESCE(SUM(l.change_amount), 0) AS balance, MAX(l.create_time) AS last_ts FROM users u LEFT JOIN user_quota_log l ON l.user_id COLLATE utf8mb4_unicode_ci = u.user_id COLLATE utf8mb4_unicode_ci WHERE u.channel_name COLLATE utf8mb4_unicode_ci = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci GROUP BY u.user_id, u.username, u.password_plain ORDER BY last_ts DESC, u.user_id DESC",
    [String(dealerAccount)]
  );
  return Array.isArray(rows)
    ? rows.map(r => ({
        account: r.user_id,
        username: r.username || null,
        balance: typeof r.balance === 'number' ? r.balance : Number(r.balance || 0),
        last_recharge_ts: r.last_ts === null ? null : Number(r.last_ts),
        password: r.password_plain || null
      }))
    : [];
}

async function getDealerAccountLogs(dealerAccount, account) {
  const p = await getPool();
  const [uRows] = await p.execute(
    'SELECT user_id FROM users WHERE user_id COLLATE utf8mb4_unicode_ci = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci AND channel_name COLLATE utf8mb4_unicode_ci = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci LIMIT 1',
    [String(account), String(dealerAccount)]
  );
  if (!Array.isArray(uRows) || uRows.length === 0) return [];
  const [rows] = await p.execute(
    'SELECT action, change_amount, create_time FROM user_quota_log WHERE user_id = ? ORDER BY create_time ASC LIMIT 200',
    [String(account)]
  );
  if (!Array.isArray(rows) || rows.length === 0) return [];

  let running = 0;
  const enrichedAsc = rows.map(r => {
    const delta = typeof r.change_amount === 'number' ? r.change_amount : Number(r.change_amount || 0);
    running += delta;
    const action = r.action === null || r.action === undefined ? '' : String(r.action);
    const logType = action === 'CONSUME' ? 'CONSUME' : action ? 'RECHARGE' : 'UNKNOWN';
    const amount = delta > 0 ? Math.round(delta / 100) : null;
    return {
      log_type: logType,
      delta_credits: delta,
      balance: running,
      amount,
      order_no: null,
      transaction_id: null,
      remark: action || null,
      created_ts: r.create_time === null ? null : Number(r.create_time || 0)
    };
  });

  return enrichedAsc.reverse();
}

async function syncAllUserCrawlerQuotaTotals() {
  const p = await getPool();
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      "SELECT user_id, COALESCE(SUM(CASE WHEN change_amount > 0 AND action IN ('PAY_RECHARGE','MANUAL_RECHARGE') THEN change_amount ELSE 0 END), 0) AS total_recharged FROM user_quota_log GROUP BY user_id"
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      await conn.commit();
      conn.release();
      return { ok: true, updated: 0 };
    }

    let updated = 0;
    const now = Date.now();
    for (const r of rows) {
      const userId = r.user_id === null || r.user_id === undefined ? '' : String(r.user_id);
      if (!userId) continue;
      const total = typeof r.total_recharged === 'number' ? r.total_recharged : Number(r.total_recharged || 0);
      const [qRows] = await conn.execute(
        'SELECT id FROM user_crawler_quota WHERE user_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE',
        [userId]
      );
      if (!Array.isArray(qRows) || qRows.length === 0) {
        await conn.execute(
          'INSERT INTO user_crawler_quota (user_id, total_recharged, create_time, update_time, quota_source) VALUES (?, ?, ?, ?, ?)',
          [userId, total, now, now, 0]
        );
      } else {
        await conn.execute('UPDATE user_crawler_quota SET total_recharged = ?, update_time = ? WHERE id = ? LIMIT 1', [
          total,
          now,
          qRows[0].id
        ]);
      }
      updated += 1;
    }

    await conn.commit();
    conn.release();
    return { ok: true, updated };
  } catch (err) {
    try {
      await conn.rollback();
    } catch {}
    conn.release();
    throw err;
  }
}

module.exports = {
  setUsersHasPasswordEnc,
  normalizePlan,
  planToAmountFen,
  planToCredits,
  planToDescription,
  generateOutTradeNo,
  getUserByAccount,
  createUserWithRandomCredentials,
  createPendingPayOrder,
  settlePayOrder,
  rechargeAccount,
  verifyChannelPartnerLogin,
  registerChannelPartner,
  getChannelNameByPhone,
  getProfile,
  getBalance,
  getHistory,
  consumeCredits,
  syncAllUserCrawlerQuotaTotals,
  getLocalOrderRecord,
  getDealerOrders,
  getDealerAccounts,
  getDealerAccountLogs
};
