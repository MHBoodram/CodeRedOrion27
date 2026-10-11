// Automated gate checks for the wiring roadmap (Levels 1, 2, 3, 5, 8, 9). Needs the API running.
// Usage:  npm run verify                       (no Gemini call is made)
//         npm run verify -- path/to/photo.jpg  (also runs the real Gemini analyze, needs GEMINI_API_KEY on the server)
// Creates throwaway users named verify_* and deletes them (and their data) at the end.
require('dotenv').config();
const fs = require('fs');
const db = require('../src/db');

const API = process.env.API_URL || `http://localhost:${process.env.PORT || 4000}`;
const photoPath = process.argv[2];
let passed = 0, failed = 0, skipped = 0;
const ok = (m) => { passed++; console.log(`  \x1b[32mPASS\x1b[0m ${m}`); };
const bad = (m, extra) => { failed++; console.log(`  \x1b[31mFAIL\x1b[0m ${m}${extra ? `\n       -> ${extra}` : ''}`); };
const skip = (m) => { skipped++; console.log(`  \x1b[33mSKIP\x1b[0m ${m}`); };
const check = (cond, m, extra) => (cond ? ok(m) : bad(m, extra));
const step = (m) => console.log(`\n${m}`);

async function call(path, { method = 'GET', body, token, raw } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)), signal: AbortSignal.timeout(90000) });
  let data = null;
  try { data = res.status === 204 ? null : await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, data };
}

const login = async (identifier, password = 'password123') => (await call('/api/auth/login', { method: 'POST', body: { identifier, password } }));
const FAKE_IMG = 'A'.repeat(400); // valid base64 shape; Gemini never sees it unless a key is set (then it may reject it, which is fine)

