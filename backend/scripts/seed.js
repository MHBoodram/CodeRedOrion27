// Fills the database with demo users, wardrobes, outfits, ratings, comments and events.
// Usage: npm run seed      (safe to re-run: skips if the demo users already exist)
require('dotenv').config();
const configuredDatabaseUrl = process.env.DATABASE_URL;
const tigerDatabaseUrl = process.env.TIMESCALE_SERVICE_URL;
if (configuredDatabaseUrl && tigerDatabaseUrl && ['localhost', '127.0.0.1', '::1'].includes(new URL(configuredDatabaseUrl).hostname)) {
  process.env.DATABASE_URL = tigerDatabaseUrl;
}
const bcrypt = require('bcryptjs');
const db = require('../src/db');
const { setItems, setTags } = require('../src/lib/outfitQueries');
const fs = require('fs');
const path = require('path');

const PASSWORD = 'password123';
// Outfit cover photos: files in client/public/photos, served by the client at /photos/...
const PHOTOS = [
  'autumn-fits.jpg',
  'oversized-streetwear.jpg',
  'leeyjohn-fits.jpg',
  'winter-budget.jpg',
  'xiaoxiao-outfits.jpg',
];
const photo = (i) => `/photos/${PHOTOS[i % PHOTOS.length]}`;
const img = (text) => `https://placehold.co/600x800?text=${encodeURIComponent(text)}`;

const users = [
  { username: 'alice', display_name: 'Alice Rivera', bio: 'Minimalist wardrobe, maximalist sneakers.' },
  { username: 'bob', display_name: 'Bob Chen', bio: 'Streetwear and thrift finds.' },
  { username: 'carla', display_name: 'Carla Mendes', bio: 'Vintage everything.' },
  { username: 'dev', display_name: 'Dev Patel', bio: 'Smart casual on a budget.' },
];

// [name, category, brand, color]
const wardrobe = {
  alice: [
    ['White Oxford Shirt', 'top', 'Uniqlo', 'white'],
    ['Black Slim Jeans', 'bottom', "Levi's", 'black'],
    ['White Sneakers', 'shoes', 'Adidas', 'white'],
    ['Denim Jacket', 'outerwear', "Levi's", 'blue'],
    ['Leather Belt', 'accessory', 'Fossil', 'brown'],
    ['Linen Midi Dress', 'dress', 'Zara', 'beige'],
  ],
  bob: [
    ['Oversized Graphic Tee', 'top', 'Stussy', 'black'],
    ['Cargo Pants', 'bottom', 'Carhartt', 'olive'],
    ['High-Top Sneakers', 'shoes', 'Nike', 'red'],
    ['Puffer Vest', 'outerwear', 'North Face', 'black'],
    ['Beanie', 'headwear', null, 'grey'],
    ['Crossbody Bag', 'bag', 'Supreme', 'black'],
  ],
  carla: [
    ['Floral Blouse', 'top', null, 'cream'],
    ['High-Waist Corduroy Pants', 'bottom', 'Thrifted', 'brown'],
    ['Leather Loafers', 'shoes', 'Dr. Martens', 'black'],
    ['Wool Overcoat', 'outerwear', 'Vintage', 'camel'],
    ['Silk Scarf', 'accessory', null, 'multi'],
    ['Straw Tote', 'bag', null, 'tan'],
  ],
  dev: [
    ['Navy Polo', 'top', 'Ralph Lauren', 'navy'],
    ['Chinos', 'bottom', 'J.Crew', 'khaki'],
    ['Suede Chelsea Boots', 'shoes', 'Clarks', 'tan'],
    ['Bomber Jacket', 'outerwear', 'Alpha Industries', 'green'],
    ['Aviator Sunglasses', 'accessory', 'Ray-Ban', 'gold'],
    ['Merino Sweater', 'top', 'Everlane', 'charcoal'],
  ],
};

