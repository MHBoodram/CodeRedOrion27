const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../db');
const { HttpError, validate } = require('../errors');
const { signToken, requireAuth } = require('../middleware/auth');

const registerSchema = z.object({
  username: z.string().regex(/^[A-Za-z0-9_]{3,30}$/, '3-30 chars: letters, numbers, underscore'),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  display_name: z.string().trim().max(60).optional(),
});

const loginSchema = z.object({
  identifier: z.string().min(1), // username or email
  password: z.string().min(1),
});

const PUBLIC_USER = 'id, username, email, display_name, avatar_url, bio, created_at';

router.post('/register', validate(registerSchema), async (req, res) => {
  const { username, email, password, display_name } = req.valid;
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await db.query(
      `INSERT INTO users (username, email, password_hash, display_name)
       VALUES ($1, $2, $3, $4) RETURNING ${PUBLIC_USER}`,
      [username, email, hash, display_name || username]
    );
    res.status(201).json({ token: signToken(rows[0]), user: rows[0] });
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'Username or email already in use');
    throw err;
  }
});

router.post('/login', validate(loginSchema), async (req, res) => {
  const { identifier, password } = req.valid;
  const { rows } = await db.query(
    `SELECT ${PUBLIC_USER}, password_hash FROM users WHERE email = $1 OR username = $1`,
    [identifier]
  );
  const user = rows[0];
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) throw new HttpError(401, 'Invalid credentials');
  delete user.password_hash;
  res.json({ token: signToken(user), user });
});

router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await db.query(`SELECT ${PUBLIC_USER} FROM users WHERE id = $1`, [req.user.id]);
  if (!rows[0]) throw new HttpError(404, 'User not found');
  res.json({ user: rows[0] });
});

module.exports = router;
