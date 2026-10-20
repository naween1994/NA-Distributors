import { Router } from 'express';
import { permit } from '../auth.js';
import { confirmAdmin } from './auth.js';
import { assert, text, number, money, productDto, sendCsv, has } from '../lib.js';
import { record, idOf } from './store.js';
export function productRoutes(store) {
  const router = Router();
  router.use(permit('viewInventory'));
  const list = async (q = {}, user) => {
    const rows = await store.all('products');
    const search = String(q.search || '').toLowerCase();
    return rows
      .filter(
        (p) =>
          (!search ||
            [p.name, p.sku, p.barcode, p.category, p.origin].some((v) =>
              v?.toLowerCase().includes(search),
            )) &&
          (!q.category || q.category === p.category) &&
          (q.low !== 'true' || p.stock <= p.reorder_level),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => productDto(p, user));
  };
  router.get('/', async (req, res) => res.json(await list(req.query, req.user)));
  router.get('/export', async (req, res) => {
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
    sendCsv(res, 'products', await list(req.query, req.user), columns);
  });
  router.get('/lookup/:code', async (req, res) => {
    const code = req.params.code;
    const row =
      (await store.c('products').findOne({ barcode: code })) ||
      (await store
        .c('products')
        .findOne({ sku: code }, { collation: { locale: 'en', strength: 2 } }));
    assert(row, 'No product matches this code.', 404);
    res.json(productDto(record(row), req.user));
  });
  router.get('/:id/movements', async (req, res) => {
    const rows = (
      await store.all('stock_movements', { product_id: idOf(req.params.id) }, undefined, {
        _id: -1,
      })
    ).slice(0, 100);
    res.json(await store.withUserNames(rows));
  });
  async function values(body, user, old) {
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
    result.barcode ||= null;
    result.unit ||= 'packs';
    result.reorder_level = number(body.reorder_level ?? old?.reorder_level ?? 10, 'Reorder level', {
      integer: true,
      max: 1e7,
    });
    for (const key of ['cost', 'mrp', 'wholesale', 'distributor'])
      result[key] =
        key === 'cost' && !has(user, 'viewCosts')
          ? old?.cost || 0
          : money(body[key] ?? (old?.[key] || 0) / 100, key);
    const config = await store.config();
    result.markup = number(body.markup ?? old?.markup ?? config.distributorMarkup, 'Markup', {
      max: 1000,
    });
    return result;
  }
  router.post('/', permit('manageInventory'), async (req, res) => {
    const p = await values(req.body, req.user);
    const stock = number(req.body.stock ?? 0, 'Initial stock', { integer: true, max: 1e7 });
    const row = await store.transaction(async (s) => {
      const product = await store.insert(
        'products',
        { ...p, stock, initial_stock: stock, updated_at: new Date().toISOString() },
        s,
      );
      if (stock)
        await store.insert(
          'stock_movements',
          {
            product_id: product.id,
            quantity: stock,
            balance: stock,
            note: 'Initial stock',
            user_id: req.user.id,
          },
          s,
        );
      await store.audit(req.user, 'product.created', p.sku, s);
      return product;
    });
    res.status(201).json(productDto(row, req.user));
  });
  router.put('/:id', permit('manageInventory'), async (req, res) => {
    const old = await store.get('products', req.params.id);
    assert(old, 'Product not found.', 404);
    const p = await values(req.body, req.user, old);
    await store.transaction(async (s) => {
      const result = await store
        .c('products')
        .updateOne(
          { _id: old.id },
          { $set: { ...p, updated_at: new Date().toISOString() } },
          { session: s },
        );
      assert(result.matchedCount, 'Product not found.', 404);
      await store.audit(req.user, 'product.updated', p.sku, s);
    });
    res.json(productDto(await store.get('products', old.id), req.user));
  });
  router.post('/:id/stock', permit('manageInventory'), async (req, res) => {
    const quantity = number(req.body.quantity, 'Stock adjustment', {
      min: -1e7,
      max: 1e7,
      integer: true,
    });
    assert(quantity !== 0, 'Adjustment must not be zero.');
    const note = text(req.body.note, 'Adjustment note', { required: true, max: 1000 });
    const row = await store.transaction(async (s) => {
      const old = await store.get('products', req.params.id, s);
      assert(old, 'Product not found.', 404);
      assert(old.stock + quantity >= 0, 'Adjustment would make stock negative.');
      const next = record(
        await store
          .c('products')
          .findOneAndUpdate(
            { _id: old.id, stock: { $gte: -Math.min(quantity, 0) } },
            { $inc: { stock: quantity }, $set: { updated_at: new Date().toISOString() } },
            { returnDocument: 'after', session: s },
          ),
      );
      assert(next, 'Adjustment would make stock negative.');
      await store.insert(
        'stock_movements',
        { product_id: old.id, quantity, balance: next.stock, note, user_id: req.user.id },
        s,
      );
      if (next.stock <= next.reorder_level)
        await store.notify(
          'stock',
          'Low stock',
          `${next.name} has ${next.stock} ${next.unit} remaining.`,
          '/inventory',
          'viewInventory',
          s,
        );
      await store.audit(req.user, 'stock.adjusted', `${next.sku}: ${quantity}, ${note}`, s);
      return next;
    });
    res.json(productDto(row, req.user));
  });
  router.post('/reset', permit('resetCatalog'), async (req, res) => {
    await confirmAdmin(store, req.body.adminPassword);
    await store.transaction(async (s) => {
      assert(
        !(await store.c('order_items').findOne({ product_id: { $ne: null } }, { session: s })),
        'Products used in invoices cannot be reset. Delete the relevant orders first.',
        409,
      );
      await store.c('products').deleteMany({}, { session: s });
      await store.c('stock_movements').deleteMany({}, { session: s });
      await store.audit(req.user, 'catalog.reset', 'All products removed', s);
    });
    res.json({ ok: true });
  });
  router.delete('/:id', permit('deleteProducts'), async (req, res) => {
    await confirmAdmin(store, req.body.adminPassword);
    const id = idOf(req.params.id);
    await store.transaction(async (s) => {
      assert(
        !(await store.c('order_items').findOne({ product_id: id }, { session: s })),
        'This product is used in an invoice. Delete the relevant orders before deleting it.',
        409,
      );
      const result = await store.c('products').deleteOne({ _id: id }, { session: s });
      assert(result.deletedCount, 'Product not found.', 404);
      await store.c('stock_movements').deleteMany({ product_id: id }, { session: s });
      await store.audit(req.user, 'product.deleted', String(id), s);
    });
    res.json({ ok: true });
  });
  return router;
}
