const express = require('express');
const jwt = require('jsonwebtoken');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

function validateAuthConfig() {
  const requiredEnv = ['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'JWT_SECRET'];
  const missing = requiredEnv.filter((key) => !process.env[key]);

  return missing;
}

router.post('/login', (req, res) => {
  const missingConfig = validateAuthConfig();

  if (missingConfig.length > 0) {
    return res.status(503).json({
      message: `Server auth is not configured. Missing: ${missingConfig.join(', ')}`,
    });
  }

  const { username, password } = req.body;

  if (username !== process.env.ADMIN_USERNAME || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = jwt.sign(
    {
      sub: username,
      role: 'admin',
      username,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    }
  );

  return res.status(200).json({
    token,
    tokenType: 'Bearer',
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    user: {
      username,
      role: 'admin',
    },
  });
});

router.get('/me', authenticateToken, (req, res) => {
  return res.status(200).json({
    user: req.user,
  });
});

module.exports = router;