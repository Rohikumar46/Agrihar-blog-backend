const Blog = require('../models/Blog');
const { ensureUniqueSlug, escapeRegex } = require('./blogControllerUtils');

const DEFAULT_AUTHOR_IMAGE = 'https://ui-avatars.com/api/?name=Writer&background=0D8ABC&color=fff';

function validateSubmissionPayload(body) {
  const errors = [];

  if (typeof body.title !== 'string' || body.title.trim().length === 0) {
    errors.push('title is required');
  }

  if (typeof body.imageUrl !== 'string' || body.imageUrl.trim().length === 0) {
    errors.push('cover image is required');
  }

  if (typeof body.authorName !== 'string' || body.authorName.trim().length === 0) {
    errors.push('authorName is required');
  }

  if (typeof body.authorLinkedIn !== 'string' || body.authorLinkedIn.trim().length === 0) {
    errors.push('authorLinkedIn is required');
  }

  if (typeof body.content !== 'string' || body.content.trim().length === 0) {
    errors.push('content is required');
  }

  return errors;
}

async function submitBlog(req, res) {
  const payloadErrors = validateSubmissionPayload(req.body);

  if (payloadErrors.length > 0) {
    return res.status(400).json({ message: payloadErrors.join(', ') });
  }

  try {
    const { title, imageUrl, bodyImage, authorName, authorImage, authorLinkedIn, content, excerpt, category } = req.body;

    const slug = await ensureUniqueSlug(title);

    const blog = await Blog.create({
      title: title.trim(),
      slug,
      content: content.trim(),
      excerpt: typeof excerpt === 'string' && excerpt.trim() ? excerpt.trim() : content.slice(0, 180).trim(),
      imageUrl: imageUrl.trim(),
      bodyImage: typeof bodyImage === 'string' && bodyImage.trim() ? bodyImage.trim() : '',
      author: authorName.trim(),
      authorName: authorName.trim(),
      authorImage: typeof authorImage === 'string' && authorImage.trim() ? authorImage.trim() : DEFAULT_AUTHOR_IMAGE,
      authorLinkedIn: authorLinkedIn.trim(),
      category: typeof category === 'string' && category.trim() ? category.trim().toLowerCase() : 'recent-blogs',
      isPublished: false,
      status: 'pending',
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

async function getApprovedBlogs(req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const query = {
      status: 'approved',
      isPublished: true,
    };

    if (typeof req.query.category === 'string' && req.query.category.trim()) {
      query.category = req.query.category.trim().toLowerCase();
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

async function getApprovedBlogBySlug(req, res) {
  try {
    const blog = await Blog.findOne({
      slug: req.params.slug.trim().toLowerCase(),
      status: 'approved',
      isPublished: true,
    });

    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    return res.status(200).json({ data: blog });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  submitBlog,
  getApprovedBlogs,
  getApprovedBlogBySlug,
};
