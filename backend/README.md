# FitCheck Backend

Express + PostgreSQL (TigerData) API.

## Setup (PowerShell)

```powershell
cd backend
npm install
copy .env.example .env     # then edit .env: DATABASE_URL and JWT_SECRET
npm run seed               # optional: demo data (users alice/bob/carla/dev, password: password123)
npm run dev                # http://localhost:4000
```

Check it is up: `http://localhost:4000/api/health`

## Conventions

- JSON in, JSON out. Request and response fields use `snake_case`.
- Auth: send `Authorization: Bearer <token>` (token comes from register/login).
- Errors: `{ "error": "message", "details": { ... } }` with a proper HTTP status.
- Lists are paginated with `limit` (max 50) and `offset`.

## Endpoints

`Auth` column: **-** public, **opt** works anonymously but adds per-user fields (my_rating, saved), **yes** required.

| Method | Path | Auth | Body / query |
|---|---|---|---|
| POST | /api/auth/register | - | username, email, password, display_name? |
| POST | /api/auth/login | - | identifier (username or email), password |
| GET | /api/auth/me | yes | |
| GET | /api/users/:username | opt | profile + counts + is_following |
| PATCH | /api/users/me | yes | display_name?, bio?, avatar_url? |
| GET | /api/users/me/saved | yes | limit, offset |
| POST/DELETE | /api/users/:username/follow | yes | |
| GET | /api/items | yes | ?category= (your wardrobe) |
| POST | /api/items | yes | name, category, brand?, color?, image_url?, purchase_url?, notes? |
| PATCH/DELETE | /api/items/:id | yes | |
| GET | /api/outfits | opt | sort=recent\|top\|trending, scope=all\|following, tag, occasion, season, username, limit, offset |
| POST | /api/outfits | yes | title, item_ids[], tags[]?, description?, cover_image_url?, occasion?, season?, visibility? |
| GET | /api/outfits/:id | opt | |
| PATCH/DELETE | /api/outfits/:id | yes | same fields as create, all optional |
| PUT/DELETE | /api/outfits/:id/rating | yes | `{ "score": 1-5 }` |
| GET | /api/outfits/:id/comments | opt | flat list, nest with parent_id |
| POST | /api/outfits/:id/comments | yes | body, parent_id? |
| DELETE | /api/outfits/:id/comments/:commentId | yes | comment author or outfit owner |
| POST/DELETE | /api/outfits/:id/save | yes | |

Category values: top, bottom, outerwear, dress, shoes, accessory, bag, headwear, other.
Visibility values: public, followers, private.

## Not included yet

- Image upload (items and outfits store image URLs only; add S3/Cloudinary/etc. when ready)
- Rate limiting, email verification, password reset
