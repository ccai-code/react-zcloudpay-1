export type OrderStatus = 'PENDING' | 'PAID' | 'CLOSED'

export type Plan = 'TRIAL' | 'FORMAL'

export type OrderItem = {
  account: string
  dealer_name: string
  plan: Plan
  amount: number
  status: OrderStatus
  created_ts: number
  paid_ts: number | null
  out_trade_no: string
  balance?: number
  password?: string | null
}

export type Profile = {
  account: string
  dealer_name: string
  plan: Plan | null
  service_status: 'PENDING' | 'ACTIVE'
  activated_ts: number | null
}

export type DealerServiceAccount = {
  account: string
  username?: string | null
  password: string | null
  balance: number
  last_recharge_ts: number | null
}
