

const express = require('express');
const cors = require('cors');
const registerRoutes = require('./src/routes');

const app = express();
const port = 80;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

registerRoutes(app);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

app.use((err, req, res, next) => {
  console.error('服务器错误:', err.stack);
  res.status(500).send('服务器内部错误');
});
