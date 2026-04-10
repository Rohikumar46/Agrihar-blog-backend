const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
    },
    excerpt: {
      type: String,
      default: '',
      trim: true,
      maxlength: 300,
    },
    author: {
      type: String,
      default: 'Admin',
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    category: {
      type: String,
      default: 'general',
      trim: true,
      lowercase: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    imageUrl: {
      type: String,
      default: '',
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

blogSchema.index({ createdAt: -1 });
blogSchema.index({ category: 1, createdAt: -1 });
blogSchema.index({ tags: 1 });

module.exports = mongoose.model('Blog', blogSchema);
