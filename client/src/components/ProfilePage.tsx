import type { Profile } from '../types'
import { formatTime } from '../utils/time.ts'

type Props = {
  profile: Profile | null
  onLogout: () => void
}

export function ProfilePage({ profile, onLogout }: Props) {
  return (
    <div className="card">
      <div className="card-title">账户信息</div>
      {profile ? (
        <div className="grid cols-2">
          <div className="input">
            <label>账号</label>
            <input value={profile.account} disabled />
          </div>
          <div className="input">
            <label>经销商</label>
            <input value={profile.dealer_name || '-'} disabled />
          </div>
          <div className="input">
            <label>套餐</label>
            <input value={profile.plan === 'FORMAL' ? '正式服务' : profile.plan === 'TRIAL' ? '体验' : '-'} disabled />
          </div>
          <div className="input">
            <label>状态</label>
            <input value={profile.service_status === 'ACTIVE' ? '已开通' : '待开通'} disabled />
          </div>
          <div className="input">
            <label>开通时间</label>
            <input value={profile.activated_ts ? formatTime(profile.activated_ts) : '-'} disabled />
          </div>
        </div>
      ) : (
        <div className="empty">暂无信息</div>
      )}
      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-outline" onClick={onLogout}>
          退出登录
        </button>
      </div>
    </div>
  )
}
