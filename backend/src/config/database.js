import { readFile } from 'node:fs/promises';
import { GoogleAuth } from 'google-auth-library';

export function crc32c(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0x82f63b78 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function databaseProvider(env = process.env) {
  const sources = ['MONGODB_URI', 'MONGODB_URI_FILE', 'MONGODB_URI_SECRET'].filter(
    (name) => !!env[name],
  );
  if (sources.length > 1)
    throw new Error(
      'Configure exactly one MongoDB URI source: environment, mounted secret file, or Google Secret Manager.',
    );
  const provider = env.DATABASE_PROVIDER || (sources.length ? 'mongodb' : 'sqlite');
  if (!['sqlite', 'mongodb'].includes(provider))
    throw new Error('DATABASE_PROVIDER must be sqlite or mongodb.');
  if (provider === 'sqlite' && sources.length)
    throw new Error(
      'MongoDB credentials are configured but DATABASE_PROVIDER selects SQLite. Remove this conflicting configuration.',
    );
  if (provider === 'mongodb' && !sources.length)
    throw new Error(
      'MongoDB is selected but its connection secret is missing. Configure MONGODB_URI_SECRET, MONGODB_URI_FILE or MONGODB_URI securely.',
    );
  return provider;
}
export function validateMongoUri(uri, { production = false } = {}) {
  if (
    typeof uri !== 'string' ||
    uri.length > 16384 ||
    uri.trim() !== uri ||
    /[\r\n\0]/.test(uri) ||
    !/^mongodb(?:\+srv)?:\/\//.test(uri)
  )
    throw new Error('The MongoDB secret must contain a valid MongoDB connection URI.');
  const params = new URLSearchParams(uri.split('?')[1] || '');
  for (const [key, value] of params) {
    const k = key.toLowerCase(),
      v = value.toLowerCase();
    if (
      (['tlsinsecure', 'tlsallowinvalidcertificates', 'tlsallowinvalidhostnames'].includes(k) &&
        v !== 'false') ||
      (k === 'sslvalidate' && v === 'false') ||
      (production && ['tls', 'ssl'].includes(k) && v === 'false')
    )
      throw new Error('MongoDB TLS verification must remain enabled.');
  }
  return uri;
}
export async function loadMongoUri(env = process.env, { requestSecret } = {}) {
  databaseProvider(env);
  let uri;
  try {
    if (env.MONGODB_URI_SECRET) {
      const resource = env.MONGODB_URI_SECRET;
      if (
        !/^projects\/[a-z0-9-]+\/secrets\/[a-zA-Z0-9_-]+\/versions\/(latest|[1-9][0-9]*)$/.test(
          resource,
        )
      )
        throw new Error('Invalid secret resource.');
      const request =
        requestSecret ||
        ((url) =>
          new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).request({
            url,
          }));
      const result = await request(
        'https://secretmanager.googleapis.com/v1/' + resource + ':access',
      );
      const payload = result.data?.payload;
      if (typeof payload?.data !== 'string' || payload.dataCrc32c === undefined)
        throw new Error('Missing secret data or integrity checksum.');
      const bytes = Buffer.from(payload.data, 'base64');
      if (BigInt(payload.dataCrc32c) !== BigInt(crc32c(bytes)))
        throw new Error('Secret integrity verification failed.');
      uri = bytes.toString('utf8');
    } else if (env.MONGODB_URI_FILE) uri = await readFile(env.MONGODB_URI_FILE, 'utf8');
    else uri = env.MONGODB_URI;
  } catch {
    throw new Error(
      'Unable to read the MongoDB connection secret. Check its reference, integrity checksum, and service-account access.',
    );
  }
  return validateMongoUri(uri, { production: env.NODE_ENV === 'production' });
}
