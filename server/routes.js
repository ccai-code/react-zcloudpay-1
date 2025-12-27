const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const axios = require('axios');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const config = require('./wxpayConfig');
const { generateAuthorization, decryptNotification } = require('./wxpayCrypto');
const services = require('./services');

function registerRoutes(app) {
  const jsonParser = bodyParser.json();
  app.use((req, res, next) => {
    if (req.path === '/notify') return next();
    return jsonParser(req, res, next);
  });

  const publicDir = path.join(__dirname, 'public');
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
  }

  const indexPath = path.join(publicDir, 'index.html');
  app.get('/', (req, res) => {
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
    return res.status(204).end();
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { account, password } = req.body || {};
      const ok = await services.verifyChannelPartnerLogin({ account, password });
      return res.json({ ok });
    } catch (err) {
      console.error('登录接口错误:', err);
      return res.status(500).json({ ok: false });
    }
  });

  app.post('/api/auth/register', async (req, res) => {
    try {
      const b = req.body || {};
      const phone = (b.phone || b.account || '').toString().trim();
      const result = await services.registerChannelPartner({ phone });
      if (result.error) {
        console.error('注册接口错误:', result.error);
      }
      return res.status(result.status).json(result.payload);
    } catch (err) {
      console.error('注册接口错误:', err);
      return res.status(500).json({ ok: false, message: '注册失败' });
    }
  });

  app.get('/api/profile', async (req, res) => {
    try {
      const { account } = req.query;
      if (!account) return res.json({ ok: false });
      const profile = await services.getProfile(account);
      if (!profile) return res.json({ ok: false });
      return res.json({ ok: true, profile });
    } catch (err) {
      console.error('账户信息查询错误:', err);
      return res.status(500).json({ ok: false });
    }
  });

  app.get('/api/balance', async (req, res) => {
    try {
      const { account } = req.query;
      if (!account) {
        return res.json({ ok: false, balance: 0 });
      }
      const balance = await services.getBalance(account);
      if (balance === null) {
        return res.json({ ok: false, balance: 0 });
      }
      return res.json({ ok: true, balance });
    } catch (err) {
      console.error('余额查询错误:', err);
      return res.status(500).json({ ok: false, balance: 0 });
    }
  });

  app.get('/api/history', async (req, res) => {
    try {
      const { account } = req.query;
      if (!account) {
        return res.json({ ok: true, history: [] });
      }
      const history = await services.getHistory(account);
      return res.json({ ok: true, history });
    } catch (err) {
      console.error('历史记录查询错误:', err);
      return res.status(500).json({ ok: false, history: [] });
    }
  });

  app.post('/api/recharge', async (req, res) => {
    const { account, amount } = req.body || {};
    if (!account || !amount) {
      return res.json({ ok: false });
    }
    try {
      const record = await services.rechargeAccount(account, amount, null);
      if (!record) {
        return res.json({ ok: false });
      }
      return res.json({ ok: true, record });
    } catch (err) {
      console.error('充值接口错误:', err);
      return res.status(500).json({ ok: false });
    }
  });

  app.post('/api/account/consume', async (req, res) => {
    try {
      const { account, credits, remark } = req.body || {};
      const result = await services.consumeCredits({ account, credits, remark });
      if (result.error) {
        console.error('额度扣减接口错误:', result.error);
      }
      return res.status(result.status).json(result.payload);
    } catch (err) {
      console.error('额度扣减接口错误:', err);
      return res.status(500).json({ ok: false, message: '扣减失败' });
    }
  });

  app.get('/api/order-status', async (req, res) => {
    const { out_trade_no } = req.query;
    if (!out_trade_no) {
      return res.status(400).json({ ok: false, message: '缺少订单号' });
    }
    try {
      const local = await services.getLocalOrderRecord(String(out_trade_no));
      if (!local) return res.json({ ok: false, message: '订单不存在' });

      if (local.status === 'PAID') {
        return res.json({
          ok: true,
          paid: true,
          record: {
            account: local.account,
            dealer_name: local.dealer_name,
            plan: local.plan,
            amount: Math.round((local.amount_fen || 0) / 100),
            status: local.status,
            created_ts: Number(local.created_ts),
            paid_ts: local.paid_ts === null ? null : Number(local.paid_ts),
            order_no: local.order_no,
            balance: typeof local.balance === 'number' ? local.balance : Number(local.balance || 0),
            password: local.password || null
          }
        });
      }

      try {
        const urlPath = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(out_trade_no)}?mchid=${config.mchid}`;
        const auth = generateAuthorization('GET', urlPath, '');
        const response = await axios.get(config.domain + urlPath, {
          headers: {
            Authorization: auth,
            Accept: 'application/json'
          }
        });
        const data = response.data || {};
        const tradeState = data.trade_state || '';
        if (tradeState === 'SUCCESS') {
          const wxAmountFen = data.amount && typeof data.amount.total === 'number' ? data.amount.total : null;
          try {
            const record = await services.settlePayOrder({
              outTradeNo: String(out_trade_no),
              wxAmountFen: wxAmountFen === null ? undefined : wxAmountFen,
              transactionId: data.transaction_id || null,
              paidAt: data.success_time || null,
              source: 'WECHAT_QUERY'
            });
            if (record) {
              return res.json({
                ok: true,
                paid: true,
                trade_state: tradeState,
                record
              });
            }
          } catch (err) {
            console.error('订单状态查询补单处理错误:', err);
          }
        }
        return res.json({ ok: true, paid: false, trade_state: tradeState || null });
      } catch (err) {
        if (err.response && err.response.data) {
          console.error('订单状态远程查询错误:', err.response.data);
        } else {
          console.error('订单状态远程查询错误:', err);
        }
        return res.json({ ok: true, paid: false });
      }
    } catch (err) {
      console.error('本地订单状态查询错误:', err);
      return res.status(500).json({ ok: false, message: '本地订单状态查询失败' });
    }
  });

  app.get('/api/payment-status', async (req, res) => {
    const { out_trade_no } = req.query;
    if (!out_trade_no) {
      return res.status(400).json({ ok: false, message: '缺少订单号' });
    }
    try {
      const urlPath = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(out_trade_no)}?mchid=${config.mchid}`;
      const auth = generateAuthorization('GET', urlPath, '');
      const response = await axios.get(config.domain + urlPath, {
        headers: {
          Authorization: auth,
          Accept: 'application/json'
        }
      });
      const data = response.data || {};
      const tradeState = data.trade_state || '';
      if (tradeState === 'SUCCESS') {
        const wxAmountFen = data.amount && typeof data.amount.total === 'number' ? data.amount.total : null;
        try {
          await services.settlePayOrder({
            outTradeNo: String(out_trade_no),
            wxAmountFen: wxAmountFen === null ? undefined : wxAmountFen,
            transactionId: data.transaction_id || null,
            paidAt: data.success_time || null,
            source: 'WECHAT_QUERY'
          });
        } catch (err) {
          console.error('查询订单补单处理错误:', err);
        }
      }
      return res.json({ ok: true, trade_state: tradeState, data });
    } catch (err) {
      if (err.response && err.response.data) {
        console.error('订单查询错误:', err.response.data);
        return res.status(500).json({ ok: false, message: '订单查询失败', error: err.response.data });
      }
      console.error('订单查询错误:', err.message || err);
      return res.status(500).json({ ok: false, message: '订单查询失败' });
    }
  });

  app.post('/pay/guest', async (req, res) => {
    try {
      const { dealerName, plan: planInput } = req.body || {};
      const plan = services.normalizePlan(planInput);
      const dealerAccount = (dealerName || '').toString().trim();
      const channelName = await services.getChannelNameByPhone(dealerAccount);
      const created = await services.createUserWithRandomCredentials({ channelName });
      const outTradeNo = services.generateOutTradeNo();
      const amountFen = services.planToAmountFen(plan);
      const credits = services.planToCredits(plan);
      try {
        await services.createPendingPayOrder({
          outTradeNo,
          amountFen,
          userId: created.user_id,
          channelName,
          quotaAmount: credits
        });
      } catch (err) {
        console.error('创建订单失败:', err);
        return res.status(500).json({ ok: false, message: '创建订单失败' });
      }
      const payload = {
        appid: config.appid,
        mchid: config.mchid,
        description: services.planToDescription(plan),
        out_trade_no: outTradeNo,
        notify_url: config.notifyUrl,
        amount: {
          total: amountFen,
          currency: 'CNY'
        },
        attach: JSON.stringify({ out_trade_no: outTradeNo, account: created.account, dealer_name: channelName, plan })
      };

      const urlPath = '/v3/pay/transactions/native';
      const bodyStr = JSON.stringify(payload);
      const auth = generateAuthorization('POST', urlPath, bodyStr);

      const response = await axios.post(config.domain + urlPath, payload, {
        headers: {
          Authorization: auth,
          Accept: 'application/json',
          'Content-Type': 'application/json'
        }
      });

      const codeUrl = response.data.code_url;
      const qr = await QRCode.toDataURL(codeUrl);
      return res.json({ ok: true, qrCode: qr, outTradeNo, account: created.account, password: created.password, plan });
    } catch (error) {
      console.error('游客下单接口错误:', error.response ? error.response.data : error.message);
      return res.status(500).json({ ok: false, message: '支付失败' });
    }
  });

  app.get('/api/dealer/orders', async (req, res) => {
    try {
      const { dealer_name } = req.query;
      const dealerAccount = (dealer_name || '').toString().trim();
      if (!dealerAccount) return res.json({ ok: true, orders: [] });
      const channelName = await services.getChannelNameByPhone(dealerAccount);
      const orders = await services.getDealerOrders(channelName);
      return res.json({ ok: true, orders });
    } catch (err) {
      console.error('经销商订单查询错误:', err);
      return res.status(500).json({ ok: false, orders: [] });
    }
  });

  app.get('/api/dealer/accounts', async (req, res) => {
    try {
      const dealerAccount = (req.query.dealer_account || req.query.dealer_name || '').toString().trim();
      if (!dealerAccount) return res.json({ ok: true, accounts: [] });
      const channelName = await services.getChannelNameByPhone(dealerAccount);
      const accounts = await services.getDealerAccounts(channelName);
      return res.json({ ok: true, accounts });
    } catch (err) {
      console.error('经销商账号列表查询错误:', err);
      return res.status(500).json({ ok: false, accounts: [] });
    }
  });

  app.get('/api/dealer/account-logs', async (req, res) => {
    try {
      const dealerAccount = (req.query.dealer_account || req.query.dealer_name || '').toString().trim();
      const account = (req.query.account || '').toString().trim();
      if (!dealerAccount || !account) return res.json({ ok: true, logs: [] });
      const channelName = await services.getChannelNameByPhone(dealerAccount);
      const logs = await services.getDealerAccountLogs(channelName, account);
      return res.json({ ok: true, logs });
    } catch (err) {
      console.error('账号日志查询错误:', err);
      return res.status(500).json({ ok: false, logs: [] });
    }
  });

  app.post('/pay', async (req, res) => {
    try {
      const { account, plan: planInput, targetAccount, target_account } = req.body || {};
      if (!account) {
        return res.status(400).send('参数错误');
      }
      const dealerAccount = String(account).trim();
      const channelName = await services.getChannelNameByPhone(dealerAccount);
      const plan = services.normalizePlan(planInput);
      const credits = services.planToCredits(plan);
      const target = (targetAccount || target_account || '').toString().trim();
      let user = null;
      if (target) {
        user = await services.getUserByAccount(target);
        if (!user) {
          return res.status(400).json({ ok: false, message: '目标账号不存在' });
        }
        const owner = (user.channel_name || '').toString().trim();
        if (owner !== channelName) {
          return res.status(403).json({ ok: false, message: '目标账号不属于该渠道' });
        }
      } else {
        user = await services.createUserWithRandomCredentials({ channelName });
      }
      const outTradeNo = services.generateOutTradeNo();
      const amountFen = services.planToAmountFen(plan);
      const dn = channelName;
      try {
        await services.createPendingPayOrder({
          outTradeNo,
          amountFen,
          userId: user.user_id,
          channelName: dn,
          quotaAmount: credits
        });
      } catch (err) {
        console.error('创建订单失败:', err);
        return res.status(500).json({ ok: false, message: '创建订单失败' });
      }
      const payload = {
        appid: config.appid,
        mchid: config.mchid,
        description: services.planToDescription(plan),
        out_trade_no: outTradeNo,
        notify_url: config.notifyUrl,
        amount: {
          total: amountFen,
          currency: 'CNY'
        },
        attach: outTradeNo
      };

      const urlPath = '/v3/pay/transactions/native';
      const bodyStr = JSON.stringify(payload);
      const auth = generateAuthorization('POST', urlPath, bodyStr);

      const response = await axios.post(config.domain + urlPath, payload, {
        headers: {
          Authorization: auth,
          Accept: 'application/json',
          'Content-Type': 'application/json'
        }
      });

      const codeUrl = response.data.code_url;
      const qr = await QRCode.toDataURL(codeUrl);
      res.json({ ok: true, qrCode: qr, outTradeNo, plan, target_account: user.user_id });
    } catch (error) {
      console.error('支付接口错误:', error.response ? error.response.data : error.message);
      res.status(500).json({ ok: false, message: '支付失败' });
    }
  });

  app.post('/notify', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['wechatpay-signature'];
    const timestamp = req.headers['wechatpay-timestamp'];
    const nonce = req.headers['wechatpay-nonce'];
    const body = req.body.toString();

    const message = `${timestamp}\n${nonce}\n${body}\n`;
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(message);
    const verified = verifier.verify(config.publicKey, signature, 'base64');

    if (verified) {
      try {
        const notification = JSON.parse(body);
        if (notification.resource_type === 'encrypt-resource') {
          const eventId = notification.id || '';
          const eventType = notification.event_type || '';
          const createTime = notification.create_time || '';
          const resource = notification.resource;
          const decryptedStr = decryptNotification(
            resource.ciphertext,
            resource.associated_data,
            resource.nonce,
            config.apiV3Key
          );
          const decryptedData = JSON.parse(decryptedStr);
          const tradeState = decryptedData.trade_state;
          const outTradeNo = decryptedData.out_trade_no;
          const wxAmountFen =
            decryptedData.amount && typeof decryptedData.amount.total === 'number' ? decryptedData.amount.total : null;
          if (tradeState === 'SUCCESS' && outTradeNo) {
            try {
              await services.settlePayOrder({
                outTradeNo: String(outTradeNo),
                wxAmountFen: wxAmountFen === null ? undefined : wxAmountFen,
                transactionId: decryptedData.transaction_id || null,
                paidAt: decryptedData.success_time || null,
                eventId: eventId || null,
                eventType: eventType || null,
                notifyTime: createTime || null,
                source: 'WECHAT_NOTIFY'
              });
            } catch (err) {
              console.error('回调结算处理错误:', err);
            }
          }
        } else {
          console.log('支付通知数据:', notification);
        }
        res.status(200).send({ code: 'SUCCESS', message: '成功' });
      } catch (error) {
        console.error('回调处理错误:', error);
        res.status(500).send({ code: 'FAIL', message: '失败' });
      }
    } else {
      console.error('签名验证失败');
      res.status(401).send({ code: 'FAIL' });
    }
  });
}

module.exports = registerRoutes;
