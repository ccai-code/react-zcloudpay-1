## 目标
- 前端所有数据请求统一改为指向 https://paybg.zhihua.chat，停止本地自我请求 + 代理转发。
- 后端开启并正确配置 CORS，允许本地开发和需要的前端来源跨域访问。

## 现状确认
- 前端使用相对路径并依赖 Vite 代理：见 [vite.config.ts](file:///c:/Users/33664/Desktop/代码开发任务/2025年12月15日——微信支付框架/client/vite.config.ts#L13-L25)，将 "/api"、"/pay" 代理到 http://localhost:3000。
- 代码多处直接 fetch 相对路径：例如 [App.tsx](file:///c:/Users/33664/Desktop/代码开发任务/2025年12月15日——微信支付框架/client/src/App.tsx#L62-L75)、[AuthCard.tsx](file:///c:/Users/33664/Desktop/代码开发任务/2025年12月15日——微信支付框架/client/src/components/AuthCard.tsx#L156-L165)、[RechargePage.tsx](file:///c:/Users/33664/Desktop/代码开发任务/2025年12月15日——微信支付框架/client/src/components/RechargePage.tsx#L124-L132)。
- 后端未启用 CORS：见 [server/index.js](file:///c:/Users/33664/Desktop/代码开发任务/2025年12月15日——微信支付框架/server/index.js#L3-L13)。

## 前端改造方案
1. 新增统一 API 基础地址常量与封装（如 client/src/utils/api.ts）：
   - API_BASE 默认指向 https://paybg.zhihua.chat。
   - 支持通过环境变量 VITE_API_BASE 覆盖（方便测试或灰度）。
   - 提供 get/post 包装方法，内部用 fetch 拼接 `${API_BASE}/api/...` 或 `${API_BASE}/pay`。
2. 将所有直接使用相对路径的 fetch 改为调用封装：
   - 登录/注册/账户列表/订单状态/支付等调用统一走 API_BASE。
   - 涉及文件：App.tsx、AuthCard.tsx、RechargePage.tsx、Modal.ts（如有）。
3. 移除或禁用 Vite 代理：删除 [vite.config.ts](file:///c:/Users/33664/Desktop/代码开发任务/2025年12月15日——微信支付框架/client/vite.config.ts#L13-L25) 的 server.proxy，避免误用相对路径导致混乱。
4. 兼容性注意：移除代理后，任何 "fetch('/api/...')" 将不可用，必须改为使用封装或绝对地址。

## 后端 CORS 配置方案
1. 在 [server/index.js](file:///c:/Users/33664/Desktop/代码开发任务/2025年12月15日——微信支付框架/server/index.js#L3-L13) 引入并在注册路由前启用 CORS 中间件：
   - 允许来源通过环境变量 CORS_ORIGINS 配置（逗号分隔），默认包含：
     - http://localhost:5173、http://127.0.0.1:5173（本地开发）
   - 允许方法：GET, POST, OPTIONS。
   - 允许头：Content-Type, Authorization。
   - 支持预检响应（处理浏览器发起的 OPTIONS）。
   - 当前接口不需要凭据（cookies），不开启 credentials。
2. 在 server/.env 增加 CORS_ORIGINS，按需添加生产前端域名。
3. 保持 /notify 的原始体解析逻辑不变，CORS 中间件对其无副作用。

## 验证步骤
1. 启动前端（无代理）：浏览器直接发起到 https://paybg.zhihua.chat 的请求。
2. 使用开发者工具检查响应头：应包含 Access-Control-Allow-Origin 且为当前页面来源。
3. 执行一次完整流程：
   - 登录/注册 → 获取账号列表 → 生成二维码 → 轮询订单状态。
   - 预检请求（OPTIONS）应 200，业务响应正常。
4. 如需本地指向其他测试域，改写 VITE_API_BASE 验证。

## 备选与风险控制
- 如不希望大范围改动，可在入口处注入全局 window.__API_BASE__ 并集中替换，但长期维护建议采用封装文件与环境变量。
- 生产同域部署时（前端与后端同域），API_BASE 可设为同域或相对路径；此时可按需关闭 CORS。

请确认是否按以上方案实施；确认后我将批量改造前端请求、移除代理，并在后端接入 CORS 与 .env 配置。