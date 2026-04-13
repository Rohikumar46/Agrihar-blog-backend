const Blog = require('../models/Blog');

function createSlug(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  createSlug,
  ensureUniqueSlug,
  escapeRegex,
};
