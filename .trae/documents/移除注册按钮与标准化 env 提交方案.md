## 目标
- 移除登录页中的“注册账号”按钮与相关注册流程，仅保留登录。
- 标准化环境配置：以 .env.example 形式提供可提交到 Git 的示例配置，忽略真实敏感 .env/.env.local 文件。

## 代码改动
- 前端：更新 AuthCard 组件
  - 删除注册模式与切换链接；仅保留“手机号 + 密码”的登录表单与提交逻辑。
- 前端：环境示例与忽略
  - 新增 client/.env.example（VITE_API_BASE 示例值），更新 client/.gitignore 忽略 .env 与 .env.local。
  - 删除 client/.env.local（避免误提交本地环境文件）。
- 后端：环境示例
  - 新增 server/.env.example（DB_* 等使用占位符），保留现有 server/.gitignore 忽略 .env 与 wxpayConfig.js。
  - 不改动后端注册接口（/api/auth/register）以免影响其他调用方，但前端不再使用。

## 验证
- 登录页不再出现“注册账号”，仅可登录。
- 项目包含 .env.example（前后端），可安全提交到 Git；真实环境值通过本地 .env/.env.local 提供并被忽略。
- 构建时若未设置 VITE_API_BASE，前端仍使用默认回退地址。