// items = indexes into that user's wardrobe array
const outfits = [
  { user: 'alice', title: 'Classic Casual Friday', occasion: 'work', season: 'fall', items: [0, 1, 2], tags: ['smart-casual', 'minimal'] },
  { user: 'alice', title: 'Denim on Denim (Sort Of)', occasion: 'casual', season: 'spring', items: [3, 0, 1, 2], tags: ['denim', 'casual'] },
  { user: 'alice', title: 'Summer Linen Day', occasion: 'brunch', season: 'summer', items: [5, 2], tags: ['summer', 'minimal'] },
  { user: 'bob', title: 'Streetwear Staple', occasion: 'casual', season: 'fall', items: [0, 1, 2, 4], tags: ['streetwear', 'casual'] },
  { user: 'bob', title: 'Cold Weather Cargo', occasion: 'casual', season: 'winter', items: [3, 0, 1, 4, 5], tags: ['streetwear', 'winter'] },
  { user: 'carla', title: 'Vintage Brunch', occasion: 'brunch', season: 'spring', items: [0, 1, 2, 5], tags: ['vintage', 'brunch'] },
  { user: 'carla', title: 'Winter Wool Look', occasion: 'date night', season: 'winter', items: [0, 1, 2, 3, 4], tags: ['vintage', 'winter', 'date-night'] },
  { user: 'dev', title: 'Smart Casual Dinner', occasion: 'date night', season: 'fall', items: [5, 1, 2, 4], tags: ['smart-casual', 'date-night'] },
  { user: 'dev', title: 'Weekend Bomber', occasion: 'casual', season: 'fall', items: [0, 1, 2, 3], tags: ['casual', 'weekend'] },
];

const comments = [
  [0, 'bob', 'Super clean. Those sneakers tie it together.'],
  [0, 'carla', 'Love the simplicity!'],
  [3, 'alice', 'The red high-tops are such a good pop of color.'],
  [5, 'dev', 'This is giving old-money brunch.'],
  [6, 'alice', 'That coat is incredible.'],
  [7, 'carla', 'Chelsea boots + chinos = never fails.'],
];

const pastFits = [
  {
    name: 'Sophisticated evening',
    score: 8.6,
    detectedStyle: 'Evening tailoring',
    verdict: 'Dark evening tailoring with a velvet accent',
    thumbnail: '/photos/leeyjohn_%20IG%20fits.jpg',
    createdAt: '2026-04-24T12:00:00.000Z',
  },
  {
    name: 'Café neutral',
    score: 9.1,
    detectedStyle: 'Relaxed streetwear',
    verdict: 'Relaxed streetwear in soft, warm neutrals',
    thumbnail: '/photos/Oversized%20Streetwear%20Outfit%20for%20Men%20_%20Baggy%20Fashion%20Inspiration.jpg',
    createdAt: '2026-04-18T12:00:00.000Z',
  },
  {
    name: 'Studio soft',
    score: 8.3,
    detectedStyle: 'Autumn tailoring',
    verdict: 'Autumn layers with clean, tailored lines',
    thumbnail: '/photos/Autumn%20Fits.jpg',
    createdAt: '2026-04-09T12:00:00.000Z',
  },
  {
    name: 'Rainy day edit',
    score: 9.4,
    detectedStyle: 'Cozy winter layers',
    verdict: 'Cozy winter layers built for a cool-weather day',
    thumbnail: '/photos/Winter%20outfit%20under%20budget.jpg',
    createdAt: '2026-03-31T12:00:00.000Z',
  },
];

async function seedAdminPastFits() {
  const migration = fs.readFileSync(path.join(__dirname, '../../schema-history/002_fit_analyses.sql'), 'utf8');
  await db.query(migration);

  const { rows: [admin] } = await db.query('SELECT id FROM users WHERE username = $1', ['admin']);
  let inserted = 0;
  for (const fit of pastFits) {
    const result = {
      score: fit.score,
      verdict: fit.verdict,
      detectedStyle: fit.detectedStyle,
      colors: [],
      colorsMatch: null,
      whatsWorking: [],
      improvements: [],
      weatherFit: { ok: null, note: '' },
    };
    const { rowCount } = await db.query(
      `INSERT INTO fit_analyses (user_id, score, target_style, result, thumbnail, created_at)
       SELECT $1, $2, $3, $4::jsonb, $5, $6
        WHERE NOT EXISTS (
          SELECT 1 FROM fit_analyses WHERE user_id = $1 AND target_style = $3 AND created_at = $6
        )`,
      [admin.id, fit.score, fit.name, JSON.stringify(result), fit.thumbnail, fit.createdAt]
    );
    inserted += rowCount;
  }
  if (inserted) console.log(`Seeded ${inserted} Past Fits for admin.`);
}

