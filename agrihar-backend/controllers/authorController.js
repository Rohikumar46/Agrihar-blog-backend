const mongoose = require('mongoose');
const Blog = require('../models/Blog');
const { ensureUniqueSlug } = require('./blogControllerUtils');

const DEFAULT_AUTHOR_IMAGE =
  'https://ui-avatars.com/api/?name=Writer&background=0D8ABC&color=fff';

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function validateAuthorBlogPayload(body, requireRequiredFields = true) {
  const errors = [];

  const hasTitle = Object.prototype.hasOwnProperty.call(body, 'title');
  const hasContent = Object.prototype.hasOwnProperty.call(body, 'content');

  if (requireRequiredFields || hasTitle) {
    if (typeof body.title !== 'string' || body.title.trim().length === 0) {
      errors.push('title is required');
    }
  }

  if (requireRequiredFields || hasContent) {
    if (typeof body.content !== 'string' || body.content.trim().length === 0) {
      errors.push('content is required');
    }
  }

  if (requireRequiredFields) {
    if (typeof body.authorName !== 'string' || body.authorName.trim().length === 0) {
      errors.push('authorName is required');
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'authorName') && typeof body.authorName !== 'string') {
    errors.push('authorName must be a string');
  }

  if (Object.prototype.hasOwnProperty.call(body, 'subTitle') && typeof body.subTitle !== 'string') {
    errors.push('subTitle must be a string');
  }

  if (Object.prototype.hasOwnProperty.call(body, 'category') && typeof body.category !== 'string') {
    errors.push('category must be a string');
  }

  if (Object.prototype.hasOwnProperty.call(body, 'imageUrl') && typeof body.imageUrl !== 'string') {
    errors.push('imageUrl must be a string');
  }

  if (Object.prototype.hasOwnProperty.call(body, 'authorLinkedIn') && typeof body.authorLinkedIn !== 'string') {
    errors.push('authorLinkedIn must be a string');
  }

  if (Object.prototype.hasOwnProperty.call(body, 'authorImage') && typeof body.authorImage !== 'string') {
    errors.push('authorImage must be a string');
  }

  if (Object.prototype.hasOwnProperty.call(body, 'excerpt') && typeof body.excerpt !== 'string') {
    errors.push('excerpt must be a string');
  }

  return errors;
}

// GET /api/author/blogs
// Returns all blogs belonging to the authenticated author (by email from JWT).
async function getMyBlogs(req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const query = { authorEmail: req.user.email };

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

// GET /api/author/blogs/:id
// Preview a single blog — only if the author owns it.
async function getMyBlog(req, res) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid blog id' });
  }

  try {
    const blog = await Blog.findOne({ _id: req.params.id, authorEmail: req.user.email });

    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    return res.status(200).json({ data: blog });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// POST /api/author/blogs
// Create a new blog. Status is always 'pending'; authorEmail is taken from JWT.
async function createBlog(req, res) {
  const errors = validateAuthorBlogPayload(req.body, true);

  if (errors.length > 0) {
    return res.status(400).json({ message: errors.join(', ') });
  }

  try {
    const {
      title,
      content,
      authorName,
      subTitle,
      category,
      imageUrl,
      bodyImage,
      authorImage,
      authorLinkedIn,
      excerpt,
    } = req.body;

    const slug = await ensureUniqueSlug(title);

    const blog = await Blog.create({
      title: title.trim(),
      slug,
      content: content.trim(),
      excerpt: typeof excerpt === 'string' && excerpt.trim() ? excerpt.trim() : content.slice(0, 180).trim(),
      subTitle: typeof subTitle === 'string' ? subTitle.trim() : '',
      authorEmail: req.user.email,
      author: authorName.trim(),
      authorName: authorName.trim(),
      authorImage:
        typeof authorImage === 'string' && authorImage.trim()
          ? authorImage.trim()
          : DEFAULT_AUTHOR_IMAGE,
      authorLinkedIn: typeof authorLinkedIn === 'string' ? authorLinkedIn.trim() : '',
      imageUrl: typeof imageUrl === 'string' ? imageUrl.trim() : '',
      bodyImage: typeof bodyImage === 'string' && bodyImage.trim() ? bodyImage.trim() : '',
      category:
        typeof category === 'string' && category.trim()
          ? category.trim().toLowerCase()
          : 'general',
      status: 'pending',
      isPublished: false,
      adminMessage: '',
    });

    return res.status(201).json({
      message: 'Blog submitted for review',
      data: blog,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

// PUT /api/author/blogs/:id
// Edit own blog. Only allowed if the author owns it.
// Authors cannot change status — that is admin-only.
async function updateMyBlog(req, res) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid blog id' });
  }

  const errors = validateAuthorBlogPayload(req.body, false);

  if (errors.length > 0) {
    return res.status(400).json({ message: errors.join(', ') });
  }

  try {
    const existing = await Blog.findOne({ _id: req.params.id, authorEmail: req.user.email });

    if (!existing) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    // Strip fields authors are not allowed to set
    const { status, adminMessage, isPublished, authorEmail, ...allowedFields } = req.body;

    const update = {};

    if (typeof allowedFields.title === 'string' && allowedFields.title.trim()) {
      update.title = allowedFields.title.trim();
      update.slug = await ensureUniqueSlug(update.title, req.params.id);
    }

    if (typeof allowedFields.content === 'string') {
      update.content = allowedFields.content.trim();
    }

    if (typeof allowedFields.excerpt === 'string') {
      update.excerpt = allowedFields.excerpt.trim();
    }

    if (typeof allowedFields.subTitle === 'string') {
      update.subTitle = allowedFields.subTitle.trim();
    }

    if (typeof allowedFields.authorName === 'string') {
      update.authorName = allowedFields.authorName.trim();
      update.author = update.authorName;
    }

    if (typeof allowedFields.authorImage === 'string') {
      update.authorImage = allowedFields.authorImage.trim();
    }

    if (typeof allowedFields.authorLinkedIn === 'string') {
      update.authorLinkedIn = allowedFields.authorLinkedIn.trim();
    }

    if (typeof allowedFields.imageUrl === 'string') {
      update.imageUrl = allowedFields.imageUrl.trim();
    }

    if (typeof allowedFields.bodyImage === 'string') {
      update.bodyImage = allowedFields.bodyImage.trim();
    }

    if (typeof allowedFields.category === 'string') {
      update.category = allowedFields.category.trim().toLowerCase();
    }

    // Editing a rejected blog resets it back to pending for re-review
    if (existing.status === 'rejected') {
      update.status = 'pending';
      update.adminMessage = '';
      update.isPublished = false;
    }

    const updated = await Blog.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });

    return res.status(200).json({ data: updated });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

module.exports = {
  getMyBlogs,
  getMyBlog,
  createBlog,
  updateMyBlog,
};
