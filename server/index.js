require('./loadEnv').loadServerEnv();

const express = require('express');
const registerRoutes = require('./routes');

const app = express();
const port = 3000;

registerRoutes(app);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

app.use((err, req, res, next) => {
  console.error('服务器错误:', err.stack);
  res.status(500).send('服务器内部错误');
});
