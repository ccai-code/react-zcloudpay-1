import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from 'react'
import type { DealerServiceAccount, Plan, OrderItem } from '../types'
import { formatTime } from '../utils/time'
import { api } from '../utils/api'

type Props = {
  dealerAccount: string
  accounts: DealerServiceAccount[]
  orders: OrderItem[]
  onRefresh: () => void
}

function amountText(plan: Plan) {
  return plan === 'FORMAL' ? '¥1000（100000额度）' : '¥200（10000额度）'
}

export function RechargePage({ dealerAccount, accounts, orders, onRefresh }: Props) {
  const [plan, setPlan] = useState<Plan>('TRIAL')
  const [targetAccount, setTargetAccount] = useState<string>('')
  const [amountYuan, setAmountYuan] = useState<number>(1000)
  const [qrCode, setQrCode] = useState<string>('')
  const [outTradeNo, setOutTradeNo] = useState<string>('')
  const [statusText, setStatusText] = useState<string>('点击生成二维码')
  const [payState, setPayState] = useState<'idle' | 'paying' | 'paid'>('idle')
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set())

  const pollTimer = useRef<number | null>(null)
  const pollAbort = useRef<AbortController | null>(null)
  const onRefreshRef = useRef(onRefresh)

  const targets = useMemo(() => {
    return accounts.map(a => ({
      id: a.account,
      label: a.username || a.account
    }))
  }, [accounts])

  const ordersByAccount = useMemo(() => {
    const map: Record<string, OrderItem[]> = {}
    for (const o of orders || []) {
      const key = o.account
      if (!map[key]) map[key] = []
      map[key].push(o)
    }
    return map
  }, [orders])

  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    const next = new Set<string>()
    for (const a of accounts || []) {
      if (a?.account) next.add(a.account)
    }
    setExpandedAccounts(next)
  }, [accounts])

  useEffect(() => {
    return () => {
      if (pollTimer.current !== null) window.clearInterval(pollTimer.current)
      pollTimer.current = null
      if (pollAbort.current) pollAbort.current.abort()
      pollAbort.current = null
    }
  }, [])

  useEffect(() => {
    if (!outTradeNo) return

    if (pollTimer.current !== null) window.clearInterval(pollTimer.current)
    pollTimer.current = null
    if (pollAbort.current) pollAbort.current.abort()
    pollAbort.current = null

    pollTimer.current = window.setInterval(() => {
      if (!outTradeNo) return
      if (pollAbort.current) pollAbort.current.abort()
      pollAbort.current = new AbortController()
      api(`/api/order-status?out_trade_no=${encodeURIComponent(outTradeNo)}`, { signal: pollAbort.current.signal })
        .then(r => r.json())
        .then(d => {
          if (!d?.ok) return
          if (d.paid) {
            setPayState('paid')
            setStatusText('支付成功')
            setOutTradeNo('')
            setQrCode('')
            onRefreshRef.current()
          } else {
            setStatusText('等待支付中…')
          }
        })
        .catch(() => {})
    }, 2000)

    return () => {
      if (pollTimer.current !== null) window.clearInterval(pollTimer.current)
      pollTimer.current = null
      if (pollAbort.current) pollAbort.current.abort()
      pollAbort.current = null
    }
  }, [outTradeNo])

  const createPay = useCallback(
    (forceTargetAccount?: string) => {
      const forcedTarget = typeof forceTargetAccount === 'string' ? forceTargetAccount.trim() : ''
      const target = forcedTarget || targetAccount.trim()
      const nextPlan: Plan = forcedTarget ? 'FORMAL' : plan

      if (nextPlan === 'FORMAL' && !target) {
        setStatusText('请选择要充值的账号')
        return
      }

      if (pollTimer.current !== null) window.clearInterval(pollTimer.current)
      pollTimer.current = null
      if (pollAbort.current) pollAbort.current.abort()
      pollAbort.current = null

      setPayState('paying')
      setStatusText('正在生成二维码…')
      setQrCode('')
      setOutTradeNo('')

      api('/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: dealerAccount,
          plan: nextPlan,
          targetAccount: nextPlan === 'FORMAL' ? target : undefined,
          amountYuan: nextPlan === 'FORMAL' ? amountYuan : undefined
        })
      })
        .then(r => r.json())
        .then(d => {
          if (!d?.ok || !d?.qrCode || !d?.outTradeNo) {
            setPayState('idle')
            setStatusText(d?.message || '生成二维码失败')
            return
          }
          setPayState('paying')
          setQrCode(d.qrCode)
          setOutTradeNo(d.outTradeNo)
          setStatusText('请使用微信扫码支付')
        })
        .catch(() => {
          setPayState('idle')
          setStatusText('生成二维码失败')
        })
    },
    [dealerAccount, plan, setStatusText, targetAccount]
  )



  return (
    <div className="grid cols-2">
      <div className="card">
        <div className="card-title">购买套餐</div>
        <div className="grid">
          <div className="row">
            <button
              className={plan === 'TRIAL' ? 'btn btn-primary' : 'btn btn-outline'}
              onClick={() => {
                setPlan('TRIAL')
                setTargetAccount('')
              }}
            >
              体验账号
            </button>
            <button
              className={plan === 'FORMAL' ? 'btn btn-primary' : 'btn btn-outline'}
              onClick={() => setPlan('FORMAL')}
            >
              额度充值
            </button>
            <div className="row" style={{ marginLeft: 'auto', gap: 8, alignItems: 'center' }}>
              {plan === 'FORMAL' ? (
                <>
                  <span className="muted">金额</span>
                  <input
                    type="number"
                    min={1000}
                    step={1000}
                    value={amountYuan}
                    onChange={e => {
                      const v = Math.max(1000, Math.round(Number(e.target.value) || 1000))
                      const stepped = Math.round(v / 1000) * 1000
                      setAmountYuan(stepped)
                    }}
                    style={{ width: 90 }}
                  />
                  <span className="muted">元</span>
                  <span className="muted">对应额度：{(amountYuan / 1000) * 100000}次</span>
                </>
              ) : (
                <div className="muted">{amountText(plan)}</div>
              )}
            </div>
          </div>

          <div className="input">
            <label>充值到账号</label>
            <select
              value={plan === 'TRIAL' ? '' : targetAccount}
              onChange={e => setTargetAccount(e.target.value)}
              disabled={plan === 'TRIAL'}
            >
              <option value="">{plan === 'TRIAL' ? '新账号（体验账号，自动生成）' : '请选择要充值的账号'}</option>
              {plan === 'FORMAL' &&
                targets.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
            </select>
          </div>

          <div className="row" style={{ alignItems: 'center' }}>
            <button
              className="btn btn-primary"
              onClick={() => createPay()}
              disabled={plan === 'FORMAL' && !targetAccount.trim()}
            >
              生成二维码
            </button>
            <div className="muted">{statusText}</div>
          </div>

          <div className="qr-box" style={{ justifySelf: 'start' }}>
            {qrCode ? (
              <img className="qr-svg" src={qrCode} alt="微信支付二维码" />
            ) : payState === 'paid' ? (
              <div className="row" style={{ gap: 10 }}>
                <div style={{ fontWeight: 900, color: '#16a34a' }}>支付成功</div>
                <button className="btn btn-outline" onClick={() => createPay()}>
                  再次购买
                </button>
              </div>
            ) : (
              <div className="empty">暂无二维码</div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">充值记录</div>
        {orders.length === 0 ? (
          <div className="empty">暂无记录</div>
        ) : (
          <div className="table-wrap table-wrap-limited" style={{ height: 420, overflowY: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 28 }}></th>
                  <th>时间</th>
                  <th>用户名</th>
                  <th>用户密码</th>
                  <th>充值金额</th>
                  <th>购买额度</th>
                  <th>累计购买</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(ordersByAccount).map(accountId => {
                  const list = ordersByAccount[accountId] || []
                  const acc = accounts.find(a => a.account === accountId)
                  const username = acc?.username || accountId
                  const totalCredits = list.reduce((sum, o) => sum + (o.amount >= 1000 ? 100000 : 10000), 0)
                  const collapsed = !expandedAccounts.has(accountId)
                  return (
                    <Fragment key={accountId}>
                      {collapsed
                        ? (
                          <tr>
                            <td>
                              <button
                                className="btn btn-outline"
                                style={{ padding: '0 6px', minWidth: 0 }}
                                onClick={() => {
                                  const next = new Set(expandedAccounts)
                                  next.add(accountId)
                                  setExpandedAccounts(next)
                                }}
                                title="展开"
                              >
                                ▸
                              </button>
                            </td>
                            <td colSpan={6}>{username}（已折叠）</td>
                          </tr>
                        )
                        : list.map((o, idx) => {
                            const purchaseCredits = o.amount >= 1000 ? 100000 : 10000
                            const pwd = o.password || acc?.password || '-'
                            const isFirst = idx === 0
                            return (
                              <tr key={`${o.out_trade_no}_${idx}`}>
                                <td>
                                  {isFirst ? (
                                    <button
                                      className="btn btn-outline"
                                      style={{ padding: '0 6px', minWidth: 0 }}
                                      onClick={() => {
                                        const next = new Set(expandedAccounts)
                                        next.delete(accountId)
                                        setExpandedAccounts(next)
                                      }}
                                      title="折叠"
                                    >
                                      ▾
                                    </button>
                                  ) : null}
                                </td>
                                <td>{formatTime(o.created_ts)}</td>
                                <td>{username}</td>
                                <td>{pwd}</td>
                                <td>¥{o.amount}</td>
                                <td>{purchaseCredits}次</td>
                                <td>{totalCredits}次</td>
                              </tr>
                            )
                          })}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
    </div>
  )
}
