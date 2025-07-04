import Thread from "../models/Thread.js";
import User from "../models/User.js";
import AppError from "../utils/appError.js";
import catchAsync from "../utils/catchAsync.js";
import {
  uploadThreadMedia,
  deleteFileFromCloudinary,
} from "../utils/features.js";

export const createThread = catchAsync(async (req, res, next) => {
  const {
    content,
    threadType,
    visibility = "public",
    quoteContent = null,
    parent = null,
    originalThread = null,
  } = req.body;

  const authorId = req.user?.id;
  if (!authorId) {
    return next(new AppError("Unauthorized: user not found.", 401));
  }

  if (!["thread", "reply", "repost"].includes(threadType)) {
    return next(
      new AppError(
        "Invalid thread type. Must be 'thread', 'reply', or 'repost'.",
        400
      )
    );
  }

  if (threadType === "repost") {
    if (!originalThread) {
      return next(new AppError("Repost must include originalThread ID.", 400));
    }

    const original = await Thread.findById(originalThread);
    if (!original || original.isDeleted) {
      return next(
        new AppError("Original thread not found or has been deleted.", 404)
      );
    }

    const existingRepost = await Thread.findOne({
      threadType: "repost",
      originalThread,
      author: authorId,
    });

    if (existingRepost) {
      return next(new AppError("You have already reposted this thread.", 409));
    }
  }

  if (threadType === "reply") {
    if (!parent) {
      return next(new AppError("Reply must include parent thread ID.", 400));
    }

    const parentThread = await Thread.findById(parent);
    if (!parentThread || parentThread.isDeleted) {
      return next(new AppError("Parent thread not found or deleted.", 404));
    }
  }

  if (threadType !== "repost" && (!content || content.trim() === "")) {
    return next(
      new AppError("Content is required for threads and replies.", 400)
    );
  }

  const files = req.files;
  const mediaUrls = [];

  if (files?.length > 4) {
    return next(new AppError("You can only upload up to 4 media files.", 400));
  }

  if (files?.length > 0) {
    const uploads = await uploadThreadMedia(files);
    mediaUrls.push(...uploads);
  }

  const newThread = new Thread({
    author: authorId,
    content,
    media: mediaUrls,
    quoteContent,
    threadType,
    parent,
    originalThread,
    visibility,
  });

  const savedThread = await newThread.save();

  if (threadType === "reply") {
    await Thread.findByIdAndUpdate(parent, {
      $push: { replies: savedThread._id },
      $inc: { replyCount: 1 },
    });
  }

  if (threadType === "repost") {
    await Thread.findByIdAndUpdate(originalThread, {
      $addToSet: { reposts: authorId },
      $inc: { repostCount: 1 },
    });
  }

  res.status(201).json({
    status: "success",
    message: "Thread created successfully.",
    thread: savedThread,
  });
});

export const deleteThread = catchAsync(async (req, res, next) => {
  const userId = req.user?.id;
  const { id: threadId } = req.params;
  const { deleteMode = "full" } = req.body || {};

  const thread = await Thread.findById(threadId);
  if (!thread) return next(new AppError("Thread not found.", 404));

  if (
    deleteMode !== "adminForce" &&
    thread.author.toString() !== userId.toString()
  ) {
    return next(
      new AppError("You are not authorized to delete this thread.", 403)
    );
  }

  if (deleteMode === "selfOnly") {
    thread.hiddenBy = thread.hiddenBy || [];
    if (!thread.hiddenBy.includes(userId)) {
      thread.hiddenBy.push(userId);
      await thread.save();
    }
    return res
      .status(200)
      .json({ message: "Thread hidden from your profile only." });
  }

  if (deleteMode === "soft") {
    thread.isDeleted = true;
    thread.deletedAt = new Date();
    thread.content = null;
    thread.media = [];
    await thread.save();
    return res
      .status(200)
      .json({ message: "Thread soft-deleted. Reposts will reflect status." });
  }

  if (deleteMode === "adminForce" || deleteMode === "full") {
    const replies = await Thread.find({ parent: thread._id });
    for (const reply of replies) {
      if (reply.media?.length > 0) {
        for (const media of reply.media) {
          try {
            await deleteFileFromCloudinary(media.public_id);
          } catch (err) {
            console.warn("Failed to delete media:", err.message);
          }
        }
      }
      await Thread.findByIdAndDelete(reply._id);
    }

    const reposts = await Thread.find({
      originalThread: thread._id,
      threadType: "repost",
    });
    for (const repost of reposts) {
      repost.isDeleted = true;
      repost.content = null;
      repost.deletedAt = new Date();
      await repost.save();
    }

    if (thread.threadType === "reply" && thread.parent) {
      await Thread.findByIdAndUpdate(thread.parent, {
        $pull: { replies: thread._id },
        $inc: { replyCount: -1 },
      });
    }

    if (thread.threadType === "repost" && thread.originalThread) {
      await Thread.findByIdAndUpdate(thread.originalThread, {
        $inc: { repostCount: -1 },
      });
    }

    if (thread.media?.length > 0) {
      for (const media of thread.media) {
        try {
          await deleteFileFromCloudinary(media.public_id);
        } catch (err) {
          console.warn("Media delete failed:", err.message);
        }
      }
    }

    await Thread.findByIdAndDelete(thread._id);

    return res
      .status(200)
      .json({ message: "Thread and related data deleted successfully." });
  }

  return next(new AppError("Invalid delete mode.", 400));
});

