const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config/env');
const pool = require('./config/database');
const { apiLimiter } = require('./middleware/rateLimiters');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const responseEnvelope = require('./middleware/responseEnvelope');
const validate = require('./middleware/validate');
const galleryController = require('./controllers/galleryController');
const { content: contentValidators } = require('./validators/domainValidators');

const app = express();

app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', config.trustProxy);

// Security headers. Media is fetched cross-origin by the frontend, so the
// resource policy is relaxed to "cross-origin" (CORS still governs the API).
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
  })
);

// Only approved frontend origins may call the API from a browser.
app.use(
  cors({
    origin(origin, callback) {
      // Non-browser clients (curl, health checks) send no Origin header.
      if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  })
);

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// Health check for hosting platforms (no DB details exposed).
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});

app.get('/', (req, res) => {
  res.json({ message: 'Roopak Nrityalaya API', status: 'running' });
});

// Published media only. Pending/rejected uploads are served exclusively via
// the authenticated /api/gallery-requests/:id/file endpoint.
const mediaRoute = [validate({ params: contentValidators.mediaParams }), galleryController.getPublicMedia];
app.get('/uploads/:filename', ...mediaRoute);
app.get('/api/media/:filename', ...mediaRoute);

app.use('/api', apiLimiter);
app.use('/api', responseEnvelope);
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/students', require('./routes/studentRoutes'));
app.use('/api/teachers', require('./routes/teacherRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/notices', require('./routes/noticeRoutes'));
app.use('/api/gallery-requests', require('./routes/galleryRequestRoutes'));
app.use('/api/gallery', require('./routes/galleryRoutes'));
app.use('/api/resources', require('./routes/resourceRoutes'));
app.use('/api/public', require('./routes/publicRoutes'));

app.use(notFound);
app.use(errorHandler);

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`🚀 Server running on port ${config.port} (${config.NODE_ENV})`);
  });
}

module.exports = app;
