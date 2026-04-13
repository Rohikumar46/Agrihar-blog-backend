const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const {
  getAllBlogs,
  getPendingBlogs,
  getBlogById,
  approveBlog,
  rejectBlog,
  editBlog,
  deleteBlog,
} = require('../controllers/adminBlogModerationController');

const router = express.Router();

// All routes require a valid admin JWT
router.use(authenticateToken, requireRole('admin'));

// Blog listing
router.get('/blogs', getAllBlogs);            // all blogs (filterable by status, category, authorEmail)
router.get('/blogs/pending', getPendingBlogs); // pending blogs only

// Single blog
router.get('/blog/:id', getBlogById);         // preview any blog

// Moderation actions
router.put('/blog/:id/approve', approveBlog);
router.put('/blog/:id/reject', rejectBlog);

// Full edit & delete
router.put('/blog/:id', editBlog);
router.delete('/blog/:id', deleteBlog);

module.exports = router;
