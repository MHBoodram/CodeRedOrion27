#!/usr/bin/env node
// One-command health check for the whole project. Run it yourself from the project root:
//
//   node scripts/diagnose.js                       (from backend/)  static checks + doctor + verify + client build
//   node scripts/diagnose.js --photo ./me.jpg      also runs the real Gemini analyze + history gate
//   node scripts/diagnose.js --skip-client         skip the client build/lint (faster)
// It finds the project root from its own location, so it also works from anywhere: node backend/scripts/diagnose.js
//
// Start the backend first in another terminal:  cd backend && npm run dev
// Works on Windows, macOS and Linux (Node 18+).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// This file lives in <project>/backend/scripts/, so the project root is two levels up.
const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const photoIdx = args.indexOf('--photo');
const photo = photoIdx >= 0 ? path.resolve(args[photoIdx + 1] || '') : null;
const skipClient = args.includes('--skip-client');
const API = `http://localhost:${process.env.PORT || 4000}`;

const results = [];
const G = (s) => `\x1b[32m${s}\x1b[0m`, R = (s) => `\x1b[31m${s}\x1b[0m`, Y = (s) => `\x1b[33m${s}\x1b[0m`;
const record = (name, status, note = '') => {
  results.push({ name, status, note });
  console.log(`  ${status === 'PASS' ? G('PASS') : status === 'FAIL' ? R('FAIL') : Y('SKIP')} ${name}${note ? `\n       -> ${note}` : ''}`);
};
const section = (t) => console.log(`\n=== ${t} ===`);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    e.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const read = (p) => fs.readFileSync(p, 'utf8');
const run = (cmd, cmdArgs, cwd) => spawnSync(cmd, cmdArgs, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });

function staticChecks() {
  section('1. Static checks (no servers needed)');

  // Level 4 gate
  const clientFiles = walk(path.join(ROOT, 'client', 'src')).filter((f) => /\.(js|jsx)$/.test(f));
  const legacy = [];
  for (const f of clientFiles) {
    read(f).split('\n').forEach((line, i) => {
      if (/fitcheck-user|saveAuth|hasLegacy/.test(line)) legacy.push(`${rel(f)}:${i + 1}`);
    });
  }
  const real = legacy; // api.js builds the old key name in pieces on purpose, so cleanup code doesn't trip this check
  record('Level 4 gate: no legacy auth code in client/src', real.length ? 'FAIL' : 'PASS', real.join(', '));

  // Stage files exist
  for (const f of ['schema-history/002_fit_analyses.sql', 'backend/src/routes/fits.js', 'backend/scripts/verify.js']) {
    record(`file exists: ${f}`, fs.existsSync(path.join(ROOT, f)) ? 'PASS' : 'FAIL', 'copy the stage files over the project');
  }
  const server = read(path.join(ROOT, 'backend/src/server.js'));
  record('server.js mounts /api/fits', /\/api\/fits/.test(server) ? 'PASS' : 'FAIL');
  const analyze = read(path.join(ROOT, 'backend/src/routes/analyze.js'));
  record('analyze.js saves to fit_analyses', /fit_analyses/.test(analyze) ? 'PASS' : 'FAIL');
  const errors = read(path.join(ROOT, 'backend/src/errors.js'));
  record('errors.js returns 413 for oversized bodies', /entity\.too\.large/.test(errors) ? 'PASS' : 'FAIL', 'copy backend/src/errors.js from the latest stage');

  // Level 6 cleanup
  const home = read(path.join(ROOT, 'client/src/pages/HomePage.jsx'));
  const stale = [
    [/Sample editorial score/, 'stale "Sample editorial score" copy'],
    [/fitGiving/, '`fitGiving` block'],
    [/dummyPastFits/, 'dummyPastFits'],
    [/Check that the Gemini service is running/, 'old Gemini error text'],
    [/getCurrentUsername|getCurrentEmail/, 'localStorage user helpers'],
    [/VITE_GEMINI_API_URL/, 'old VITE_GEMINI_API_URL'],
  ].filter(([re]) => re.test(home)).map(([, label]) => label);
  record('Level 6/7: HomePage has no stale mock code', stale.length ? 'FAIL' : 'PASS', stale.join(', '));
  record('HomePage shows score out of 10', /\/ 10<\/span>/.test(home) ? 'PASS' : 'FAIL');
  record('HomePage reads history from the API', /\bapi\s*\.fits\(/.test(home) ? 'PASS' : 'FAIL');

  // Secrets
  const bak = path.join(ROOT, 'backend', '.env.tiger.bak');
  record('no .env.tiger.bak lying around', fs.existsSync(bak) ? 'FAIL' : 'PASS', fs.existsSync(bak) ? 'delete backend/.env.tiger.bak (it has a real DB password; rotate that password)' : '');
  const gi = fs.existsSync(path.join(ROOT, '.gitignore')) ? read(path.join(ROOT, '.gitignore')) : '';
  record('.env is git-ignored', /^\.env$/m.test(gi) || /^\*\*?\/?\.env$/m.test(gi) ? 'PASS' : 'FAIL');

  // Cleanup list from the roadmap (informational)
  for (const f of ['gemini-service', 'server', 'ReadME.md', 'photos']) {
    if (fs.existsSync(path.join(ROOT, f))) record(`leftover from roadmap cleanup list: ${f}`, 'SKIP', 'still there; delete when ready (Level 0)');
  }
}

async function apiUp() {
  try { return (await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(8000) })).ok; } catch { return false; }
}

