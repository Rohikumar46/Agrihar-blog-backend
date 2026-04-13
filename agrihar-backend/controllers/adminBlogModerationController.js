const mongoose = require('mongoose');
const Blog = require('../models/Blog');
const { ensureUniqueSlug } = require('./blogControllerUtils');

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

const ALLOWED_STATUSES = new Set(['draft', 'pending', 'approved', 'rejected']);

// GET /api/admin/blogs
// Returns all blogs (any status) with optional filters.
async function getAllBlogs(req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const query = {};

    if (typeof req.query.status === 'string' && req.query.status.trim()) {
      const s = req.query.status.trim().toLowerCase();

      if (ALLOWED_STATUSES.has(s)) {
        query.status = s;
      }
    }

    if (typeof req.query.category === 'string' && req.query.category.trim()) {
      query.category = req.query.category.trim().toLowerCase();
    }

    if (typeof req.query.authorEmail === 'string' && req.query.authorEmail.trim()) {
      query.authorEmail = req.query.authorEmail.trim().toLowerCase();
    }

    const [blogs, totalItems] = await Promise.all([
      Blog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Blog.countDocuments(query),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    return res.status(200).json({
      data: blogs,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// GET /api/admin/blogs/pending
// Returns only pending blogs.
async function getPendingBlogs(req, res) {
  try {
    const blogs = await Blog.find({ status: 'pending' }).sort({ createdAt: -1 });
    return res.status(200).json({ data: blogs });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// GET /api/admin/blog/:id
// Preview any blog regardless of status.
async function getBlogById(req, res) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid blog id' });
  }

  try {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    return res.status(200).json({ data: blog });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// PUT /api/admin/blog/:id/approve
// Approve a blog.
async function approveBlog(req, res) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid blog id' });
  }

  try {
    const blog = await Blog.findByIdAndUpdate(
      req.params.id,
      { status: 'approved', isPublished: true, adminMessage: '' },
      { new: true, runValidators: true }
    );

    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    return res.status(200).json({ message: 'Blog approved successfully', data: blog });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// PUT /api/admin/blog/:id/reject
// Reject a blog with a required admin message.
async function rejectBlog(req, res) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid blog id' });
  }

  const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';

  if (!message) {
    return res.status(400).json({ message: 'Reject message is required' });
  }

  try {
    const blog = await Blog.findByIdAndUpdate(
      req.params.id,
      { status: 'rejected', isPublished: false, adminMessage: message },
      { new: true, runValidators: true }
    );

    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    return res.status(200).json({ message: 'Blog rejected successfully', data: blog });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// PUT /api/admin/blog/:id
// Edit any blog — admin can change any field including status.
async function editBlog(req, res) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid blog id' });
  }

  try {
    const update = {};

    if (typeof req.body.title === 'string' && req.body.title.trim()) {
      update.title = req.body.title.trim();
      update.slug = await ensureUniqueSlug(update.title, req.params.id);
    }

    if (typeof req.body.content === 'string') {
      update.content = req.body.content.trim();
    }

    if (typeof req.body.excerpt === 'string') {
      update.excerpt = req.body.excerpt.trim();
    }

    if (typeof req.body.subTitle === 'string') {
      update.subTitle = req.body.subTitle.trim();
    }

    if (typeof req.body.category === 'string') {
      update.category = req.body.category.trim().toLowerCase();
    }

    if (typeof req.body.imageUrl === 'string') {
      update.imageUrl = req.body.imageUrl.trim();
    }

    if (typeof req.body.authorName === 'string') {
      update.authorName = req.body.authorName.trim();
      update.author = update.authorName;
    }

    if (typeof req.body.authorImage === 'string') {
      update.authorImage = req.body.authorImage.trim();
    }

    if (typeof req.body.authorLinkedIn === 'string') {
      update.authorLinkedIn = req.body.authorLinkedIn.trim();
    }

    if (typeof req.body.adminMessage === 'string') {
      update.adminMessage = req.body.adminMessage.trim();
    }

    if (typeof req.body.status === 'string') {
      const s = req.body.status.trim().toLowerCase();

      if (!ALLOWED_STATUSES.has(s)) {
        return res.status(400).json({ message: 'status must be one of: draft, pending, approved, rejected' });
      }

      update.status = s;
      update.isPublished = s === 'approved';
    }

    const blog = await Blog.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });

    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    return res.status(200).json({ data: blog });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

// DELETE /api/admin/blog/:id
// Delete any blog.
async function deleteBlog(req, res) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid blog id' });
  }

  try {
    const blog = await Blog.findByIdAndDelete(req.params.id);

    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    return res.status(200).json({ message: 'Blog deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  getAllBlogs,
  getPendingBlogs,
  getBlogById,
  approveBlog,
  rejectBlog,
  editBlog,
  deleteBlog,
};
