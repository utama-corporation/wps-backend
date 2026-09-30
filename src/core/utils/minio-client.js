// MinIO / S3-compatible object storage client.
//
// Dua mode auth (env MINIO_AUTH):
//   static (default) -> MINIO_ACCESS_KEY / MINIO_SECRET_KEY dipakai apa adanya.
//   ldap             -> MINIO_ACCESS_KEY = LDAP username, MINIO_SECRET_KEY = LDAP password;
//                       tukar via STS AssumeRoleWithLDAPIdentity jadi kredensial sementara.
require('dotenv').config();
const http = require('http');
const https = require('https');
const Minio = require('minio');

const ENDPOINT = process.env.MINIO_ENDPOINT || '127.0.0.1';
const PORT = parseInt(process.env.MINIO_PORT, 10) || 9000;
const USE_SSL = String(process.env.MINIO_USE_SSL || 'false').toLowerCase() === 'true';
const ACCESS_KEY = process.env.MINIO_ACCESS_KEY || '';
const SECRET_KEY = process.env.MINIO_SECRET_KEY || '';
const AUTH_MODE = String(process.env.MINIO_AUTH || 'static').toLowerCase();

const BUCKET = process.env.MINIO_BUCKET || 'wps';
const PREFIX = (process.env.MINIO_PREFIX || '').replace(/^\/+/, '');

// durasi minta ke STS (detik). MinIO membatasi sesuai config server-nya.
const STS_DURATION = parseInt(process.env.MINIO_STS_DURATION, 10) || 7 * 24 * 60 * 60;
const PRESIGN_EXPIRY = 7 * 24 * 60 * 60;

// ---- STS AssumeRoleWithLDAPIdentity ---------------------------------------
function stsRequest(params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const lib = USE_SSL ? https : http;
    const req = lib.request(
      {
        host: ENDPOINT,
        port: PORT,
        method: 'POST',
        path: '/',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const pick = (xml, tag) => {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? m[1] : null;
};

let _cached = null; // { accessKey, secretKey, sessionToken, expMs }

async function ldapCredentials() {
  const now = Date.now();
  if (_cached && _cached.expMs - now > 60 * 1000) return _cached;

  const { status, body } = await stsRequest({
    Action: 'AssumeRoleWithLDAPIdentity',
    Version: '2011-06-15',
    LDAPUsername: ACCESS_KEY,
    LDAPPassword: SECRET_KEY,
    DurationSeconds: String(STS_DURATION),
  });

  const accessKey = pick(body, 'AccessKeyId');
  const secretKey = pick(body, 'SecretAccessKey');
  const sessionToken = pick(body, 'SessionToken');
  const expiration = pick(body, 'Expiration');

  if (status !== 200 || !accessKey || !secretKey) {
    const msg = pick(body, 'Message') || body.slice(0, 300);
    throw new Error(`STS AssumeRoleWithLDAPIdentity gagal (${status}): ${msg}`);
  }

  _cached = {
    accessKey,
    secretKey,
    sessionToken,
    expMs: expiration ? Date.parse(expiration) : now + STS_DURATION * 1000,
  };
  return _cached;
}

// ---- client factory -----------------------------------------------------
async function getClient() {
  if (AUTH_MODE === 'ldap') {
    const c = await ldapCredentials();
    return new Minio.Client({
      endPoint: ENDPOINT,
      port: PORT,
      useSSL: USE_SSL,
      accessKey: c.accessKey,
      secretKey: c.secretKey,
      sessionToken: c.sessionToken,
    });
  }
  return new Minio.Client({
    endPoint: ENDPOINT,
    port: PORT,
    useSSL: USE_SSL,
    accessKey: ACCESS_KEY,
    secretKey: SECRET_KEY,
  });
}

let _bucketChecked = false;
async function ensureBucket(client) {
  if (_bucketChecked) return;
  try {
    const exists = await client.bucketExists(BUCKET);
    if (!exists) {
      console.warn(
        `[minio] bucket "${BUCKET}" tidak terlihat oleh kredensial ini — pastikan sudah dibuat & kredensial punya akses.`
      );
    }
  } catch (e) {
    console.warn('[minio] bucketExists gagal:', e.message);
  }
  _bucketChecked = true;
}

const objectKey = (name) => `${PREFIX}${name}`;

/** Upload buffer -> return object key yang disimpan di DB. */
async function putImage(name, buffer, contentType = 'image/jpeg') {
  const client = await getClient();
  await ensureBucket(client);
  const key = objectKey(name);
  await client.putObject(BUCKET, key, buffer, buffer.length, {
    'Content-Type': contentType,
  });
  return key;
}

/** Presigned GET URL untuk 1 object key. Null bila key kosong / gagal. */
async function presignedUrl(key, expiry = PRESIGN_EXPIRY) {
  if (!key) return null;
  try {
    const client = await getClient();
    return await client.presignedGetObject(BUCKET, key, expiry);
  } catch (e) {
    console.error('MinIO presign error:', e.message);
    return null;
  }
}

async function removeObject(key) {
  if (!key) return;
  try {
    const client = await getClient();
    await client.removeObject(BUCKET, key);
  } catch (e) {
    console.error('MinIO remove error:', e.message);
  }
}

module.exports = {
  getClient,
  BUCKET,
  PREFIX,
  putImage,
  presignedUrl,
  removeObject,
  objectKey,
};
