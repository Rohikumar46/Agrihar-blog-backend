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
    bodyImage: {
      type: String,
      default: '',
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ['draft', 'pending', 'approved', 'rejected'],
      default: function setDefaultStatus() {
        return this.isPublished ? 'approved' : 'draft';
      },
      index: true,
      lowercase: true,
      trim: true,
    },
    adminMessage: {
      type: String,
      default: '',
      trim: true,
    },
    authorEmail: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
    },
    authorName: {
      type: String,
      default: '',
      trim: true,
    },
    authorImage: {
      type: String,
      default: 'https://ui-avatars.com/api/?name=Writer&background=0D8ABC&color=fff',
      trim: true,
    },
    authorLinkedIn: {
      type: String,
      default: '',
      trim: true,
    },
    subTitle: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

blogSchema.index({ createdAt: -1 });
blogSchema.index({ category: 1, createdAt: -1 });
blogSchema.index({ tags: 1 });
blogSchema.virtual('previewImage').get(function getPreviewImage() {
  return this.bodyImage || this.imageUrl || '';
});

module.exports = mongoose.model('Blog', blogSchema);