export const likeThread = catchAsync(async (req, res, next) => {
  const userId = req.user?.id;
  const { id: threadId } = req.params;

  const thread = await Thread.findById(threadId)
    .populate("author", "username avatar")
    .select(
      "-originalThread -hiddenBy -isDeleted -media -__v -deletedAt -quoteContent"
    );
  if (!thread) return next(new AppError("Thread not found.", 404));
  if (thread.isDeleted)
    return next(new AppError("Cannot like a deleted thread.", 410));

  const hasLiked = thread.likes.includes(userId);

  if (hasLiked) {
    thread.likes.pull(userId);
    thread.likeCount = Math.max(thread.likeCount - 1, 0);
  } else {
    thread.likes.push(userId);
    thread.likeCount += 1;
  }

  await thread.save();

  res.status(200).json({
    status: "success",
    message: hasLiked ? "Thread unliked." : "Thread liked.",
    likeCount: thread.likeCount,
    thread: thread,
  });
});

export const getAllThreads = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const threads = await Thread.find({
    visibility: "public",
    isDeleted: false,
    threadType: { $in: ["thread", "repost"] },
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate({
      path: "originalThread",
      populate: {
        path: "author",
        model: "User",
      },
    })
    .populate("author", "username avatar displayName createdAt")
    .populate({
      path: "likes",
      select: "_id username avatar displayName createdAt",
    })
    .populate({
      path: "replies",
      match: { isDeleted: false },
      select: "_id content likeCount replyCount likes replies author createdAt",
      populate: {
        path: "author",
        select: "_id username avatar displayName createdAt",
      },
    })
    .populate({
      path: "reposts",
      select: "_id username avatar displayName createdAt",
    })
    .lean();

  const total = await Thread.countDocuments({
    visibility: "public",
    isDeleted: false,
    threadType: "thread",
  });

  res.status(200).json({
    status: "success",
    thread: threads,
    total,
    currentPage: page,
    totalPages: Math.ceil(total / limit),
  });
});

export const getSingleThread = catchAsync(async (req, res, next) => {
  const threadId = req.params.id;
  const thread = await Thread.findById(threadId)
    .populate({
      path: "originalThread",
      populate: {
        path: "author",
        model: "User",
        select: "_id username avatar displayName createdAt",
      },
    })
    .populate("author", "username avatar")
    .select("-replies -deletedAt")
    .lean();
  if (!thread || thread.isDeleted) {
    return next(new AppError("Thread not found.", 404));
  }
  res.status(200).json({
    status: "success",
    thread,
  });
});

