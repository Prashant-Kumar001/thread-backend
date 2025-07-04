import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;

const threadSchema = new Schema(
  {
    author: { type: Types.ObjectId, ref: "User", required: true },
    content: {
      type: String,
      maxlength: 500,
      trim: true,
      required: function () {
        return this.threadType !== "repost";
      },
    },
    quoteContent: {
      type: String,
      maxlength: 300,
      trim: true,
      default: null,
    },
    media: [
      {
        secure_url: { type: String, required: true },
        public_id: { type: String, required: true },
      },
    ],
    threadType: {
      type: String,
      enum: ["thread", "reply", "repost"],
      default: "thread",
    },
    parent: { type: Types.ObjectId, ref: "Thread", default: null },
    originalThread: { type: Types.ObjectId, ref: "Thread", default: null },
    likes: [{ type: Types.ObjectId, ref: "User" }],
    reposts: [{ type: Types.ObjectId, ref: "User" }],
    replies: [{ type: Types.ObjectId, ref: "Thread" }],
    likeCount: { type: Number, default: 0 },
    repostCount: { type: Number, default: 0 },
    replyCount: { type: Number, default: 0 },
    visibility: {
      type: String,
      enum: ["public", "private"],
      default: "public",
    },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    hiddenBy: [{ type: Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

threadSchema.index({ author: 1 });
threadSchema.index({ parent: 1 });
threadSchema.index({ createdAt: -1 });
threadSchema.index({ originalThread: 1 });

threadSchema.index(
  { threadType: 1, originalThread: 1, author: 1 },
  {
    unique: true,
    partialFilterExpression: { threadType: "repost" },
  }
);

export default model("Thread", threadSchema);
