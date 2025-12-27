import { useEffect, useState } from 'react'
import './index.css'
import { AuthCard } from './components/AuthCard'
import { RechargePage } from './components/RechargePage'
import type { DealerServiceAccount } from './types'
import { storage } from './utils/storage'

function App() {
  const [route, setRoute] = useState<'auth'|'dashboard'>('auth')
  const [session, setSession] = useState<{account: string} | null>(null)
  const [accounts, setAccounts] = useState<DealerServiceAccount[]>([])
  const account = session?.account || ''
  const isAuth = route === 'auth'

  useEffect(() => {
    const s = storage.get<{account:string}>('zwsk_session')
    if (s?.account) {
      setSession(s)
      setRoute('dashboard')
    }
  }, [])

  useEffect(() => {
    if (!account) return
    refreshAccounts(account)
  }, [account])

  return (
    <div id="app">
      {!isAuth && (
        <header className="app-header">
          <div className="brand">
            <div className="logo">识</div>
            <div>
              <div className="title">智网识客充值系统</div>
              <div className="subtitle">智网时刻 · 安全便捷充值管理</div>
            </div>
          </div>
          {session && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div className="muted">手机号：{account}</div>
              <button className="btn btn-outline" onClick={logout}>退出</button>
            </div>
          )}
        </header>
      )}
      <main className={isAuth ? 'app-main app-main-auth' : 'app-main'}>
        <div id="view">
          {route==='auth' && <AuthCard onLogin={onLogin} />}
          {route==='dashboard' && session && (
            <RechargePage
              dealerAccount={account}
              accounts={accounts}
              onRefresh={() => refreshAccounts(account)}
            />
          )}
        </div>
      </main>
    </div>
  )

  function onLogin(account: string, password: string) {
    fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ account, password })})
      .then(r=>r.json()).then(d=>{
        if (!d?.ok) return alert('账号或密码错误')
        const s = { account }
        setSession(s)
        storage.set('zwsk_session', s)
        setRoute('dashboard')
        refreshAccounts(account)
      })
  }
  function refreshAccounts(dealerAccount: string) {
    fetch(`/api/dealer/accounts?dealer_account=${encodeURIComponent(dealerAccount)}`)
      .then(r => r.json())
      .then(d => {
        if (d?.ok) setAccounts(d.accounts || [])
      })
  }
  function logout() {
    setSession(null)
    storage.set('zwsk_session', null)
    setAccounts([])
    setRoute('auth')
  }
}
export default App
