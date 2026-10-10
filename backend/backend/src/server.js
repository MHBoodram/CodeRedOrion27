require('dotenv').config();

for (const key of ['DATABASE_URL', 'JWT_SECRET']) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key} (see .env.example)`);
    process.exit(1);
  }
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const db = require('./db');
const { errorHandler } = require('./errors');

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:3000')
      .split(',')
      .map((s) => s.trim()),
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (req, res) => {
  await db.query('SELECT 1');
  res.json({ status: 'ok' });
});


app.get('/', (req, res) => {
  res.json({
    name: 'FitCheck API',
    status: 'running',
    health: '/api/health',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      items: '/api/items',
      outfits: '/api/outfits',
    },
    example: '/api/outfits?sort=top',
  });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/items', require('./routes/items'));
app.use('/api/outfits', require('./routes/outfits'));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`FitCheck API listening on http://localhost:${port}`));