export const getThreadReplies = catchAsync(async (req, res, next) => {
  const { threadId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const thread = await Thread.findById(threadId);
  if (!thread || thread.isDeleted) {
    return next(new AppError("Thread not found or deleted.", 404));
  }

  const replies = await Thread.find({
    parent: threadId,
    isDeleted: false,
  })
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(limit)
    .select(
      "-originalThread -hiddenBy -isDeleted -media -__v -deletedAt -quoteContent"
    )
    .populate("author", "username avatar");

  const totalReplies = await Thread.countDocuments({
    parent: threadId,
    isDeleted: false,
  });

  res.status(200).json({
    status: "success",
    threadId,
    totalReplies,
    currentPage: page,
    totalPages: Math.ceil(totalReplies / limit),
    replies,
  });
});

export const getThreads = catchAsync(async (req, res, next) => {
  const { username } = req.params;

  if (!username) {
    return res.status(401).json({ status: "fail", message: "Unauthorized" });
  }

  const userId = await User.findOne({ username: username }).select("_id");

  if (!userId) {
    return res.status(404).json({ status: "fail", message: "User not found" });
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const [threads, total] = await Promise.all([
    Thread.find({
      author: userId,
      isDeleted: false,
      threadType: { $in: ["thread", "repost"] },
    })
      .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate({
      path: "originalThread",
      populate: {
        path: "author",
        model: "User",
      },
    })
    .populate("author", "username avatar displayName createdAt")
    .populate({
      path: "likes",
      select: "_id username avatar displayName createdAt",
    })
    .populate({
      path: "replies",
      match: { isDeleted: false },
      select: "_id content likeCount replyCount likes replies author createdAt",
      populate: {
        path: "author",
        select: "_id username avatar displayName createdAt",
      },
    })
    .populate({
      path: "reposts",
      select: "_id username avatar displayName createdAt",
    })
    .lean(),
    Thread.countDocuments({
      author: userId,
      isDeleted: false,
      threadType: { $ne: "reply" },
    }),
  ]);

  res.status(200).json({
    status: "success",
    results: threads.length,
    total,
    currentPage: page,
    totalPages: Math.ceil(total / limit),
    threads,
  });
});

export const getReplies = catchAsync(async (req, res, next) => {
  const { username } = req.params;
  console.log("hello from get replies");
  console.log(username);
  if (!username) {
    return next(new AppError("Unauthorized: user not found.", 401));
  }

  const userId = await User.findOne({ username: username }).select("_id");

  if (!userId) {
    return next(new AppError("User not found.", 404));
  }

  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit) || 10, 1);
  const skip = (page - 1) * limit;

  const replies = await Thread.find({
    author: userId,
    threadType: "reply",
    isDeleted: false,
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate({
      path: "parent",
      select: "_id content  createdAt",
      populate: {
        path: "author",
        model: "User",
        select: "_id username avatar displayName createdAt",
      },
    })
    .populate("author", "username avatar")
    .select(
      "-replies -reposts -repostCount -replyCount  -deletedAt -hiddenBy -isDeleted -media -__v -quoteContent -originalThread"
    );

  const total = await Thread.countDocuments({
    author: userId,
    threadType: "reply",
    isDeleted: false,
  });

  res.status(200).json({
    status: "success",
    results: replies.length,
    total,
    currentPage: page,
    totalPages: Math.ceil(total / limit),
    replies,
  });
});

export const getMyReposts = catchAsync(async (req, res, next) => {
  const { username } = req.params;

  if (!username) {
    return res.status(401).json({ status: "fail", message: "Unauthorized" });
  }

  const userId = await User.findOne({ username: username }).select("_id");

  if (!userId) {
    return res.status(401).json({ status: "fail", message: "Unauthorized" });
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const reposts = await Thread.find({
    threadType: "repost",
    author: userId,
    isDeleted: false,
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate({
      path: "originalThread",
      select:
        "-replies -reposts -repostCount -replyCount -deletedAt -hiddenBy -isDeleted -media -__v -quoteContent -originalThread -parent",
      populate: {
        path: "author",
        model: "User",
        select: "_id username avatar displayName createdAt",
      },
    })
    .populate("author", "username avatar")
    .select(
      "-deletedAt -hiddenBy -isDeleted -parent -media -__v -quoteContent "
    );

  const total = await Thread.countDocuments({
    threadType: "repost",
    author: userId,
    isDeleted: false,
  });

  res.status(200).json({
    status: "success",
    results: reposts.length,
    total,
    currentPage: page,
    totalPages: Math.ceil(total / limit),
    reposts,
  });
});

export const getAllRepliesForUserThreads = async (req, res) => {
  try {
    const { username } = req.query;

    if (!username) {
      return res.status(400).json({ message: "Username is required" });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const threads = await Thread.find({
      author: user._id,
      isDeleted: false,
      threadType: "thread",
    });

    if (!threads.length) {
      return res.status(200).json({ repliesByThread: [] });
    }

    const repliesByThread = await Promise.all(
      threads.map(async (thread) => {
        const replies = await Thread.find({
          threadType: "reply",
          parent: thread._id,
          isDeleted: false,
        })
          .sort({ createdAt: -1 })
          .populate("author", "username avatar");

        return {
          thread: {
            _id: thread._id,
            title: thread.title,
            content: thread.content,
            createdAt: thread.createdAt,
            author: thread.author,
          },
          replies,
        };
      })
    );

    res.status(200).json({ repliesByThread });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