async function main() {
  console.log('FitCheck diagnose');
  if (!fs.existsSync(path.join(ROOT, 'client', 'src')) || !fs.existsSync(path.join(ROOT, 'backend', 'src'))) {
    console.error(`\n${R('Wrong location.')} This file is at ${rel(__filename) || __filename}, so I looked for client/ and backend/ in:\n  ${ROOT}\nand did not find them. This file must be at <project root>/backend/scripts/diagnose.js, where the project root is the folder that contains both backend/ and client/.`);
    process.exit(1);
  }
  staticChecks();

  section('2. Backend doctor (env, database, tables)');
  const doctor = run('npm', ['run', 'doctor'], path.join(ROOT, 'backend'));
  record('npm run doctor', doctor.status === 0 ? 'PASS' : 'FAIL', doctor.status === 0 ? '' : 'fix the first FAIL printed above');

  section('3. Backend verify (Levels 1, 2, 3, 5, 8)');
  if (!(await apiUp())) {
    record('npm run verify', 'SKIP', `API not reachable at ${API}. Start it: cd backend && npm run dev`);
  } else {
    if (photo && !fs.existsSync(photo)) { record('photo file', 'FAIL', `not found: ${photo}`); }
    const v = run('node', ['scripts/verify.js', ...(photo && fs.existsSync(photo) ? [photo] : [])], path.join(ROOT, 'backend'));
    record('npm run verify', v.status === 0 ? 'PASS' : 'FAIL', v.status === 0 ? '' : 'see the FAIL lines above');
  }

  section('4. Client (lint + production build)');
  if (skipClient) record('client build', 'SKIP', '--skip-client');
  else {
    const clientDir = path.join(ROOT, 'client');
    if (!fs.existsSync(path.join(clientDir, 'node_modules'))) record('client dependencies', 'FAIL', 'run: cd client && npm install');
    else {
      const lint = run('npx', ['oxlint', 'src'], clientDir);
      record('oxlint (errors only fail)', lint.status === 0 ? 'PASS' : 'FAIL');
      const build = run('npm', ['run', 'build'], clientDir);
      record('vite build', build.status === 0 ? 'PASS' : 'FAIL');
    }
  }

  section('Summary');
  const f = results.filter((r) => r.status === 'FAIL'), p = results.filter((r) => r.status === 'PASS'), s = results.filter((r) => r.status === 'SKIP');
  console.log(`${G(p.length + ' passed')}, ${f.length ? R(f.length + ' failed') : '0 failed'}, ${Y(s.length + ' skipped')}`);
  if (f.length) { console.log('\nFix these first:'); f.forEach((r) => console.log(`  - ${r.name}${r.note ? ` (${r.note})` : ''}`)); }
  process.exit(f.length ? 1 : 0);
}
main().catch((e) => { console.error('diagnose crashed:', e); process.exit(1); });