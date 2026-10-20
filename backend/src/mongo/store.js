import { validateMongoUri } from '../config/database.js';
import { MongoClient } from 'mongodb';
import { DEFAULT_SETTINGS } from '../db.js';
const TABLES = [
  'users',
  'products',
  'customers',
  'orders',
  'order_items',
  'payments',
  'stock_movements',
  'notifications',
  'activity',
  'reminder_drafts',
  'sync_logs',
];
export const record = (doc) => {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
};
export const idOf = (value) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : -1;
};
export class MongoStore {
  constructor(client, database) {
    this.client = client;
    this.database = database;
    this.kind = 'mongodb';
  }
  c(name) {
    return this.database.collection(name);
  }
  async get(name, id, session) {
    return record(
      await this.c(name).findOne({ _id: typeof id === 'number' ? id : idOf(id) }, { session }),
    );
  }
  async all(name, filter = {}, session, sort = { _id: 1 }) {
    return (await this.c(name).find(filter, { session }).sort(sort).toArray()).map(record);
  }
  async next(name, session) {
    const row = await this.c('counters').findOneAndUpdate(
      { _id: name },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after', session },
    );
    return row.seq;
  }
  async insert(name, fields, session) {
    const id = await this.next(name, session);
    const doc = { _id: id, created_at: new Date().toISOString(), ...fields };
    await this.c(name).insertOne(doc, { session });
    return record(doc);
  }
  async config(session) {
    return Object.fromEntries(
      (await this.c('settings').find({}, { session }).toArray()).map((d) => [d._id, d.value]),
    );
  }
  async audit(user, action, detail, session) {
    return this.insert('activity', { user_id: user.id, action, detail }, session);
  }
  async notify(type, title, message, link, permission, session) {
    return this.insert('notifications', { type, title, message, link, permission }, session);
  }
  async guard(key, session) {
    await this.c('guards').updateOne(
      { _id: key },
      { $inc: { revision: 1 } },
      { upsert: true, session },
    );
  }
  async transaction(callback) {
    return this.client.withSession((session) =>
      session.withTransaction(() => callback(session), {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
      }),
    );
  }
  async ping() {
    await this.database.command({ ping: 1 });
  }
  async close() {
    await this.client.close();
  }
  async orderRows(filter = {}, session) {
    const rows = await this.c('orders')
      .aggregate(
        [
          { $match: filter },
          {
            $lookup: {
              from: 'payments',
              localField: '_id',
              foreignField: 'order_id',
              as: '_payments',
            },
          },
          { $set: { paid: { $sum: '$_payments.amount' } } },
          { $project: { _payments: 0 } },
          { $sort: { order_date: -1, _id: -1 } },
        ],
        { session },
      )
      .toArray();
    return rows.map(record);
  }
  async customerRows(filter = {}, session) {
    const customers = await this.all('customers', filter, session);
    if (!customers.length) return [];
    const orders = await this.orderRows(
      { customer_id: { $in: customers.map((c) => c.id) } },
      session,
    );
    const stats = new Map();
    for (const o of orders) {
      const s = stats.get(o.customer_id) || { order_count: 0, lifetime_spend: 0, outstanding: 0 };
      s.order_count++;
      s.lifetime_spend += o.total;
      s.outstanding += o.total - o.paid;
      stats.set(o.customer_id, s);
    }
    return customers.map((c) => ({
      ...c,
      ...(stats.get(c.id) || { order_count: 0, lifetime_spend: 0, outstanding: 0 }),
    }));
  }
  async withUserNames(rows, field = 'user_name') {
    const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
    const users = await this.all('users', { _id: { $in: ids } });
    const names = new Map(users.map((u) => [u.id, u.name]));
    return rows.map((r) => ({ ...r, [field]: names.get(r.user_id) || null }));
  }
  async initialize() {
    for (const name of [
      ...TABLES,
      'settings',
      'sessions',
      'notification_reads',
      'counters',
      'guards',
      'system',
    ]) {
      try {
        await this.database.createCollection(name);
      } catch (e) {
        if (e.code !== 48) throw e;
      }
    }
    await this.c('users').createIndex(
      { username: 1 },
      { unique: true, collation: { locale: 'en', strength: 2 } },
    );
    await this.c('products').createIndex(
      { sku: 1 },
      { unique: true, collation: { locale: 'en', strength: 2 } },
    );
    await this.c('products').createIndex(
      { barcode: 1 },
      { unique: true, partialFilterExpression: { barcode: { $type: 'string' } } },
    );
    for (const key of ['invoice', 'request_key'])
      await this.c('orders').createIndex(
        { [key]: 1 },
        { unique: true, partialFilterExpression: { [key]: { $type: 'string' } } },
      );
    await this.c('orders').createIndex({ order_date: 1 });
    await this.c('orders').createIndex({ customer_id: 1 });
    await this.c('payments').createIndex({ order_id: 1 });
    await this.c('order_items').createIndex({ order_id: 1 });
    await this.c('order_items').createIndex({ product_id: 1 });
    await this.c('stock_movements').createIndex({ product_id: 1 });
    await this.c('sessions').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
    await this.c('notifications').createIndex(
      { dedupe_key: 1 },
      { unique: true, partialFilterExpression: { dedupe_key: { $type: 'string' } } },
    );
    for (const name of TABLES) {
      const max = await this.c(name)
        .find({ _id: { $type: 'number' } })
        .sort({ _id: -1 })
        .limit(1)
        .next();
      await this.c('counters').updateOne(
        { _id: name },
        { $max: { seq: max ? max._id : 0 } },
        { upsert: true },
      );
    }
    await this.transaction(async (session) => {
      await this.guard('initialization', session);
      if (await this.c('system').findOne({ _id: 'initialized' }, { session })) return;
      if (!(await this.c('users').findOne({}, { session }))) {
        const users = [
          ['Naween Samaranayaka', 'naween', 'admin'],
          ['Anura Gunasekara', 'anura', 'inventory'],
          ['Mangala Senarathna', 'mangala', 'sales'],
        ];
        for (let i = 0; i < users.length; i++)
          await this.c('users').insertOne(
            {
              _id: i + 1,
              name: users[i][0],
              username: users[i][1],
              role: users[i][2],
              permissions: null,
              password_hash: null,
              active: 1,
              must_change_password: 0,
              created_at: new Date().toISOString(),
            },
            { session },
          );
        await this.c('counters').updateOne({ _id: 'users' }, { $max: { seq: 3 } }, { session });
      }
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS))
        await this.c('settings').updateOne(
          { _id: key },
          { $setOnInsert: { value } },
          { upsert: true, session },
        );
      await this.c('system').insertOne({ _id: 'initialized', schema_version: 1 }, { session });
    });
  }
}
export async function openMongoDatabase(
  uri,
  { databaseName = 'na_distributors', production = false, ...options } = {},
) {
  if (!/^[a-zA-Z0-9_-]{1,63}$/.test(databaseName))
    throw new Error('MONGODB_DB_NAME must contain only letters, numbers, underscores and hyphens.');
  let client;
  try {
    client = new MongoClient(validateMongoUri(uri, { production }), {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      maxPoolSize: 20,
      retryWrites: true,
      ...(production ? { tls: true } : {}),
      ...options,
    });
    await client.connect();
    const db = client.db(databaseName);
    const hello = await db.admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== 'isdbgrid') throw new Error('Replica set required.');
    const store = new MongoStore(client, db);
    await store.initialize();
    return store;
  } catch {
    await client?.close();
    throw new Error(
      'MongoDB connection or initialization failed. Check the connection secret, database permissions, Atlas IP access list, TLS, and replica-set availability. No fallback database was opened.',
    );
  }
}
