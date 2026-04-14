const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Blog = require('../models/Blog');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();
const ALLOWED_STATUSES = new Set(['draft', 'pending', 'approved', 'rejected']);

function createSlug(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ensureUniqueSlug(baseValue, ignoreId = null) {
  const baseSlug = createSlug(baseValue) || 'blog-post';
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const existingBlog = await Blog.findOne({ slug });

    if (!existingBlog || (ignoreId && existingBlog._id.toString() === ignoreId.toString())) {
      return slug;
    }

    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }
}

function parseTags(input) {
  if (Array.isArray(input)) {
    return input
      .filter((tag) => typeof tag === 'string')
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
  }

  if (typeof input === 'string') {
    return input
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
  }

  return [];
}

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function canIncludeDrafts(req) {
  if (req.query.includeDrafts !== 'true') {
    return false;
  }

  const authHeader = req.header('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.slice(7).trim();

  if (!token || !process.env.JWT_SECRET) {
    return false;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded && decoded.role === 'admin';
  } catch {
    return false;
  }
}

function validateBlogPayload(body, requireRequiredFields = true) {
  const errors = [];

  const hasTitle = Object.prototype.hasOwnProperty.call(body, 'title');
  const hasContent = Object.prototype.hasOwnProperty.call(body, 'content');

  if (requireRequiredFields || hasTitle) {
    if (typeof body.title !== 'string' || body.title.trim().length === 0) {
      errors.push('title is required and must be a non-empty string');
    }
  }

  if (requireRequiredFields || hasContent) {
    if (typeof body.content !== 'string' || body.content.trim().length === 0) {
      errors.push('content is required and must be a non-empty string');
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'author') && typeof body.author !== 'string') {
    errors.push('author must be a string');
  }

  if (Object.prototype.hasOwnProperty.call(body, 'imageUrl') && typeof body.imageUrl !== 'string') {
    errors.push('imageUrl must be a string');
  }

  if (Object.prototype.hasOwnProperty.call(body, 'bodyImage') && typeof body.bodyImage !== 'string') {
    errors.push('bodyImage must be a string');
  }

  if (Object.prototype.hasOwnProperty.call(body, 'excerpt') && typeof body.excerpt !== 'string') {
    errors.push('excerpt must be a string');
  }

  if (Object.prototype.hasOwnProperty.call(body, 'category') && typeof body.category !== 'string') {
    errors.push('category must be a string');
  }

  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    if (typeof body.status !== 'string' || !ALLOWED_STATUSES.has(body.status.trim().toLowerCase())) {
      errors.push('status must be one of: draft, pending, approved, rejected');
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'adminMessage') && typeof body.adminMessage !== 'string') {
    errors.push('adminMessage must be a string');
  }

  if (Object.prototype.hasOwnProperty.call(body, 'authorName') && typeof body.authorName !== 'string') {
    errors.push('authorName must be a string');
  }

  if (Object.prototype.hasOwnProperty.call(body, 'authorImage') && typeof body.authorImage !== 'string') {
    errors.push('authorImage must be a string');
  }

  if (Object.prototype.hasOwnProperty.call(body, 'authorLinkedIn') && typeof body.authorLinkedIn !== 'string') {
    errors.push('authorLinkedIn must be a string');
  }

  if (Object.prototype.hasOwnProperty.call(body, 'tags')) {
    const tagsAreValid =
      Array.isArray(body.tags) && body.tags.every((tag) => typeof tag === 'string' && tag.trim().length > 0);

    if (!tagsAreValid) {
      errors.push('tags must be an array of non-empty strings');
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'isPublished') && typeof body.isPublished !== 'boolean') {
    errors.push('isPublished must be a boolean');
  }

  return errors;
}

