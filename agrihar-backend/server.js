const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

dotenv.config({ path: path.join(__dirname, '.env') });

const authRoutes = require('./routes/authRoutes');
const blogRoutes = require('./routes/blogRoutes');
const publicBlogRoutes = require('./routes/publicBlogRoutes');
const adminBlogModerationRoutes = require('./routes/adminBlogModerationRoutes');
const authorRoutes = require('./routes/authorRoutes');

const app = express();

const PORT = Number(process.env.PORT) || 5000;
const MONGO_URI = process.env.MONGO_URI;
const MONGO_URI_ATLAS = process.env.MONGO_URI_ATLAS;
const SELECTED_MONGO_URI = MONGO_URI_ATLAS || MONGO_URI;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 200;

// Support wildcard, a single origin, or a comma-separated list of origins.
// Example: CORS_ORIGIN=https://agrihar-blog-frontend.vercel.app,http://localhost:3000
function buildCorsOrigin(raw) {
  if (raw === '*') return true;
  const list = raw.split(',').map((o) => o.trim()).filter(Boolean);
  return list.length === 1 ? list[0] : list;
}

app.disable('x-powered-by');
app.use(helmet());
app.use(
  cors({
    origin: buildCorsOrigin(CORS_ORIGIN),
    credentials: true,
  })
);
app.use(express.json());
app.use(morgan('dev'));
app.use(
  rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/blog', publicBlogRoutes);
app.use('/api/admin', adminBlogModerationRoutes);
app.use('/api/author', authorRoutes);

app.get('/', (req, res) => {
  res.send('Agrihar blog backend is running');
});

const dbStatus = {
  isConnected: false,
  uriSource: MONGO_URI_ATLAS ? 'MONGO_URI_ATLAS' : MONGO_URI ? 'MONGO_URI' : 'not_set',
  lastConnectedAt: null,
  lastError: null,
  lastErrorAt: null,
};

app.get('/health', (req, res) => {
  const statusCode = dbStatus.isConnected ? 200 : 503;

  res.status(statusCode).json({
    service: 'agrihar-backend',
    server: 'up',
    database: dbStatus.isConnected ? 'connected' : 'disconnected',
    dbSource: dbStatus.uriSource,
    lastConnectedAt: dbStatus.lastConnectedAt,
    lastError: dbStatus.lastError,
    lastErrorAt: dbStatus.lastErrorAt,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.get('/ready', (req, res) => {
  if (!dbStatus.isConnected) {
    return res.status(503).json({ ready: false, reason: 'database_disconnected' });
  }

  return res.status(200).json({ ready: true });
});

async function connectToDatabase() {
  if (!SELECTED_MONGO_URI) {
    dbStatus.lastError = 'No database URI found. Set MONGO_URI or MONGO_URI_ATLAS in .env';
    dbStatus.lastErrorAt = new Date().toISOString();
    console.warn(dbStatus.lastError);
    return;
  }

  try {
    await mongoose.connect(SELECTED_MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
  } catch (error) {
    dbStatus.isConnected = false;
    dbStatus.lastError = error.message;
    dbStatus.lastErrorAt = new Date().toISOString();
    console.error('MongoDB connection error:', error.message);
  }
}

async function seedSuperAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = (process.env.ADMIN_PASSWORD || '').trim();

  if (!email || !password) {
    return;
  }

  try {
    const SuperAdmin = require('./models/SuperAdmin');
    const existing = await SuperAdmin.findOne({ email });

    if (existing) {
      return;
    }

    await SuperAdmin.create({ email, password });
    console.log(`SuperAdmin seeded: ${email}`);
  } catch (err) {
    console.error('SuperAdmin seed error:', err.message);
  }
}

mongoose.connection.on('connected', () => {
  dbStatus.isConnected = true;
  dbStatus.lastConnectedAt = new Date().toISOString();
  dbStatus.lastError = null;
  dbStatus.lastErrorAt = null;
  console.log('MongoDB connected');
  seedSuperAdmin();
});

mongoose.connection.on('disconnected', () => {
  dbStatus.isConnected = false;
  console.warn('MongoDB disconnected');
});

mongoose.connection.on('error', (error) => {
  dbStatus.isConnected = false;
  dbStatus.lastError = error.message;
  dbStatus.lastErrorAt = new Date().toISOString();
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode = error.statusCode || 500;

  return res.status(statusCode).json({
    message: error.message || 'Internal server error',
  });
});

let isShuttingDown = false;

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  connectToDatabase();
});

function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`${signal} received. Shutting down gracefully...`);

  server.close(async () => {
    try {
      await mongoose.connection.close();
      console.log('MongoDB connection closed');
    } catch (error) {
      console.error('Error while closing MongoDB connection:', error.message);
    } finally {
      process.exit(0);
    }
  });

  setTimeout(() => {
    console.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
