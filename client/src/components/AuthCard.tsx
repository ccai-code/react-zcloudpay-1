import { useMemo, useState } from 'react'
import { API_BASE_URL } from '../config'

type Props = {
  onLogin: (account: string, password: string) => void
}

export function AuthCard({ onLogin }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = useMemo(() => {
    if (mode === 'register') return account.trim().length > 0
    return account.trim().length > 0 && password.length > 0
  }, [account, password, mode])

  return (
    <div className="auth-page">
      <div className="auth-split">
        <section className="auth-left">
          <div className="auth-left-inner">
            <div className="auth-left-brand">
              <span className="auth-mark" aria-hidden="true">
                <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
                  <circle cx="10" cy="10" r="4" fill="rgba(255,255,255,0.92)" />
                  <circle cx="22" cy="10" r="4" fill="rgba(255,255,255,0.74)" />
                  <circle cx="10" cy="22" r="4" fill="rgba(255,255,255,0.74)" />
                  <circle cx="22" cy="22" r="4" fill="rgba(255,255,255,0.92)" />
                </svg>
              </span>
              <span className="auth-left-brand-text">智网识客</span>
            </div>
            <div className="auth-left-title">智网识客充值系统</div>
            <div className="auth-left-subtitle">面向渠道的账号充值与额度管理平台，扫码支付后自动同步记录。</div>

            <div className="auth-left-card">
              <div className="auth-left-card-title">安全便捷的充值体验</div>
              <div className="auth-left-card-desc">支持微信扫码支付，支付成功自动刷新额度与购买记录，渠道运营更省心。</div>
            </div>
          </div>
        </section>

        <section className="auth-right">
          <div className="auth-form-card">
            <div className="auth-form-top">
              <div className="auth-form-logo" aria-hidden="true">
                <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
                  <circle cx="10" cy="10" r="4" fill="#1a73ff" />
                  <circle cx="22" cy="10" r="4" fill="#26d07c" />
                  <circle cx="10" cy="22" r="4" fill="#1a73ff" opacity="0.85" />
                  <circle cx="22" cy="22" r="4" fill="#1a73ff" opacity="0.65" />
                </svg>
              </div>
              <div className="auth-form-title">{mode === 'login' ? '智网识客充值系统' : '注册账号'}</div>
            </div>

            <div className="auth-field">
              <div className="auth-label">手机号</div>
              <input
                className="auth-input"
                value={account}
                onChange={e => setAccount(e.target.value)}
                placeholder="请输入手机号"
                autoComplete="username"
                onKeyDown={e => {
                  if (e.key === 'Enter') submit()
                }}
              />
            </div>

            {mode === 'login' && (
              <div className="auth-field">
                <div className="auth-label">密码</div>
                <div className="auth-input-wrap">
                  <input
                    className="auth-input"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="请输入登录密码"
                    autoComplete="current-password"
                    onKeyDown={e => {
                      if (e.key === 'Enter') submit()
                    }}
                  />
                  <button
                    type="button"
                    className="auth-eye-btn"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinejoin="round"
                      />
                      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="2" />
                      {!showPassword && (
                        <path
                          d="M4 4l16 16"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      )}
                    </svg>
                  </button>
                </div>
              </div>
            )}

            <button
              className="btn btn-primary auth-btn"
              onClick={() => submit()}
              disabled={!canSubmit || submitting}
            >
              {submitting ? '请稍候...' : mode === 'login' ? '登录' : '注册并生成密码'}
            </button>

            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  if (submitting) return
                  if (mode === 'login') {
                    setMode('register')
                    setPassword('')
                  } else {
                    setMode('login')
                  }
                }}
                style={{
                  appearance: 'none',
                  border: 'none',
                  padding: 0,
                  background: 'transparent',
                  color: 'var(--blue-600)',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 700
                }}
              >
                {mode === 'login' ? '注册账号' : '返回登录'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )

  async function submit() {
    if (!canSubmit || submitting) return
    if (mode === 'login') return onLogin(account, password)
    setSubmitting(true)
    try {
      const resp = await fetch(API_BASE_URL + '/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: account })
      })
      const d = await resp.json().catch(() => null)
      if (!d?.ok) {
        const msg = d?.message ? String(d.message) : '注册失败'
        alert(msg)
        return
      }
      const generated = d?.password ? String(d.password) : ''
      if (generated) {
        setPassword(generated)
        alert(`注册成功，密码：${generated}`)
      } else {
        alert('注册成功')
      }
      setMode('login')
    } finally {
      setSubmitting(false)
    }
  }
}
