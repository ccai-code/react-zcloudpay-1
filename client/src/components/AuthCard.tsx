import { useMemo, useState } from 'react'

type Props = {
  onLogin: (account: string, password: string) => void
}

export function AuthCard({ onLogin }: Props) {
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting] = useState(false)

  const canSubmit = useMemo(() => {
    return account.trim().length > 0 && password.length > 0
  }, [account, password])

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
              <div className="auth-form-title">智网识客充值系统</div>
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

            <button
              className="btn btn-primary auth-btn"
              onClick={() => submit()}
              disabled={!canSubmit || submitting}
            >
              {submitting ? '请稍候...' : '登录'}
            </button>

            
          </div>
        </section>
      </div>
    </div>
  )

  async function submit() {
    if (!canSubmit || submitting) return
    return onLogin(account, password)
  }
}
