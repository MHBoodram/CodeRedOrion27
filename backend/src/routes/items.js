const router = require('express').Router();
const { z } = require('zod');
const db = require('../db');
const { HttpError, validate } = require('../errors');
const { requireAuth } = require('../middleware/auth');

const CATEGORIES = ['top', 'bottom', 'outerwear', 'dress', 'shoes', 'accessory', 'bag', 'headwear', 'other'];

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  category: z.enum(CATEGORIES),
  brand: z.string().trim().max(60).optional(),
  color: z.string().trim().max(30).optional(),
  image_url: z.string().url().optional(),
  purchase_url: z.string().url().optional(),
  notes: z.string().trim().max(500).optional(),
});

const patchSchema = createSchema.partial().refine((o) => Object.keys(o).length > 0, {
  message: 'No fields to update',
});

const listQuery = z.object({ category: z.enum(CATEGORIES).optional() });

router.use(requireAuth);

// GET /api/items: the current user's wardrobe
router.get('/', validate(listQuery, 'query'), async (req, res) => {
  const { category } = req.valid;
  const { rows } = await db.query(
    `SELECT * FROM clothing_items
     WHERE user_id = $1 AND ($2::item_category IS NULL OR category = $2::item_category)
     ORDER BY created_at DESC`,
    [req.user.id, category || null]
  );
  res.json({ items: rows });
});

router.post('/', validate(createSchema), async (req, res) => {
  const b = req.valid;
  const { rows } = await db.query(
    `INSERT INTO clothing_items (user_id, name, category, brand, color, image_url, purchase_url, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [req.user.id, b.name, b.category, b.brand, b.color, b.image_url, b.purchase_url, b.notes]
  );
  res.status(201).json({ item: rows[0] });
});

router.patch('/:id', validate(patchSchema), async (req, res) => {
  const b = req.valid;
  const { rows } = await db.query(
    `UPDATE clothing_items SET
       name = COALESCE($3, name), category = COALESCE($4::item_category, category),
       brand = COALESCE($5, brand), color = COALESCE($6, color),
       image_url = COALESCE($7, image_url), purchase_url = COALESCE($8, purchase_url),
       notes = COALESCE($9, notes)
     WHERE id = $1::uuid AND user_id = $2 RETURNING *`,
    [req.params.id, req.user.id, b.name, b.category, b.brand, b.color, b.image_url, b.purchase_url, b.notes]
  );
  if (!rows[0]) throw new HttpError(404, 'Item not found');
  res.json({ item: rows[0] });
});

router.delete('/:id', async (req, res) => {
  const { rowCount } = await db.query(
    'DELETE FROM clothing_items WHERE id = $1::uuid AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!rowCount) throw new HttpError(404, 'Item not found');
  res.status(204).end();
});

module.exports = router;