async function main() {
  const { rows: existingAdmin } = await db.query('SELECT 1 FROM users WHERE username = $1', ['admin']);
  if (!existingAdmin.length) {
    const adminHash = await bcrypt.hash(PASSWORD, 10);
    await db.query(
      `INSERT INTO users (username, email, password_hash, display_name, bio, avatar_url)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['admin', 'admin@example.com', adminHash, 'FitCheck Admin', 'Demo account for local development.', img('admin')]
    );
    console.log('Seeded demo login "admin".');
  }

  await seedAdminPastFits();

  const { rows: existing } = await db.query('SELECT 1 FROM users WHERE username = ANY($1)', [
    users.map((u) => u.username),
  ]);
  if (existing.length && process.argv.includes('--reset')) {
    // Deleting the users cascades to their items, outfits, ratings, comments and follows.
    await db.query('DELETE FROM users WHERE username = ANY($1)', [users.map((u) => u.username)]);
    console.log('Removed existing demo users.');
  } else if (existing.length) {
    console.log('Demo users already exist, skipping seed. Re-run with --reset to rebuild them.');
    return;
  }

  const hash = await bcrypt.hash(PASSWORD, 10);

  await db.withTx(async (c) => {
    const userId = {};
    for (const u of users) {
      const { rows } = await c.query(
        `INSERT INTO users (username, email, password_hash, display_name, bio, avatar_url)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [u.username, `${u.username}@example.com`, hash, u.display_name, u.bio, img(u.username)]
      );
      userId[u.username] = rows[0].id;
    }

    const itemIds = {};
    for (const [username, list] of Object.entries(wardrobe)) {
      itemIds[username] = [];
      for (const [name, category, brand, color] of list) {
        const { rows } = await c.query(
          `INSERT INTO clothing_items (user_id, name, category, brand, color, image_url)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [userId[username], name, category, brand, color, img(name)]
        );
        itemIds[username].push(rows[0].id);
      }
    }

    const outfitIds = [];
    for (const [outfitIndex, o] of outfits.entries()) {
      const { rows } = await c.query(
        `INSERT INTO outfits (user_id, title, description, cover_image_url, occasion, season, visibility, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'public', now() - (random() * interval '14 days')) RETURNING id`,
        [userId[o.user], o.title, `${o.title}: a ${o.occasion} look for ${o.season}.`, photo(outfitIndex), o.occasion, o.season]
      );
      const id = rows[0].id;
      outfitIds.push(id);
      await setItems(c, id, userId[o.user], o.items.map((i) => itemIds[o.user][i]));
      await setTags(c, id, o.tags);

      // Ratings from every other user (most of the time)
      for (const u of users) {
        if (u.username === o.user || Math.random() < 0.15) continue;
        const score = 3 + Math.floor(Math.random() * 3); // 3..5
        await c.query('INSERT INTO ratings (outfit_id, user_id, score) VALUES ($1, $2, $3)', [id, userId[u.username], score]);
      }

      // Fake view activity over the last 3 days so "trending" has data
      await c.query(
        `INSERT INTO outfit_events (occurred_at, outfit_id, user_id, event)
         SELECT now() - (random() * interval '72 hours'), $1::uuid, NULL, 'view'
         FROM generate_series(1, $2::int)`,
        [id, 10 + Math.floor(Math.random() * 60)]
      );
    }

    for (const [idx, username, body] of comments) {
      await c.query('INSERT INTO comments (outfit_id, user_id, body) VALUES ($1, $2, $3)', [
        outfitIds[idx], userId[username], body,
      ]);
    }

    // Everyone follows the next two users in the list
    const names = users.map((u) => u.username);
    for (let i = 0; i < names.length; i++) {
      for (const step of [1, 2]) {
        const target = names[(i + step) % names.length];
        await c.query('INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)', [userId[names[i]], userId[target]]);
      }
    }
  });

  console.log(`Seeded ${users.length} users and ${outfits.length} outfits.`);
  console.log(`Log in with username "admin" (or alice, bob, carla, dev) and password "${PASSWORD}".`);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => db.pool.end());