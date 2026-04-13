const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const SuperAdmin = require('../models/SuperAdmin');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });
}

// ─── Super Admin Login ────────────────────────────────────────────────────────
// POST /api/auth/admin/login
// Accepts { email, password }
// Checks DB first; falls back to env-based credentials for the initial setup.
router.post('/admin/login', async (req, res) => {
  if (!process.env.JWT_SECRET) {
    return res.status(503).json({ message: 'Server auth is not configured. JWT_SECRET is missing.' });
  }

  const { email, password } = req.body;

  if (typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ message: 'email is required' });
  }

  if (typeof password !== 'string' || !password) {
    return res.status(400).json({ message: 'password is required' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Check env-based credentials first (bootstrap / fallback)
  const envEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const envPassword = process.env.ADMIN_PASSWORD || '';

  if (envEmail && envPassword && normalizedEmail === envEmail) {
    // Env password may be plain text (bootstrap) or a bcrypt hash
    const isBcryptHash = envPassword.startsWith('$2b$') || envPassword.startsWith('$2a$');
    const envMatch = isBcryptHash
      ? await bcrypt.compare(password, envPassword)
      : password === envPassword;

    if (envMatch) {
      const token = signToken({ sub: 'env-admin', role: 'admin', email: normalizedEmail });
      return res.status(200).json({
        token,
        tokenType: 'Bearer',
        expiresIn: process.env.JWT_EXPIRES_IN || '1d',
        user: { email: normalizedEmail, role: 'admin' },
      });
    }
  }

  // Then check database (for SuperAdmin accounts created via DB)
  try {
    const adminDoc = await SuperAdmin.findOne({ email: normalizedEmail });

    if (!adminDoc) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await adminDoc.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = signToken({ sub: adminDoc._id, role: 'admin', email: normalizedEmail });

    return res.status(200).json({
      token,
      tokenType: 'Bearer',
      expiresIn: process.env.JWT_EXPIRES_IN || '1d',
      user: { email: normalizedEmail, role: 'admin' },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// ─── Legacy Admin Login (kept for backward compatibility) ─────────────────────
// POST /api/auth/login
// Accepts { username, password } from env vars
router.post('/login', (req, res) => {
  const missingConfig = ['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'JWT_SECRET'].filter(
    (key) => !process.env[key]
  );

  if (missingConfig.length > 0) {
    return res.status(503).json({
      message: `Server auth is not configured. Missing: ${missingConfig.join(', ')}`,
    });
  }

  const { username, password } = req.body;

  if (username !== process.env.ADMIN_USERNAME || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = signToken({ sub: username, role: 'admin', username });

  return res.status(200).json({
    token,
    tokenType: 'Bearer',
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    user: { username, role: 'admin' },
  });
});

// ─── Author Email Access ──────────────────────────────────────────────────────
// POST /api/auth/author/access
// Accepts { email }
// Returns a JWT with role='author' so the author can manage their own blogs.
router.post('/author/access', (req, res) => {
  if (!process.env.JWT_SECRET) {
    return res.status(503).json({ message: 'Server auth is not configured. JWT_SECRET is missing.' });
  }

  const { email } = req.body;

  if (typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ message: 'email is required' });
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ message: 'A valid email address is required' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const token = signToken({ sub: normalizedEmail, role: 'author', email: normalizedEmail });

  return res.status(200).json({
    token,
    tokenType: 'Bearer',
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    user: { email: normalizedEmail, role: 'author' },
  });
});

// ─── Current User ─────────────────────────────────────────────────────────────
// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  return res.status(200).json({ user: req.user });
});

module.exports = router;