(async () => {
  console.log(`FitCheck verify  (${API})`);
  const stamp = Date.now().toString(36);
  const uname = `verify_${stamp}`;

  step('Level 1: core API');
  let a;
  try {
    a = await login('alice');
  } catch (e) {
    console.log(`  \x1b[31mFAIL\x1b[0m cannot reach the API at ${API}: ${e.cause?.code || e.message}\n       -> start it in another terminal: cd backend && npm run dev`);
    process.exit(1);
  }
  check(a.status === 200 && a.data?.token, 'alice can log in', `got ${a.status} ${JSON.stringify(a.data)} (run npm run seed)`);
  if (!a.data?.token) { console.log('\nCannot continue without the demo user.'); process.exit(1); }
  const aliceToken = a.data.token;
  const me = await call('/api/auth/me', { token: aliceToken });
  check(me.status === 200 && me.data?.user?.username === 'alice', 'GET /auth/me returns the user');
  check((await call('/api/auth/me')).status === 401, 'GET /auth/me without a token is 401');
  const feed = await call('/api/outfits?scope=all&limit=50', { token: aliceToken });
  const outfits = feed.data?.outfits || [];
  check(feed.status === 200 && outfits.length > 0, `feed returns outfits (${outfits.length})`);
  check((await call('/api/health')).data?.status === 'ok', '/api/health is ok');

  step('Level 5: signup / login errors');
  const reg = await call('/api/auth/register', { method: 'POST', body: { username: uname, email: `${uname}@example.com`, password: 'password123', display_name: 'Verify Bot' } });
  check(reg.status === 201 && reg.data?.token, 'new user can sign up');
  const token = reg.data?.token;
  check((await call('/api/auth/register', { method: 'POST', body: { username: uname, email: `other_${uname}@example.com`, password: 'password123' } })).status === 409, 'duplicate username is 409');
  check((await call('/api/auth/register', { method: 'POST', body: { username: `${uname}x`, email: `${uname}x@example.com`, password: 'short' } })).status === 400, 'password under 8 chars is 400');
  check((await login(uname, 'wrong-password')).status === 401, 'wrong password is 401');
  check((await login(uname)).status === 200, 'new user can log back in');
  check((await call('/api/auth/me', { token: 'garbage' })).status === 401, 'bad token is 401');

  step('Level 8: rate and comment');
  const others = outfits.filter((o) => o.author?.username !== 'alice' && o.user?.username !== 'alice' && o.username !== 'alice');
  const target = others[0] || outfits[0];
  const own = outfits.find((o) => (o.author?.username || o.user?.username || o.username) === 'alice');
  if (!target) skip('no outfit to rate');
  else {
    const r1 = await call(`/api/outfits/${target.id}/rating`, { method: 'PUT', token, body: { score: 5 } });
    check(r1.status === 200 && r1.data?.my_rating === 5, 'rating an outfit works', JSON.stringify(r1.data));
    const r2 = await call(`/api/outfits/${target.id}/rating`, { method: 'PUT', token, body: { score: 3 } });
    check(r2.status === 200 && r2.data?.rating_count === r1.data?.rating_count, 're-rating updates instead of adding a second rating');
    check((await call(`/api/outfits/${target.id}/rating`, { method: 'PUT', token, body: { score: 9 } })).status === 400, 'score outside 1-5 is 400');
    const text = `verify comment ${stamp}`;
    const c = await call(`/api/outfits/${target.id}/comments`, { method: 'POST', token, body: { body: text } });
    check(c.status === 201, 'posting a comment works');
    const list = await call(`/api/outfits/${target.id}/comments`, { token });
    check(list.data?.comments?.some((x) => x.body === text), 'comment is still there after a re-fetch ("refresh")');
    const reread = await call(`/api/outfits/${target.id}`, { token });
    check(reread.status === 200, 'outfit can be re-read after rating');
  }
  if (own) {
    const self = await call(`/api/outfits/${own.id}/rating`, { method: 'PUT', token: aliceToken, body: { score: 5 } });
    check(self.status === 403, "can't rate your own outfit (403)", `got ${self.status}`);
  } else skip("no alice-owned outfit in the feed to test self-rating");

  step('Level 2: analyze (failure paths)');
  const noAuth = await call('/api/analyze-outfit', { method: 'POST', body: { image: FAKE_IMG, targetStyle: 'x' } });
  check(noAuth.status === 401, 'analyze without a token is 401');
  const noStyle = await call('/api/analyze-outfit', { method: 'POST', token, body: { image: FAKE_IMG, targetStyle: '' } });
  check(noStyle.status === 400, 'empty target style is 400');
  const badType = await call('/api/analyze-outfit', { method: 'POST', token, body: { image: FAKE_IMG, mimeType: 'image/gif', targetStyle: 'x' } });
  check(badType.status === 400, 'unsupported mime type is 400');
  const badThumb = await call('/api/analyze-outfit', { method: 'POST', token, body: { image: FAKE_IMG, targetStyle: 'x', thumbnail: 'javascript:alert(1)' } });
  check(badThumb.status === 400, 'non-JPEG thumbnail is rejected (400)');
  const tiny = await call('/api/analyze-outfit', { method: 'POST', token, body: { image: 'AAAA', targetStyle: 'x' } });
  check(tiny.status === 400, 'too-small image is 400');
  const huge = await call('/api/analyze-outfit', { method: 'POST', token, body: { image: 'A'.repeat(5_500_000), targetStyle: 'x' } });
  check(huge.status === 400, 'image over the size cap is 400', `got ${huge.status}`);
  check((await call('/api/analyze-outfit', { method: 'POST', token, raw: '{not json' })).status === 400, 'malformed JSON is 400');
  const over = await call('/api/analyze-outfit', { method: 'POST', token, raw: JSON.stringify({ image: 'A'.repeat(7_000_000), targetStyle: 'x' }) });
  check(over.status === 413, 'body over the 6 MB limit is 413 (not 500)', `got ${over.status}`);
  const overNormal = await call('/api/auth/login', { method: 'POST', raw: JSON.stringify({ identifier: 'A'.repeat(1_500_000), password: 'x' }) });
  check(overNormal.status === 413, 'body over the 1 MB limit on normal routes is 413', `got ${overNormal.status}`);

  step('Level 3: history (no Gemini needed)');
  const fresh = await call('/api/fits', { token });
  check(fresh.status === 200 && Array.isArray(fresh.data?.fits) && fresh.data.fits.length === 0, 'new user starts with empty history');
  check((await call('/api/fits')).status === 401, 'GET /fits without a token is 401');
  check((await call('/api/fits?limit=0', { token })).status === 400, 'limit=0 is 400');

  step('Level 2 + 3: real Gemini analyze');
  if (!photoPath) skip('no photo given. Run: npm run verify -- path/to/photo.jpg (server needs GEMINI_API_KEY)');
  else if (!fs.existsSync(photoPath)) bad(`photo not found: ${photoPath}`);
  else {
    const mime = /\.png$/i.test(photoPath) ? 'image/png' : /\.webp$/i.test(photoPath) ? 'image/webp' : 'image/jpeg';
    const image = fs.readFileSync(photoPath).toString('base64');
    const run = () => call('/api/analyze-outfit', { method: 'POST', token, body: { image, mimeType: mime, targetStyle: 'streetwear', weather: { tempF: 70, description: 'Clear' } } });
    const r = await run();
    if (r.status === 503) skip('server has no GEMINI_API_KEY (503). Add it to backend/.env and restart');
    else if (r.status !== 200) bad(`analyze returned ${r.status}`, JSON.stringify(r.data));
    else {
      const d = r.data;
      const shape = ['verdict', 'detectedStyle', 'colors', 'whatsWorking', 'improvements', 'weatherFit'].every((k) => k in d);
      check(shape, 'response has verdict, detectedStyle, colors, whatsWorking, improvements, weatherFit');
      if (d.score === null) skip('Gemini saw no outfit in that photo (score null), so it was not saved. Try a photo of a person');
      else {
        check(typeof d.score === 'number' && d.score >= 1 && d.score <= 10, `score is 1-10 (${d.score})`);
        check(Boolean(d.id), 'analysis was saved (has an id)');
        await run();
        const h = await call('/api/fits', { token });
        check(h.data?.fits?.length === 2, 'GATE: analyze twice, GET /api/fits lists both', `got ${h.data?.fits?.length}`);
      }
    }
  }

  step('Level 9: notifications');
  const probe = await call('/api/notifications', { token });
  if (probe.status === 500) {
    bad('GET /api/notifications failed (500)', 'run the migration: psql "$DATABASE_URL" -f schema-history/003_notifications.sql');
  } else {
    check((await call('/api/notifications')).status === 401, 'GET /notifications without a token is 401');
    check(probe.status === 200 && Array.isArray(probe.data?.notifications) && probe.data.unreadCount === 0, 'new user starts with no notifications');
    // A second throwaway user: the first one follows them, so they receive a "follow" notification.
    const uname2 = `verify_b_${stamp}`;
    const reg2 = await call('/api/auth/register', { method: 'POST', body: { username: uname2, email: `${uname2}@example.com`, password: 'password123' } });
    const token2 = reg2.data?.token;
    check((await call(`/api/users/${uname2}/follow`, { method: 'POST', token })).status === 200, 'following a user works');
    await call(`/api/users/${uname2}/follow`, { method: 'DELETE', token });
    await call(`/api/users/${uname2}/follow`, { method: 'POST', token }); // follow again: still only one unread notification
    const n2 = await call('/api/notifications', { token: token2 });
    const follows = (n2.data?.notifications || []).filter((n) => n.type === 'follow' && n.actor?.username === uname);
    check(follows.length === 1 && n2.data.unreadCount === 1, 'follow creates one notification (re-follow does not duplicate it)', JSON.stringify(n2.data));
    const self = await call(`/api/users/${uname}/follow`, { method: 'POST', token });
    check(self.status === 400 && (await call('/api/notifications', { token })).data?.unreadCount === 0, 'following yourself is rejected and notifies nobody');
    const nid = follows[0]?.id;
    check((await call(`/api/notifications/${nid}/read`, { method: 'POST', token })).status === 404, "can't mark someone else's notification read (404)");
    check((await call(`/api/notifications/${nid}/read`, { method: 'POST', token: token2 })).status === 200, 'marking a notification read works');
    const n3 = await call('/api/notifications', { token: token2 });
    check(n3.data?.unreadCount === 0 && n3.data.notifications[0]?.read === true, 'it stays read after a re-fetch ("refresh")');
    await call(`/api/users/${uname}/follow`, { method: 'POST', token: token2 });
    const ra = await call('/api/notifications/read-all', { method: 'POST', token });
    check(ra.status === 200 && ra.data?.updated === 1, 'read-all marks the unread ones read', JSON.stringify(ra.data));
    // Rating and commenting on alice's outfit notifies alice (we only read; we don't change her read state).
    if (!own) skip("no alice-owned outfit to rate/comment on for the notification check");
    else {
      await call(`/api/outfits/${own.id}/rating`, { method: 'PUT', token, body: { score: 4 } });
      await call(`/api/outfits/${own.id}/comments`, { method: 'POST', token, body: { body: `verify notify ${stamp}` } });
      const an = await call('/api/notifications?limit=50', { token: aliceToken });
      const mine = (an.data?.notifications || []).filter((n) => n.actor?.username === uname);
      check(mine.some((n) => n.type === 'rating' && n.detail === '4' && n.outfit?.id === own.id), "rating an outfit notifies its owner");
      check(mine.some((n) => n.type === 'comment' && n.detail === `verify notify ${stamp}`), 'commenting on an outfit notifies its owner');
    }
  }

  step('Level 9: follow and save');
  const authorName = target?.author?.username;
  if (!target || !authorName) skip('no outfit with an author to follow/save');
  else {
    const feedOf = async (t) => (await call('/api/outfits?scope=all&limit=50', { token: t })).data?.outfits?.find((o) => o.id === target.id);
    const before = await feedOf(token);
    check(before?.author_followed === false && before?.saved === false, 'feed starts with author_followed=false and saved=false', JSON.stringify({ f: before?.author_followed, s: before?.saved }));
    check((await call(`/api/users/${authorName}/follow`, { method: 'POST', token })).status === 200, 'following the author works');
    check((await feedOf(token))?.author_followed === true, 'feed shows author_followed=true after following ("refresh")');
    check((await call('/api/users/me/saved')).status === 401, 'GET /users/me/saved without a token is 401');
    check((await call(`/api/outfits/${target.id}/save`, { method: 'POST', token })).status === 200, 'saving an outfit works');
    await call(`/api/outfits/${target.id}/save`, { method: 'POST', token }); // saving twice must not duplicate
    const saved = await call('/api/users/me/saved', { token });
    check(saved.data?.outfits?.filter((o) => o.id === target.id).length === 1, 'saved list has the outfit exactly once');
    check((await feedOf(token))?.saved === true, 'feed shows saved=true after saving');
    check((await call('/api/outfits/00000000-0000-4000-8000-000000000000/save', { method: 'POST', token })).status === 404, 'saving a missing outfit is 404');
    await call(`/api/outfits/${target.id}/save`, { method: 'DELETE', token });
    check(((await call('/api/users/me/saved', { token })).data?.outfits || []).every((o) => o.id !== target.id), 'unsaving removes it from the saved list');
    await call(`/api/users/${authorName}/follow`, { method: 'DELETE', token });
    check((await feedOf(token))?.author_followed === false, 'unfollowing flips author_followed back to false');
  }

  step('Level 9: account settings');
  const patch = (t, body) => call('/api/users/me', { method: 'PATCH', token: t, body });
  check((await patch(undefined, { bio: 'x' })).status === 401, 'PATCH /users/me without a token is 401');
  check((await patch(token, {})).status === 400, 'empty update is 400');
  check((await patch(token, { display_name: '' })).status === 400, 'empty display name is 400');
  check((await patch(token, { avatar_url: 'not a url' })).status === 400, 'invalid avatar URL is 400');
  const upd = await patch(token, { display_name: 'Verify Renamed', bio: 'hello from verify', avatar_url: 'https://example.com/a.png' });
  check(upd.status === 200 && upd.data?.user?.display_name === 'Verify Renamed', 'updating profile works', JSON.stringify(upd.data));
  const meAfter = await call('/api/auth/me', { token });
  check(meAfter.data?.user?.bio === 'hello from verify' && meAfter.data.user.avatar_url === 'https://example.com/a.png', 'changes are still there after a re-fetch ("refresh")');
  const cleared = await patch(token, { avatar_url: '' });
  check(cleared.status === 200 && cleared.data?.user?.avatar_url === null && cleared.data.user.display_name === 'Verify Renamed', 'empty avatar URL clears it without touching other fields', JSON.stringify(cleared.data));

  // cleanup: throwaway users cascade-delete their fits, ratings and comments
  const del = await db.query("DELETE FROM users WHERE username LIKE 'verify\\_%'");
  console.log(`\n(cleaned up ${del.rowCount} throwaway user(s))`);
  await db.pool.end();
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped.`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('verify crashed:', e); process.exit(1); });