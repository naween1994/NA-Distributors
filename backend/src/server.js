import { openDatabase } from './db.js';
import { createApp } from './app.js';
const db = openDatabase();
const port = Number(process.env.PORT || 3001);
const server = createApp(db).listen(port, process.env.HOST || '0.0.0.0', () =>
  console.log(`NA Distributors API listening on port ${port}; persistent SQLite storage enabled.`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(() => {
      db.close();
      process.exit(0);
    }),
  );
