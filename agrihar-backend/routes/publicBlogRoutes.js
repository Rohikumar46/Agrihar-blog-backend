const express = require('express');
const {
  submitBlog,
  getApprovedBlogs,
  getApprovedBlogBySlug,
} = require('../controllers/publicBlogController');

const router = express.Router();

router.post('/submit', submitBlog);
router.get('/', getApprovedBlogs);
router.get('/:slug', getApprovedBlogBySlug);

module.exports = router;
