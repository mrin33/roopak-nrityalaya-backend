// Central, validated access to environment configuration.
// Fails fast on missing or unsafe security-critical settings.
require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

const fail = (message) => {
  // eslint-disable-next-line no-console
  console.error(`❌ Configuration error: ${message}`);
  process.exit(1);
};

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  fail('JWT_SECRET must be set and at least 32 characters long.');
}

const splitList = (value) =>
  (value || '')
    .split(',')
    .map((v) => v.trim().replace(/\/$/, ''))
    .filter(Boolean);

const corsOrigins = splitList(process.env.CORS_ORIGINS || process.env.FRONTEND_URL);
if (isProduction && corsOrigins.length === 0) {
  fail('FRONTEND_URL (or CORS_ORIGINS) must be set in production.');
}
if (!isProduction && corsOrigins.length === 0) {
  corsOrigins.push('http://localhost:3000');
}

const toInt = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

module.exports = {
  NODE_ENV,
  isProduction,
  port: toInt(process.env.PORT, 5000),
  jwt: {
    secret: JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    issuer: 'roopak-nrityalaya',
  },
  corsOrigins,
  // Public URL of the frontend, used to build password-setup links.
  frontendUrl: corsOrigins[0],
  // Number of reverse proxies in front of the app (e.g. 1 on Render/Railway).
  trustProxy: toInt(process.env.TRUST_PROXY, 0),
  bcryptRounds: toInt(process.env.BCRYPT_ROUNDS, 12),
  inviteTokenTtlHours: toInt(process.env.INVITE_TOKEN_TTL_HOURS, 72),
  upload: {
    dir: process.env.UPLOAD_DIR || require('path').join(__dirname, '..', 'uploads'),
    maxBytes: toInt(process.env.UPLOAD_MAX_MB, 50) * 1024 * 1024,
  },
  db: {
    connectionString: process.env.DATABASE_URL || undefined,
    host: process.env.DB_HOST,
    port: toInt(process.env.DB_PORT, 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    // Managed providers (Neon, Render, Supabase) require TLS.
    ssl: ['true', '1', 'require'].includes(String(process.env.DB_SSL).toLowerCase()),
    max: toInt(process.env.DB_POOL_MAX, 10),
  },
};
