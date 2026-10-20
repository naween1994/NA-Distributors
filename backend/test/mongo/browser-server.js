// Disposable database for the browser suite. Never uses MONGODB_DB_NAME or the working database.
import { openMongoDatabase } from '../../src/mongo/store.js';
import { createApp } from '../../src/app.js';
if (!process.env.MONGODB_TEST_URI) throw new Error('MONGODB_TEST_URI is required.');
if (!/^na_browser_test_[a-f0-9]{32}$/.test(process.env.NA_BROWSER_TEST_DATABASE || ''))
  throw new Error('A disposable browser test database name is required.');
const db = await openMongoDatabase(process.env.MONGODB_TEST_URI, {
  databaseName: process.env.NA_BROWSER_TEST_DATABASE,
});
const server = createApp(db).listen(Number(process.env.PORT || 3011), '127.0.0.1');
for (const signal of ['SIGTERM', 'SIGINT'])
  process.once(signal, () =>
    server.close(async () => {
      await db.database.dropDatabase();
      await db.close();
      process.exit(0);
    }),
  );
