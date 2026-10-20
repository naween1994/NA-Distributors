import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const DEFAULT_SETTINGS = {
  appName: 'NA Distributors',
  currency: 'LKR',
  distributorMarkup: 15,
  pricingTiers: [
    { id: 'mrp', name: 'Retail / MRP', active: true },
    { id: 'wholesale', name: 'Wholesale', active: true },
    { id: 'distributor', name: 'Distributor', active: true },
  ],
  paymentTerms: [
    { name: 'Due on receipt', days: 0 },
    { name: 'Net 7', days: 7 },
    { name: 'Net 14', days: 14 },
    { name: 'Net 30', days: 30 },
  ],
  discounts: [
    { threshold: 5000, percent: 2 },
    { threshold: 10000, percent: 3 },
    { threshold: 20000, percent: 4 },
    { threshold: 40000, percent: 5 },
    { threshold: 50000, percent: 7 },
    { threshold: 100000, percent: 10 },
  ],
  reminderEmail:
    'Dear {customer}, your invoice {invoice} has an outstanding balance of {balance}, due on {dueDate}. Please arrange payment. Thank you, NA Distributors.',
  reminderSms: 'NA Distributors: {invoice} balance {balance} is due on {dueDate}. Thank you.',
  businessAddress: '',
  businessPhone: '',
  businessEmail: '',
  invoiceFooter: 'Thank you for your business.',
};
export const PERMISSIONS = [
  'viewDashboard',
  'viewInventory',
  'manageInventory',
  'viewCosts',
  'deleteProducts',
  'resetCatalog',
  'scan',
  'viewCustomers',
  'manageCustomers',
  'viewOrders',
  'createOrders',
  'managePayments',
  'deleteOrders',
  'viewReports',
  'manageUsers',
  'manageSettings',
  'accounting',
];
export const ROLE_PERMISSIONS = {
  admin: PERMISSIONS,
  inventory: ['viewDashboard', 'viewInventory', 'manageInventory', 'viewCosts', 'scan'],
  sales: [
    'viewDashboard',
    'viewInventory',
    'scan',
    'viewCustomers',
    'manageCustomers',
    'viewOrders',
    'createOrders',
    'managePayments',
  ],
  accountant: [
    'viewDashboard',
    'viewInventory',
    'viewCosts',
    'viewCustomers',
    'viewOrders',
    'managePayments',
    'viewReports',
    'accounting',
  ],
};
export function openDatabase(
  file = process.env.DATABASE_PATH || resolve('data/na-distributors.sqlite'),
) {
  if (file !== ':memory:') mkdirSync(dirname(resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL UNIQUE COLLATE NOCASE, role TEXT NOT NULL, permissions TEXT, password_hash TEXT, active INTEGER NOT NULL DEFAULT 1, must_change_password INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, name TEXT NOT NULL, sku TEXT NOT NULL UNIQUE COLLATE NOCASE, barcode TEXT UNIQUE, category TEXT NOT NULL DEFAULT '', origin TEXT NOT NULL DEFAULT '', size TEXT NOT NULL DEFAULT '', grade TEXT NOT NULL DEFAULT '', batch TEXT NOT NULL DEFAULT '', unit TEXT NOT NULL DEFAULT 'packs', stock INTEGER NOT NULL DEFAULT 0 CHECK(stock>=0), initial_stock INTEGER NOT NULL DEFAULT 0, reorder_level INTEGER NOT NULL DEFAULT 10, cost INTEGER NOT NULL DEFAULT 0, mrp INTEGER NOT NULL DEFAULT 0, wholesale INTEGER NOT NULL DEFAULT 0, distributor INTEGER NOT NULL DEFAULT 0, markup REAL NOT NULL DEFAULT 15, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS stock_movements(id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, quantity INTEGER NOT NULL, balance INTEGER NOT NULL, note TEXT NOT NULL, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS customers(id INTEGER PRIMARY KEY, business TEXT NOT NULL, contact TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', tier TEXT NOT NULL DEFAULT 'mrp', terms_days INTEGER NOT NULL DEFAULT 0, credit_limit INTEGER NOT NULL DEFAULT 0, reference TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', latitude REAL, longitude REAL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT, invoice TEXT UNIQUE, request_key TEXT UNIQUE, customer_id INTEGER REFERENCES customers(id), customer_snapshot TEXT NOT NULL, order_date TEXT NOT NULL, due_date TEXT NOT NULL, tier TEXT NOT NULL, subtotal INTEGER NOT NULL, discount_percent REAL NOT NULL, discount_amount INTEGER NOT NULL, total INTEGER NOT NULL CHECK(total>=0), payment_method TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE, product_id INTEGER REFERENCES products(id) ON DELETE SET NULL, product_name TEXT NOT NULL, sku TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0), unit_price INTEGER NOT NULL, unit_cost INTEGER NOT NULL, line_total INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE, amount INTEGER NOT NULL CHECK(amount>0), method TEXT NOT NULL, reference TEXT NOT NULL DEFAULT '', paid_date TEXT NOT NULL, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, link TEXT NOT NULL DEFAULT '', permission TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS notification_reads(notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(notification_id,user_id));
    CREATE TABLE IF NOT EXISTS activity(id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS reminder_drafts(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, channel TEXT NOT NULL, recipient TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS sync_logs(id INTEGER PRIMARY KEY, provider TEXT NOT NULL, action TEXT NOT NULL, status TEXT NOT NULL, detail TEXT NOT NULL, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS order_date_index ON orders(order_date);
    CREATE INDEX IF NOT EXISTS payment_order_index ON payments(order_id);
    CREATE INDEX IF NOT EXISTS order_items_order_index ON order_items(order_id);
  `);
  const insertUser = db.prepare(
    'INSERT OR IGNORE INTO users(id,name,username,role) VALUES(?,?,?,?)',
  );
  if (!db.prepare('SELECT id FROM users LIMIT 1').get()) {
    insertUser.run(1, 'Naween Samaranayaka', 'naween', 'admin');
    insertUser.run(2, 'Anura Gunasekara', 'anura', 'inventory');
    insertUser.run(3, 'Mangala Senarathna', 'mangala', 'sales');
  }
  const seed = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)');
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) seed.run(key, JSON.stringify(value));
  return db;
}
export function transaction(db, callback) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const value = callback();
    db.exec('COMMIT');
    return value;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
export function settings(db) {
  return Object.fromEntries(
    db
      .prepare('SELECT * FROM settings')
      .all()
      .map((row) => [row.key, JSON.parse(row.value)]),
  );
}
export function notify(db, type, title, message, link, permission) {
  db.prepare('INSERT INTO notifications(type,title,message,link,permission) VALUES(?,?,?,?,?)').run(
    type,
    title,
    message,
    link,
    permission,
  );
}
export function audit(db, user, action, detail) {
  db.prepare('INSERT INTO activity(user_id,action,detail) VALUES(?,?,?)').run(
    user.id,
    action,
    detail,
  );
}
