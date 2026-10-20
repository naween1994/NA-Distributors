import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { ROLE_PERMISSIONS } from './db.js';
import { assert, text, HttpError } from './lib.js';
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}
export function verifyPassword(password, hash) {
  if (typeof password !== 'string' || !hash || password.length > 200) return false;
  const [salt, key] = hash.split(':');
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(key, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function checkPassword(password) {
  assert(
    typeof password === 'string' && password.length >= 10 && password.length <= 200,
    'Use a password with 10–200 characters.',
  );
  return password;
}
export function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    permissions: user.permissions
      ? JSON.parse(user.permissions)
      : ROLE_PERMISSIONS[user.role] || [],
    active: !!user.active,
    passwordSet: !!user.password_hash,
    mustChangePassword: !!user.must_change_password,
  };
}
const digest = (value) => createHash('sha256').update(value).digest('hex');
function cookieToken(req) {
  const item = (req.headers.cookie || '')
    .split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith('na_session='));
  return item?.slice(11);
}
function createSession(db, user, res) {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
  const token = randomBytes(32).toString('hex');
  const csrf = randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)').run(
    digest(token),
    user.id,
    csrf,
    new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
  );
  res.cookie('na_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  });
  return { user: publicUser(user), csrf };
}
export function authentication(db) {
  return (req, res, next) => {
    const token = cookieToken(req);
    if (token) {
      const session = db
        .prepare('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?')
        .get(digest(token), new Date().toISOString());
      if (session) {
        const row = db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(session.user_id);
        if (row) {
          req.user = publicUser(row);
          req.session = session;
        }
      }
    }
    next();
  };
}
export const requireAuth = (req, res, next) => {
  if (!req.user) return next(new HttpError(401, 'Please sign in.'));
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
    req.get('x-csrf-token') !== req.session.csrf
  )
    return next(new HttpError(403, 'Session verification failed. Refresh and try again.'));
  if (
    req.user.mustChangePassword &&
    !['/auth/password', '/auth/logout', '/auth/me'].some(
      (path) => req.originalUrl.split('?')[0] === '/api' + path,
    )
  )
    return next(new HttpError(403, 'Change your temporary password before continuing.'));
  next();
};
export const permit = (permission) => (req, res, next) =>
  req.user?.permissions.includes(permission)
    ? next()
    : next(new HttpError(403, 'Your account does not have permission for this action.'));
export function confirmAdmin(db, password) {
  assert(
    typeof password === 'string' &&
      db
        .prepare(
          "SELECT password_hash FROM users WHERE role='admin' AND active=1 AND password_hash IS NOT NULL",
        )
        .all()
        .some((u) => verifyPassword(password, u.password_hash)),
    'Admin password confirmation failed.',
    403,
  );
}
export function authRoutes(db) {
  const router = Router();
  const setupToken = process.env.SETUP_TOKEN || '';
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  });
  router.get('/status', (req, res) =>
    res.json({
      setupTokenRequired: !!setupToken,
      setupRequired: !db
        .prepare("SELECT id FROM users WHERE role='admin' AND password_hash IS NOT NULL")
        .get(),
    }),
  );
  router.post('/setup', limiter, (req, res) => {
    assert(
      !db.prepare("SELECT id FROM users WHERE role='admin' AND password_hash IS NOT NULL").get(),
      'Admin setup is already complete.',
      409,
    );
    if (setupToken) {
      const supplied = typeof req.body.setupToken === 'string' ? req.body.setupToken : '';
      assert(
        timingSafeEqual(
          createHash('sha256').update(supplied).digest(),
          createHash('sha256').update(setupToken).digest(),
        ),
        'The setup code is incorrect.',
        403,
      );
    }
    const password = hashPassword(checkPassword(req.body.password));
    db.prepare('UPDATE users SET password_hash=? WHERE id=1').run(password);
    res.json(createSession(db, db.prepare('SELECT * FROM users WHERE id=1').get(), res));
  });
  router.post('/login', limiter, (req, res) => {
    const username = text(req.body.username, 'Username', { required: true, max: 80 });
    const user = db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(username);
    const dummy = '0123456789abcdef0123456789abcdef:' + '0'.repeat(128);
    const valid = verifyPassword(req.body.password, user?.password_hash || dummy);
    assert(user && valid, 'Username or password is incorrect.', 401);
    res.json(createSession(db, user, res));
  });
  router.get('/me', requireAuth, (req, res) =>
    res.json({ user: req.user, csrf: req.session.csrf }),
  );
  router.post('/logout', requireAuth, (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.session.token_hash);
    res.clearCookie('na_session', { path: '/' });
    res.json({ ok: true });
  });
  router.post('/password', requireAuth, (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
    assert(
      verifyPassword(req.body.currentPassword, user.password_hash),
      'Current password is incorrect.',
      403,
    );
    db.prepare('UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?').run(
      hashPassword(checkPassword(req.body.password)),
      user.id,
    );
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
    res.json(createSession(db, db.prepare('SELECT * FROM users WHERE id=?').get(user.id), res));
  });
  return router;
}