router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const allowedSortFields = new Set(['createdAt', 'updatedAt', 'title']);
    const sortBy = allowedSortFields.has(req.query.sortBy) ? req.query.sortBy : 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    const query = {};
    const includeDrafts = canIncludeDrafts(req);

    if (!includeDrafts) {
      query.isPublished = true;
      query.status = 'approved';
    }

    if (typeof req.query.category === 'string' && req.query.category.trim()) {
      query.category = req.query.category.trim().toLowerCase();
    }

    if (typeof req.query.tag === 'string' && req.query.tag.trim()) {
      query.tags = req.query.tag.trim().toLowerCase();
    }

    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      const safeQuery = escapeRegex(req.query.q.trim());
      const searchRegex = new RegExp(safeQuery, 'i');
      query.$or = [
        { title: searchRegex },
        { content: searchRegex },
        { excerpt: searchRegex },
        { category: searchRegex },
      ];
    }

    const [blogs, totalItems] = await Promise.all([
      Blog.find(query)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit),
      Blog.countDocuments(query),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    res.status(200).json({
      data: blogs,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      filters: {
        q: req.query.q || null,
        category: req.query.category || null,
        tag: req.query.tag || null,
      },
      sort: {
        sortBy,
        sortOrder: sortOrder === 1 ? 'asc' : 'desc',
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/slug/:slug', async (req, res) => {
  try {
    const includeDrafts = canIncludeDrafts(req);

    const blog = await Blog.findOne({
      slug: req.params.slug.trim().toLowerCase(),
      ...(includeDrafts ? {} : { isPublished: true, status: 'approved' }),
    });

    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    return res.status(200).json(blog);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid blog id' });
  }

  try {
    const includeDrafts = canIncludeDrafts(req);

    const blog = await Blog.findOne({
      _id: req.params.id,
      ...(includeDrafts ? {} : { isPublished: true, status: 'approved' }),
    });

    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    return res.status(200).json(blog);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
  const payloadErrors = validateBlogPayload(req.body, true);

  if (payloadErrors.length > 0) {
    return res.status(400).json({ message: payloadErrors.join(', ') });
  }

    try {
      const {
        title,
        content,
        author,
        imageUrl,
        bodyImage,
        excerpt,
        category,
        tags,
        isPublished,
        status,
        adminMessage,
        authorName,
        authorImage,
        authorLinkedIn,
      } = req.body;

      const slug = await ensureUniqueSlug(title);
      const normalizedStatus =
        typeof status === 'string' && ALLOWED_STATUSES.has(status.trim().toLowerCase())
          ? status.trim().toLowerCase()
          : typeof isPublished === 'boolean' && !isPublished
            ? 'draft'
            : 'approved';

      const newBlog = await Blog.create({
        title: title.trim(),
        slug,
        content: content.trim(),
        excerpt: typeof excerpt === 'string' ? excerpt.trim() : content.slice(0, 180).trim(),
        author,
        authorName: typeof authorName === 'string' ? authorName.trim() : typeof author === 'string' ? author.trim() : '',
        authorImage,
        authorLinkedIn,
        imageUrl,
        bodyImage: typeof bodyImage === 'string' ? bodyImage.trim() : '',
        category: typeof category === 'string' ? category.trim().toLowerCase() : undefined,
        tags: parseTags(tags),
        status: normalizedStatus,
        adminMessage: typeof adminMessage === 'string' ? adminMessage.trim() : '',
        isPublished: normalizedStatus === 'approved',
      });

      return res.status(201).json(newBlog);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
});

router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid blog id' });
  }

  const payloadErrors = validateBlogPayload(req.body, false);

  if (payloadErrors.length > 0) {
    return res.status(400).json({ message: payloadErrors.join(', ') });
  }

    try {
      const updatePayload = { ...req.body };

      if (typeof updatePayload.title === 'string' && updatePayload.title.trim()) {
        updatePayload.title = updatePayload.title.trim();
        updatePayload.slug = await ensureUniqueSlug(updatePayload.title, req.params.id);
      }

      if (typeof updatePayload.content === 'string') {
        updatePayload.content = updatePayload.content.trim();
      }

      if (typeof updatePayload.excerpt === 'string') {
        updatePayload.excerpt = updatePayload.excerpt.trim();
      }

      if (typeof updatePayload.category === 'string') {
        updatePayload.category = updatePayload.category.trim().toLowerCase();
      }

      if (typeof updatePayload.status === 'string') {
        const normalizedStatus = updatePayload.status.trim().toLowerCase();

        if (!ALLOWED_STATUSES.has(normalizedStatus)) {
          return res.status(400).json({ message: 'status must be one of: draft, pending, approved, rejected' });
        }

        updatePayload.status = normalizedStatus;
        updatePayload.isPublished = normalizedStatus === 'approved';
      } else if (typeof updatePayload.isPublished === 'boolean') {
        updatePayload.status = updatePayload.isPublished ? 'approved' : 'draft';
      }

      if (typeof updatePayload.adminMessage === 'string') {
        updatePayload.adminMessage = updatePayload.adminMessage.trim();
      }

      if (typeof updatePayload.authorName === 'string') {
        updatePayload.authorName = updatePayload.authorName.trim();
      }

      if (typeof updatePayload.authorImage === 'string') {
        updatePayload.authorImage = updatePayload.authorImage.trim();
      }

      if (typeof updatePayload.authorLinkedIn === 'string') {
        updatePayload.authorLinkedIn = updatePayload.authorLinkedIn.trim();
      }

      if (typeof updatePayload.imageUrl === 'string') {
        updatePayload.imageUrl = updatePayload.imageUrl.trim();
      }

      if (typeof updatePayload.bodyImage === 'string') {
        updatePayload.bodyImage = updatePayload.bodyImage.trim();
      }

      if (Object.prototype.hasOwnProperty.call(updatePayload, 'tags')) {
        updatePayload.tags = parseTags(updatePayload.tags);
      }

      const updatedBlog = await Blog.findByIdAndUpdate(req.params.id, updatePayload, {
        new: true,
        runValidators: true,
      });

      if (!updatedBlog) {
        return res.status(404).json({ message: 'Blog not found' });
      }

      return res.status(200).json(updatedBlog);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
});

router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid blog id' });
  }

    try {
      const deletedBlog = await Blog.findByIdAndDelete(req.params.id);

      if (!deletedBlog) {
        return res.status(404).json({ message: 'Blog not found' });
      }

      return res.status(200).json({ message: 'Blog deleted successfully' });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
});

module.exports = router;
