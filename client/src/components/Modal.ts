type Options = {
  account: string
  dealer_name: string
  plan: 'TRIAL' | 'FORMAL'
  onOk: () => void
}

function isAbortError(e: unknown) {
  return (
    (e instanceof DOMException && e.name === 'AbortError') ||
    (typeof e === 'object' && e !== null && 'name' in e && (e as { name: unknown }).name === 'AbortError')
  )
}

export const Modal = {
  open({ account, dealer_name, plan, onOk }: Options) {
    const amount = plan === 'FORMAL' ? 1000 : 200
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div class="card-title">微信支付</div>
        <button class="btn btn-outline" id="modal_close">关闭</button>
      </div>
      <div class="modal-body">
        <div>
          <div class="row">
            <div class="muted">订单摘要</div>
          </div>
          <div style="margin-top:8px">
            <div style="font-weight:800; color:#1d4ed8">¥${amount}</div>
            <div class="muted">${plan === 'FORMAL' ? '正式服务账号' : '体验账号'}</div>
          </div>
          <div style="margin-top:16px" class="muted">请使用微信扫一扫，完成支付</div>
        </div>
        <div class="qr-box">
          <img id="wx_qr" class="qr-svg" />
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-outline" id="modal_cancel">取消</button>
      </div>
    </div>
    `
    document.body.appendChild(overlay)
    let timer: number | undefined
    let closed = false
    const payAbort = new AbortController()
    let statusAbort: AbortController | null = null

    const close = () => {
      if (closed) return
      closed = true

      if (timer !== undefined) {
        window.clearInterval(timer)
        timer = undefined
      }
      payAbort.abort()
      if (statusAbort) statusAbort.abort()

      if (overlay.isConnected) overlay.remove()
    }

    let outTradeNo = ''
    const qrImg = document.getElementById('wx_qr') as HTMLImageElement | null
    if (qrImg) {
      fetch('/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, dealerName: dealer_name, plan }),
        signal: payAbort.signal
      })
        .then(r => r.json())
        .then(d => {
          if (closed) return
          console.log('pay response', d)
          if (d && d.qrCode) {
            qrImg.src = d.qrCode
          }
          if (d && d.outTradeNo) {
            outTradeNo = d.outTradeNo
          }
        })
        .catch(e => {
          if (isAbortError(e)) return
          if (closed) return
          console.error('pay error', e)
          qrImg.alt = '二维码加载失败'
        })
    }

    document.getElementById('modal_close')?.addEventListener('click', close)
    document.getElementById('modal_cancel')?.addEventListener('click', close)

    let attempts = 0
    timer = window.setInterval(() => {
      if (closed) return

      if (!outTradeNo) {
        attempts += 1
        if (attempts >= 30) {
          close()
        }
        return
      }

      if (statusAbort) statusAbort.abort()
      statusAbort = new AbortController()

      fetch(`/api/order-status?out_trade_no=${encodeURIComponent(outTradeNo)}`, {
        signal: statusAbort.signal
      })
        .then(r => r.json())
        .then(d => {
          if (closed) return
          console.log('order-status response', d)
          if (!d || !d.ok) {
            return
          }
          if (d.paid) {
            close()
            onOk()
          }
        })
        .catch(e => {
          if (isAbortError(e)) return
          if (closed) return
          console.error('order-status error', e)
        })
    }, 2000)
  }
}
