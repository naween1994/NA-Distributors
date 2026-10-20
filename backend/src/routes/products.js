import { Router } from 'express';
import { permit, confirmAdmin } from '../auth.js';
import { settings, transaction, notify, audit } from '../db.js';
import { assert, text, number, money, productDto, sendCsv, has } from '../lib.js';
export function productRoutes(db) {
  const router = Router();
  router.use(permit('viewInventory'));
  const list = (q = {}, user) => {
    let rows = db.prepare('SELECT * FROM products ORDER BY name COLLATE NOCASE').all();
    const needle = String(q.search || '').toLowerCase();
    return rows
      .filter(
        (p) =>
          (!needle ||
            [p.name, p.sku, p.barcode, p.category, p.origin].some((v) =>
              v?.toLowerCase().includes(needle),
            )) &&
          (!q.category || p.category === q.category) &&
          (q.low !== 'true' || p.stock <= p.reorder_level),
      )
      .map((p) => productDto(p, user));
  };
  router.get('/', (req, res) => res.json(list(req.query, req.user)));
  router.get('/export', (req, res) => {
    const columns = [
      ['Product', 'name'],
      ['SKU', 'sku'],
      ['Barcode', 'barcode'],
      ['Category', 'category'],
      ['Origin', 'origin'],
      ['Size', 'size'],
      ['Grade', 'grade'],
      ['Batch', 'batch'],
      ['Stock', 'stock'],
      ['Stock unit', 'unit'],
      ['Notes', 'notes'],
      ['Initial stock', 'initial_stock'],
      ['Reorder level', 'reorder_level'],
      ['MRP', 'mrp'],
      ['Wholesale', 'wholesale'],
      ['Distributor', 'distributor'],
    ];
    if (has(req.user, 'viewCosts')) columns.push(['Cost', 'cost'], ['Markup %', 'markup']);
    sendCsv(res, 'products', list(req.query, req.user), columns);
  });
  router.get('/lookup/:code', (req, res) => {
    const row = db
      .prepare('SELECT * FROM products WHERE barcode=? OR sku=? COLLATE NOCASE')
      .get(req.params.code, req.params.code);
    assert(row, 'No product matches this code.', 404);
    res.json(productDto(row, req.user));
  });
  router.get('/:id/movements', (req, res) =>
    res.json(
      db
        .prepare(
          'SELECT s.*,u.name user_name FROM stock_movements s LEFT JOIN users u ON u.id=s.user_id WHERE product_id=? ORDER BY s.id DESC LIMIT 100',
        )
        .all(req.params.id),
    ),
  );
  function values(body, user, old) {
    const result = {};
    for (const field of [
      'name',
      'sku',
      'barcode',
      'category',
      'origin',
      'size',
      'grade',
      'batch',
      'unit',
      'notes',
    ])
      result[field] = text(body[field] ?? old?.[field], field, {
        required: ['name', 'sku'].includes(field),
        max: field === 'notes' ? 2000 : 150,
      });
    result.barcode = result.barcode || null;
    result.unit = result.unit || 'packs';
    result.reorder_level = number(body.reorder_level ?? old?.reorder_level ?? 10, 'Reorder level', {
      integer: true,
      max: 1e7,
    });
    for (const key of ['cost', 'mrp', 'wholesale', 'distributor'])
      result[key] =
        key === 'cost' && !has(user, 'viewCosts')
          ? old?.cost || 0
          : money(body[key] ?? (old?.[key] || 0) / 100, key);
    result.markup = number(body.markup ?? old?.markup ?? settings(db).distributorMarkup, 'Markup', {
      max: 1000,
    });
    return result;
  }
  router.post('/', permit('manageInventory'), (req, res) => {
    const p = values(req.body, req.user);
    const stock = number(req.body.stock ?? 0, 'Initial stock', { integer: true, max: 1e7 });
    const row = transaction(db, () => {
      const cols = Object.keys(p);
      const id = Number(
        db
          .prepare(
            `INSERT INTO products(${cols.join(',')},stock,initial_stock) VALUES(${cols.map(() => '?').join(',')},?,?)`,
          )
          .run(...Object.values(p), stock, stock).lastInsertRowid,
      );
      if (stock)
        db.prepare(
          'INSERT INTO stock_movements(product_id,quantity,balance,note,user_id) VALUES(?,?,?,?,?)',
        ).run(id, stock, stock, 'Initial stock', req.user.id);
      audit(db, req.user, 'product.created', p.sku);
      return db.prepare('SELECT * FROM products WHERE id=?').get(id);
    });
    res.status(201).json(productDto(row, req.user));
  });
  router.put('/:id', permit('manageInventory'), (req, res) => {
    const old = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
    assert(old, 'Product not found.', 404);
    const p = values(req.body, req.user, old);
    db.prepare(
      `UPDATE products SET ${Object.keys(p)
        .map((k) => k + '=?')
        .join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    ).run(...Object.values(p), old.id);
    audit(db, req.user, 'product.updated', p.sku);
    res.json(productDto(db.prepare('SELECT * FROM products WHERE id=?').get(old.id), req.user));
  });
  router.post('/:id/stock', permit('manageInventory'), (req, res) => {
    const qty = number(req.body.quantity, 'Stock adjustment', {
      min: -1e7,
      max: 1e7,
      integer: true,
    });
    assert(qty !== 0, 'Adjustment must not be zero.');
    const note = text(req.body.note, 'Adjustment note', { required: true, max: 1000 });
    const row = transaction(db, () => {
      const old = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
      assert(old, 'Product not found.', 404);
      assert(old.stock + qty >= 0, 'Adjustment would make stock negative.');
      db.prepare('UPDATE products SET stock=stock+?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(
        qty,
        old.id,
      );
      db.prepare(
        'INSERT INTO stock_movements(product_id,quantity,balance,note,user_id) VALUES(?,?,?,?,?)',
      ).run(old.id, qty, old.stock + qty, note, req.user.id);
      if (old.stock + qty <= old.reorder_level)
        notify(
          db,
          'stock',
          'Low stock',
          `${old.name} has ${old.stock + qty} ${old.unit} remaining.`,
          '/inventory',
          'viewInventory',
        );
      audit(db, req.user, 'stock.adjusted', `${old.sku}: ${qty}, ${note}`);
      return db.prepare('SELECT * FROM products WHERE id=?').get(old.id);
    });
    res.json(productDto(row, req.user));
  });
  router.post('/reset', permit('resetCatalog'), (req, res) => {
    confirmAdmin(db, req.body.adminPassword);
    assert(
      !db.prepare('SELECT id FROM order_items WHERE product_id IS NOT NULL LIMIT 1').get(),
      'Products used in invoices cannot be reset. Delete the relevant orders first.',
      409,
    );
    transaction(db, () => {
      db.exec('DELETE FROM products');
      audit(db, req.user, 'catalog.reset', 'All products removed');
    });
    res.json({ ok: true });
  });
  router.delete('/:id', permit('deleteProducts'), (req, res) => {
    confirmAdmin(db, req.body.adminPassword);
    assert(
      !db.prepare('SELECT id FROM order_items WHERE product_id=? LIMIT 1').get(req.params.id),
      'This product is used in an invoice. Delete the relevant orders before deleting it.',
      409,
    );
    const result = db.prepare('DELETE FROM products WHERE id=?').run(req.params.id);
    assert(result.changes, 'Product not found.', 404);
    audit(db, req.user, 'product.deleted', req.params.id);
    res.json({ ok: true });
  });
  return router;
}
