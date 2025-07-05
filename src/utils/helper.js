import crypto from 'node:crypto';
import Thread from '../models/Thread.js';

import {
    REFRESH_MAX_AGE_MS,
    HMAC_REFRESH_SALT,
} from '../config/index.js';


const hmacHash = token =>
    crypto
        .createHmac('sha256', HMAC_REFRESH_SALT)
        .update(token)
        .digest('hex');

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'none', 
  maxAge: REFRESH_MAX_AGE_MS,
};

const alreadyReposted = async (userId, originalId) =>
  Thread.findOne({
    author: userId,
    threadType: 'repost',
    originalThread: originalId,
    quoteContent: null,          
  });

  const getNestedReplies = async (threadId, currentUserId) => {
  const replies = await Thread.find({
    parentThread: threadId,
    isVisible: true,
  })
    .sort({ createdAt: 1 })
    .populate("author", "username avatar")
    .lean();

  for (const reply of replies) {
    reply.replies = await getNestedReplies(reply._id, currentUserId);
    reply.isLiked = reply.likes?.includes(currentUserId);
  }

  return replies;
};

export {
    hmacHash,
    cookieOptions,
    alreadyReposted,
    getNestedReplies,
}