// Diagnoses "nothing loads / stuck on Please wait". Run:  cd backend && npm run doctor
// Checks, in order: env vars -> database -> tables/seed data -> running API -> login -> Vite proxy.
require('dotenv').config();
const { Client } = require('pg');

const API = `http://localhost:${process.env.PORT || 4000}`;
const CLIENT = process.env.CLIENT_URL || 'http://localhost:5173';
let failed = 0;
const ok = (m) => console.log(`  \x1b[32mPASS\x1b[0m ${m}`);
const bad = (m, fix) => { failed++; console.log(`  \x1b[31mFAIL\x1b[0m ${m}${fix ? `\n       -> ${fix}` : ''}`); };
const warn = (m) => console.log(`  \x1b[33mWARN\x1b[0m ${m}`);
const step = (m) => console.log(`\n${m}`);

async function timed(promise, ms, label) {
  let t;
  const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${label} timed out after ${ms / 1000}s`)), ms); });
  try { return await Promise.race([promise, timeout]); } finally { clearTimeout(t); }
}

async function checkEnv() {
  step('1. Environment (backend/.env)');
  for (const k of ['DATABASE_URL', 'JWT_SECRET']) {
    if (!process.env[k]) bad(`${k} is missing`, 'copy .env.example to .env and fill it in');
    else ok(`${k} is set`);
  }
  if (process.env.JWT_SECRET === 'change-me') warn('JWT_SECRET is still "change-me"');
  if (/YOUR_PASSWORD|YOUR_HOST/.test(process.env.DATABASE_URL || '')) bad('DATABASE_URL still has placeholder text', 'paste your real Tiger connection string');
  if (process.env.GEMINI_API_KEY) ok('GEMINI_API_KEY is set'); else warn('GEMINI_API_KEY is not set (analyze will return 503 until it is)');
  if (!process.env.DATABASE_URL) return false;
  try { new URL(process.env.DATABASE_URL); } catch { bad('DATABASE_URL is not a valid URL', 'special characters in the password must be URL-encoded'); return false; }
  return true;
}

async function checkDb() {
  step('2. Database');
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.delete('sslmode');
  console.log(`  host: ${url.hostname}:${url.port || 5432}  db: ${url.pathname.slice(1)}  user: ${url.username}`);
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  const client = new Client({ connectionString: url.toString(), ssl: isLocal ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
  try {
    await timed(client.connect(), 10000, 'DB connect');
    await client.query('SELECT 1');
    ok('connected and ran SELECT 1');
  } catch (e) {
    bad(`cannot connect: ${e.message}`, 'check host/port/password; make sure the Tiger service is running (not paused) and your network allows the port. THIS is what makes the login hang.');
    return;
  }
  try {
    const { rows } = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`);
    const have = new Set(rows.map((r) => r.table_name));
    const need = ['users', 'outfits', 'ratings', 'comments', 'follows', 'fit_analyses', 'notifications'];
    const missing = need.filter((t) => !have.has(t));
    if (missing.length) bad(`missing tables: ${missing.join(', ')}`, missing.every((t) => ['fit_analyses', 'notifications'].includes(t)) ? 'psql "$DATABASE_URL" -f schema-history/002_fit_analyses.sql -f schema-history/003_notifications.sql' : 'psql "$DATABASE_URL" -f schema-history/schema.sql (then 002_fit_analyses.sql)');
    else ok('core tables exist');
    if (!missing.includes('users')) {
      const u = await client.query(`SELECT username FROM users WHERE username = 'alice'`);
      if (u.rows.length) ok('demo user "alice" exists');
      else bad('demo user "alice" not found', 'npm run seed');
    }
    if (!missing.includes('outfits')) {
      const o = await client.query('SELECT count(*)::int AS n FROM outfits');
      o.rows[0].n ? ok(`${o.rows[0].n} outfits in DB`) : warn('no outfits (run npm run seed)');
    }
  } catch (e) {
    bad(`query failed: ${e.message}`);
  } finally {
    await client.end().catch(() => {});
  }
}

async function http(url, opts = {}, ms = 8000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...opts, signal: c.signal }); } finally { clearTimeout(t); }
}

async function checkApi() {
  step(`3. API server (${API})`);
  let res;
  try {
    res = await http(`${API}/api/health`);
  } catch (e) {
    bad(e.name === 'AbortError' ? 'GET /api/health hung (no answer in 8s)' : `cannot reach the server: ${e.message}`,
      e.name === 'AbortError' ? 'server is up but the DB is not answering; fix step 2' : 'start it in another terminal: cd backend && npm run dev');
    return false;
  }
  if (res.ok) ok(`GET /api/health -> ${res.status} ${JSON.stringify(await res.json())}`);
  else { bad(`GET /api/health -> ${res.status}: ${(await res.text()).slice(0, 200)}`, 'usually the DB; see step 2 and the backend terminal output'); return false; }

  try {
    const r = await http(`${API}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'alice', password: 'password123' }),
    }, 15000);
    const body = await r.json().catch(() => ({}));
    if (r.ok && body.token) ok('POST /api/auth/login as alice -> got a token');
    else bad(`login -> ${r.status} ${JSON.stringify(body)}`, r.status === 401 ? 'run npm run seed -- --reset' : 'see the backend terminal for the error');
  } catch (e) {
    bad(`login request failed: ${e.name === 'AbortError' ? 'hung 15s' : e.message}`);
  }
  return true;
}

async function checkClient() {
  step(`4. Client / Vite proxy (${CLIENT})`);
  try {
    const r = await http(`${CLIENT}/api/health`, {}, 5000);
    if (r.ok) ok('Vite proxy forwards /api to the backend');
    else bad(`${CLIENT}/api/health -> ${r.status}`, 'check client/vite.config.js proxy target matches the backend port');
  } catch {
    warn(`client dev server not reachable at ${CLIENT} (start it: cd client && npm run dev), skipping`);
  }
}

(async () => {
  console.log('FitCheck doctor');
  const envOk = await checkEnv();
  if (envOk) await checkDb();
  await checkApi();
  await checkClient();
  console.log(failed ? `\n${failed} problem(s) found. Fix the first FAIL above first.` : '\nAll checks passed.');
  process.exit(failed ? 1 : 0);
})();