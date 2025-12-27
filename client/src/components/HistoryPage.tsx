import type { OrderItem, OrderStatus, Plan } from '../types'
import { formatTime } from '../utils/time.ts'

type Props = {
  items: OrderItem[]
}

export function HistoryPage({ items }: Props) {
  const rows = items.slice().sort((a, b) => b.created_ts - a.created_ts)

  return (
    <div className="card">
      <div className="card-title">充值记录</div>
      {rows.length === 0 ? (
        <div className="empty">暂无记录</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>账号</th>
              <th>经销商</th>
              <th>套餐</th>
              <th>金额</th>
              <th>状态</th>
              <th>下单时间</th>
              <th>支付时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.out_trade_no}>
                <td>{r.account}</td>
                <td>{r.dealer_name || '-'}</td>
                <td>{formatPlan(r.plan)}</td>
                <td>¥{r.amount}</td>
                <td>{formatStatus(r.status)}</td>
                <td>{formatTime(r.created_ts)}</td>
                <td>{r.paid_ts ? formatTime(r.paid_ts) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function formatStatus(s: OrderStatus) {
  if (s === 'PAID') return '已支付'
  if (s === 'CLOSED') return '已关闭'
  return '待支付'
}

function formatPlan(p: Plan) {
  if (p === 'FORMAL') return '正式服务'
  return '体验'
}
