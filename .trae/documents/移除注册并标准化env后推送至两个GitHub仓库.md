## 变更与安全
- 前端：删除注册账号按钮与注册逻辑，仅保留登录。
- 前后端：添加 .env.example（占位符），忽略 .env/.env.local；避免提交任何敏感值。

## 推送目标
- client → https://github.com/ccai-code/react-zcloudpay-1.git 分支 main
- server → https://github.com/ccai-code/express-zcloudpay-1.git 分支 main

## 实施步骤
1) 修改 AuthCard.tsx 移除注册模式与切换链接，精简为登录表单。
2) client：新增 .env.example（VITE_API_BASE=），更新 .gitignore 忽略 .env 与 .env.local。
3) server：新增 .env.example（DB_* 用占位符，CORS_ORIGINS 示例），保留 .gitignore 忽略 .env。
4) 构建提交文件列表（递归枚举 client 与 server 关键文件与子目录）。
5) 使用 GitHub API 将 client 文件推送至 react-zcloudpay-1/main，将 server 文件推送至 express-zcloudpay-1/main。

## 验证
- 登录页无“注册账号”入口。
- 仓库包含 .env.example，无敏感值；真实环境文件未上传。
- 两个仓库文件结构完整可构建运行。