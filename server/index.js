require('./loadEnv').loadServerEnv();

const express = require('express');
const registerRoutes = require('./routes');

const app = express();
const port = 3000;

app.use((req, res, next) => {
  const origins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const origin = req.headers.origin;
  const allow = origin && origins.includes(origin);
  if (allow) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  return next();
});

registerRoutes(app);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

app.use((err, req, res, next) => {
  console.error('服务器错误:', err.stack);
  res.status(500).send('服务器内部错误');
});
