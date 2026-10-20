import { MongoClient } from 'mongodb';
export default async function globalTeardown() {
  if (!process.env.MONGODB_TEST_URI) return;
  const name = process.env.NA_BROWSER_TEST_DATABASE || '';
  if (!/^na_browser_test_[a-f0-9]{32}$/.test(name))
    throw new Error('Refusing to clean a database without a disposable test name.');
  const client = new MongoClient(process.env.MONGODB_TEST_URI);
  try {
    await client.connect();
    await client.db(name).dropDatabase();
  } finally {
    await client.close();
  }
}
