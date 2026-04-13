const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getMyBlogs, getMyBlog, createBlog, updateMyBlog } = require('../controllers/authorController');

const router = express.Router();

// All routes require a valid author JWT
router.use(authenticateToken, requireRole('author'));

router.get('/blogs', getMyBlogs);
router.get('/blogs/:id', getMyBlog);
router.post('/blogs', createBlog);
router.put('/blogs/:id', updateMyBlog);

module.exports = router;
