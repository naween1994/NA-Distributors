import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  databaseProvider,
  validateMongoUri,
  loadMongoUri,
  crc32c,
} from '../src/config/database.js';
import { openMongoDatabase } from '../src/mongo/store.js';
const fixture = 'mongodb://disposable:testing-only@localhost:27017/?replicaSet=rs0';
test('database selection rejects missing or conflicting secrets and insecure TLS', () => {
  assert.equal(databaseProvider({}), 'sqlite');
  assert.equal(databaseProvider({ MONGODB_URI: fixture }), 'mongodb');
  for (const env of [
    { DATABASE_PROVIDER: 'other' },
    { DATABASE_PROVIDER: 'mongodb' },
    { DATABASE_PROVIDER: 'sqlite', MONGODB_URI: fixture },
    { MONGODB_URI: fixture, MONGODB_URI_FILE: '/tmp/unused' },
  ])
    assert.throws(() => databaseProvider(env));
  assert.equal(validateMongoUri(fixture), fixture);
  for (const uri of [
    'https://example.com',
    ' mongodb://localhost',
    fixture + '\n',
    fixture + '&tlsInsecure=true',
    fixture + '&tlsAllowInvalidCertificates=true',
    fixture + '&tlsAllowInvalidHostnames=true',
  ])
    assert.throws(() => validateMongoUri(uri));
  assert.throws(() => validateMongoUri(fixture + '&tls=false', { production: true }));
});
test('environment and mounted file secrets are read without exposing invalid secret values', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'na-secret-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'uri');
  await writeFile(file, fixture, { mode: 0o600 });
  assert.equal(await loadMongoUri({ MONGODB_URI_FILE: file }), fixture);
  assert.equal(await loadMongoUri({ MONGODB_URI: fixture }), fixture);
  await assert.rejects(
    loadMongoUri({ MONGODB_URI: 'invalid-secret-value' }),
    (e) => !e.message.includes('invalid-secret-value'),
  );
});
test('Google Secret Manager response integrity and restricted resource names are verified', async () => {
  assert.equal(crc32c(Buffer.from('123456789')), 0xe3069283);
  const env = { MONGODB_URI_SECRET: 'projects/test-project/secrets/mongodb-uri/versions/latest' };
  let url;
  const response = {
    data: {
      payload: {
        data: Buffer.from(fixture).toString('base64'),
        dataCrc32c: String(crc32c(Buffer.from(fixture))),
      },
    },
  };
  assert.equal(
    await loadMongoUri(env, {
      requestSecret: async (u) => {
        url = u;
        return response;
      },
    }),
    fixture,
  );
  assert.equal(
    url,
    'https://secretmanager.googleapis.com/v1/' + env.MONGODB_URI_SECRET + ':access',
  );
  response.data.payload.dataCrc32c = '0';
  await assert.rejects(
    loadMongoUri(env, { requestSecret: async () => response }),
    /Unable to read/,
  );
  await assert.rejects(
    loadMongoUri(env, {
      requestSecret: async () => {
        throw new Error(fixture);
      },
    }),
    (e) => !e.message.includes(fixture),
  );
  await assert.rejects(
    loadMongoUri(
      { MONGODB_URI_SECRET: 'https://untrusted.example/secret' },
      {
        requestSecret: async () => {
          assert.fail('must not request untrusted URL');
        },
      },
    ),
    /Unable to read/,
  );
});
test('failed MongoDB startup is redacted and never opens a fallback database', async () => {
  await assert.rejects(
    openMongoDatabase('mongodb://disposable:testing-only@127.0.0.1:1/', {
      databaseName: 'na_test_failure',
      serverSelectionTimeoutMS: 100,
      connectTimeoutMS: 100,
    }),
    (e) => e.message.includes('No fallback') && !e.message.includes('testing-only'),
  );
});
