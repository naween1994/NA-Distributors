import { Router } from 'express';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { hashPassword, verifyPassword, checkPassword, publicUser, requireAuth } from '../auth.js';
import { assert, text } from '../lib.js';
export const digest = (value) => createHash('sha256').update(value).digest('hex');
function cookieToken(req) {
  return (req.headers.cookie || '')
    .split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith('na_session='))
    ?.slice(11);
}
async function session(store, user, res) {
  const token = randomBytes(32).toString('hex'),
    csrf = randomBytes(24).toString('hex');
  await store.c('sessions').insertOne({
    _id: digest(token),
    token_hash: digest(token),
    user_id: user.id,
    csrf,
    expires_at: new Date(Date.now() + 12 * 3600000),
  });
  res.cookie('na_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 12 * 3600000,
    path: '/',
  });
  return { user: publicUser(user), csrf };
}
export function authentication(store) {
  return async (req, res, next) => {
    try {
      const token = cookieToken(req);
      if (token) {
        const s = await store
          .c('sessions')
          .findOne({ _id: digest(token), expires_at: { $gt: new Date() } });
        if (s) {
          const user = await store.get('users', s.user_id);
          if (user?.active) {
            req.user = publicUser(user);
            req.session = s;
          }
        }
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}
export async function confirmAdmin(store, password, session) {
  const admins = await store.all('users', { role: 'admin', active: 1 }, session);
  assert(
    typeof password === 'string' && admins.some((u) => verifyPassword(password, u.password_hash)),
    'Admin password confirmation failed.',
    403,
  );
}
export function authRoutes(store) {
  const router = Router(),
    setupToken = process.env.SETUP_TOKEN || '';
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  });
  router.get('/status', async (req, res) =>
    res.json({
      setupRequired: !(await store
        .c('users')
        .findOne({ role: 'admin', password_hash: { $type: 'string' } })),
      setupTokenRequired: !!setupToken,
    }),
  );
  router.post('/setup', limiter, async (req, res) => {
    if (setupToken) {
      const supplied = typeof req.body.setupToken === 'string' ? req.body.setupToken : '';
      assert(
        timingSafeEqual(
          Buffer.from(digest(supplied), 'hex'),
          Buffer.from(digest(setupToken), 'hex'),
        ),
        'The setup code is incorrect.',
        403,
      );
    }
    const password = hashPassword(checkPassword(req.body.password));
    const user = await store.transaction(async (s) => {
      await store.guard('admin-access', s);
      assert(
        !(await store
          .c('users')
          .findOne({ role: 'admin', password_hash: { $type: 'string' } }, { session: s })),
        'Admin setup is already complete.',
        409,
      );
      await store
        .c('users')
        .updateOne({ _id: 1 }, { $set: { password_hash: password } }, { session: s });
      return store.get('users', 1, s);
    });
    res.json(await session(store, user, res));
  });
  router.post('/login', limiter, async (req, res) => {
    const username = text(req.body.username, 'Username', { required: true, max: 80 });
    const raw = await store
      .c('users')
      .findOne({ username, active: 1 }, { collation: { locale: 'en', strength: 2 } });
    const user = raw ? { ...raw, id: raw._id } : null;
    const dummy = '0123456789abcdef0123456789abcdef:' + '0'.repeat(128);
    const valid = verifyPassword(req.body.password, user?.password_hash || dummy);
    assert(user && valid, 'Username or password is incorrect.', 401);
    res.json(await session(store, user, res));
  });
  router.get('/me', requireAuth, (req, res) =>
    res.json({ user: req.user, csrf: req.session.csrf }),
  );
  router.post('/logout', requireAuth, async (req, res) => {
    await store.c('sessions').deleteOne({ _id: req.session._id });
    res.clearCookie('na_session', { path: '/' });
    res.json({ ok: true });
  });
  router.post('/password', requireAuth, async (req, res) => {
    const password = hashPassword(checkPassword(req.body.password));
    const user = await store.transaction(async (s) => {
      const old = await store.get('users', req.user.id, s);
      assert(
        old && verifyPassword(req.body.currentPassword, old.password_hash),
        'Current password is incorrect.',
        403,
      );
      await store
        .c('users')
        .updateOne(
          { _id: old.id },
          { $set: { password_hash: password, must_change_password: 0 } },
          { session: s },
        );
      await store.c('sessions').deleteMany({ user_id: old.id }, { session: s });
      return store.get('users', old.id, s);
    });
    res.json(await session(store, user, res));
  });
  return router;
}
