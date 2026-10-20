import { databaseProvider, loadMongoUri } from './config/database.js';
import { openMongoDatabase } from './mongo/store.js';
import { openDatabase } from './db.js';
import { createApp } from './app.js';
let db;
try {
  const provider = databaseProvider();
  db =
    provider === 'mongodb'
      ? await openMongoDatabase(await loadMongoUri(), {
          databaseName: process.env.MONGODB_DB_NAME || 'na_distributors',
          production: process.env.NODE_ENV === 'production',
        })
      : openDatabase();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
const port = Number(process.env.PORT || 3001);
const server = createApp(db).listen(port, process.env.HOST || '0.0.0.0', () =>
  console.log(
    `NA Distributors API listening on port ${port}; persistent ${db.kind || 'sqlite'} storage enabled.`,
  ),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(async () => {
      await db.close();
      process.exit(0);
    }),
  );
