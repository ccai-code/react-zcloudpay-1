import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE_URL } from '../config'
import type { DealerServiceAccount, Plan } from '../types'
import { formatTime } from '../utils/time'

type Props = {
  dealerAccount: string
  accounts: DealerServiceAccount[]
  onRefresh: () => void
}

type AccountLog = {
  log_type: 'RECHARGE' | 'CONSUME' | string
  delta_credits: number
  balance: number
  amount: number | null
  order_no: string | null
  transaction_id: string | null
  remark: string | null
  created_ts: number | null
}

function amountText(plan: Plan) {
  return plan === 'FORMAL' ? '¥1000（100000额度）' : '¥200（10000额度）'
}

export function RechargePage({ dealerAccount, accounts, onRefresh }: Props) {
  const [plan, setPlan] = useState<Plan>('TRIAL')
  const [targetAccount, setTargetAccount] = useState<string>('')
  const [qrCode, setQrCode] = useState<string>('')
  const [outTradeNo, setOutTradeNo] = useState<string>('')
  const [statusText, setStatusText] = useState<string>('点击生成二维码')
  const [payState, setPayState] = useState<'idle' | 'paying' | 'paid'>('idle')
  const [logsOpen, setLogsOpen] = useState(false)
  const [logsAccountLabel, setLogsAccountLabel] = useState('')
  const [logs, setLogs] = useState<AccountLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState<string>('')
  const [createdInfo, setCreatedInfo] = useState<{ account: string; password?: string } | null>(null)

  const pollTimer = useRef<number | null>(null)
  const pollAbort = useRef<AbortController | null>(null)
  const logsAbort = useRef<AbortController | null>(null)
  const onRefreshRef = useRef(onRefresh)

  const targets = useMemo(() => {
    return accounts.map(a => ({
      id: a.account,
      label: a.username || a.account
    }))
  }, [accounts])

  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    return () => {
      if (pollTimer.current !== null) window.clearInterval(pollTimer.current)
      pollTimer.current = null
      if (pollAbort.current) pollAbort.current.abort()
      pollAbort.current = null
      if (logsAbort.current) logsAbort.current.abort()
      logsAbort.current = null
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
      fetch(`${API_BASE_URL}/api/order-status?out_trade_no=${encodeURIComponent(outTradeNo)}`, { signal: pollAbort.current.signal })
        .then(r => r.json())
        .then(d => {
          if (!d?.ok) return
          if (d.paid) {
            setPayState('paid')
            setStatusText('支付成功')
            setOutTradeNo('')
            setQrCode('')
            
            // 支付成功后，重新获取账号列表以展示最新的账号信息
            if (d.account) {
              setCreatedInfo({ account: d.account, password: d.password })
            } else {
              // 如果订单状态接口没有返回账号信息，尝试获取最新的账号列表
              fetch(`${API_BASE_URL}/api/dealer/accounts?dealer_account=${encodeURIComponent(dealerAccount)}`)
                .then(r => r.json())
                .then(res => {
                   if (res?.ok && Array.isArray(res.accounts) && res.accounts.length > 0) {
                     // 获取第一个账号（最新创建的）
                     const latestAccount = res.accounts[0]
                     setCreatedInfo({ 
                       account: latestAccount.username || latestAccount.account, 
                       password: latestAccount.password || undefined 
                     })
                   }
                })
                .catch(err => console.error('Failed to fetch latest account info', err))
            }
            
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
  }, [outTradeNo, dealerAccount])

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
      setCreatedInfo(null)

      fetch(API_BASE_URL + '/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: dealerAccount,
          plan: nextPlan,
          targetAccount: nextPlan === 'FORMAL' ? target : undefined
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('复制成功')
    }).catch(() => {
      alert('复制失败，请手动复制')
    })
  }

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
            <div className="muted" style={{ marginLeft: 'auto' }}>
              {amountText(plan)}
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
              {plan === 'TRIAL' ? '购买账号' : '立即充值'}
            </button>
            <div className="muted">{statusText}</div>
          </div>

          <div className="qr-box" style={{ justifySelf: 'start', minHeight: 220, minWidth: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {qrCode ? (
              <img className="qr-svg" src={qrCode} alt="微信支付二维码" />
            ) : payState === 'paid' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', width: '100%', padding: '0 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#16a34a' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z" fill="currentColor"/>
                  </svg>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>支付成功</div>
                </div>
                {createdInfo ? (
                  <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0', width: '100%', boxSizing: 'border-box', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                    <div style={{ marginBottom: 12, color: '#64748b', fontSize: '0.9em', fontWeight: 600, borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>新账号信息已生成</div>
                    <div style={{ display: 'grid', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ color: '#64748b', fontSize: 13, minWidth: 60 }}>会员账号</div>
                        <div style={{ fontWeight: 'bold', userSelect: 'all', fontFamily: 'monospace', fontSize: 15, color: '#1e293b' }}>{createdInfo.account}</div>
                        <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: 12, height: 'auto' }} onClick={() => copyToClipboard(createdInfo.account)}>复制</button>
                      </div>
                      {createdInfo.password && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ color: '#64748b', fontSize: 13, minWidth: 60 }}>初始密码</div>
                          <div style={{ fontWeight: 'bold', userSelect: 'all', fontFamily: 'monospace', fontSize: 15, color: '#1e293b' }}>{createdInfo.password}</div>
                          <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: 12, height: 'auto' }} onClick={() => copyToClipboard(createdInfo.password)}>复制</button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="muted" style={{ fontSize: 14 }}>充值成功，额度已更新</div>
                )}
                <button className="btn btn-outline" onClick={() => createPay()} style={{ width: '100%', marginTop: 8 }}>
                  再次购买
                </button>
              </div>
            ) : (
              <div className="empty" style={{ padding: 0 }}>暂无二维码</div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">购买记录</div>
        {accounts.length === 0 ? (
          <div className="empty">暂无记录</div>
        ) : (
          <div className="table-wrap table-wrap-limited">
            <table className="table">
              <thead>
                <tr>
                  <th>账号</th>
                  <th>密码</th>
                  <th>当前额度</th>
                  <th>最新充值</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(a => (
                  <tr key={a.account}>
                    <td>{a.username || a.account}</td>
                    <td>{a.password || '-'}</td>
                    <td>
                      <button
                        className="btn btn-outline"
                        style={{ padding: '6px 10px' }}
                        onClick={() => openLogs(a.account, a.username || a.account)}
                      >
                        {a.balance}
                      </button>
                    </td>
                    <td>{a.last_recharge_ts ? formatTime(a.last_recharge_ts) : '-'}</td>
                    <td>
                      <div className="table-actions">
                        <button className="btn btn-outline" onClick={() => quickTopup(a.account, 'FORMAL')}>
                          续费¥1000
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {logsOpen && (
        <div
          className="modal-overlay"
          onClick={e => {
            if (e.target === e.currentTarget) closeLogs()
          }}
        >
          <div className="modal modal-logs">
            <div className="modal-header">
              <div className="card-title">额度日志</div>
              <button className="btn btn-outline" onClick={closeLogs}>
                关闭
              </button>
            </div>
            <div className="modal-body" style={{ gridTemplateColumns: '1fr' }}>
              <div className="muted" style={{ marginBottom: 10 }}>
                账号：{logsAccountLabel}
              </div>
              {logsLoading ? (
                <div className="empty">加载中…</div>
              ) : logsError ? (
                <div className="empty">{logsError}</div>
              ) : logs.length === 0 ? (
                <div className="empty">暂无日志</div>
              ) : (
                <div className="table-wrap table-wrap-no-scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>时间</th>
                        <th>类型</th>
                        <th>变化</th>
                        <th>余额</th>
                        <th>金额</th>
                        <th>备注/订单</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((l, i) => (
                        <tr key={`${l.order_no || ''}_${l.created_ts || ''}_${i}`}>
                          <td>{l.created_ts ? formatTime(l.created_ts) : '-'}</td>
                          <td>{l.log_type === 'RECHARGE' ? '充值' : l.log_type === 'CONSUME' ? '使用' : l.log_type}</td>
                          <td style={{ fontWeight: 800, color: l.delta_credits >= 0 ? '#16a34a' : '#ef4444' }}>
                            {l.delta_credits >= 0 ? `+${l.delta_credits}` : `${l.delta_credits}`}
                          </td>
                          <td>{l.balance}</td>
                          <td>{l.amount === null ? '-' : `¥${l.amount}`}</td>
                          <td>{l.remark || l.order_no || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )

  function quickTopup(account: string, nextPlan: Plan) {
    setTargetAccount(account)
    setPlan(nextPlan)
  }

  function closeLogs() {
    setLogsOpen(false)
    setLogsAccountLabel('')
    setLogs([])
    setLogsError('')
    setLogsLoading(false)
    if (logsAbort.current) logsAbort.current.abort()
    logsAbort.current = null
  }

  function openLogs(accountId: string, label?: string) {
    const a = accountId.trim()
    if (!a) return
    if (logsAbort.current) logsAbort.current.abort()
    logsAbort.current = new AbortController()
    setLogsOpen(true)
    setLogsAccountLabel((label || a).trim() || a)
    setLogs([])
    setLogsError('')
    setLogsLoading(true)

    fetch(
      `${API_BASE_URL}/api/dealer/account-logs?dealer_account=${encodeURIComponent(dealerAccount)}&account=${encodeURIComponent(a)}`,
      { signal: logsAbort.current.signal }
    )
      .then(r => r.json())
      .then(d => {
        if (!d?.ok) {
          setLogsError('日志获取失败')
          setLogsLoading(false)
          return
        }
        setLogs(Array.isArray(d.logs) ? d.logs : [])
        setLogsLoading(false)
      })
      .catch(() => {
        setLogsError('日志获取失败')
        setLogsLoading(false)
      })
  }
}
