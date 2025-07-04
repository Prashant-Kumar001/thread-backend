import User from "../models/User.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/appError.js";
import { uploadThreadAvatar } from "../utils/features.js";
import mongoose from "mongoose";
import openai from '../utils/openAi.js'


export const getProfile = catchAsync(async (req, res, next) => {
  const username = req.params.username;

  if (!username) return next(new AppError("Username is required", 400));

  const profile = await User.findOne({ username })
    .lean()
    .select("-refreshTokens");

  if (!profile) return next(new AppError("User not found", 404));

  const isMyProfile = profile._id.toString() === req.user.id.toString();

  let youFollowThem = false;
  let theyFollowYou = false;
  let isMutual = false;
  let mutualFollowersPreview = [];
  let mutualFollowersCount = 0;

  if (!isMyProfile) {
    const currentUser = await User.findById(req.user.id).select("following followers");

    const userFollowers = (profile.followers ?? []).map((id) => id.toString());
    const userFollowing = (profile.following ?? []).map((id) => id.toString());

    const currentUserFollowing = (currentUser.following ?? []).map((id) => id.toString());
    const currentUserFollowers = (currentUser.followers ?? []).map((id) => id.toString());

    youFollowThem = currentUserFollowing.includes(profile._id.toString());
    theyFollowYou = userFollowers.includes(currentUser._id.toString());
    isMutual = youFollowThem && theyFollowYou;

    const mutualFollowerIds = userFollowers.filter((id) =>
      currentUserFollowing.includes(id)
    );

    mutualFollowersCount = mutualFollowerIds.length;

    if (mutualFollowersCount > 0) {
      mutualFollowersPreview = await User.find({ _id: { $in: mutualFollowerIds } })
        .limit(2)
        .select("username displayName avatar")
        .lean();
    }
  }

  return res.json({
    user: profile,
    status: "success",
    activity: isMyProfile ? "myProfile" : "otherProfile",
    youFollowThem,
    theyFollowYou,
    isMutual,
    mutualFollowersPreview,
    mutualFollowersCount,
  });
});

export const updateProfile = catchAsync(async (req, res, next) => {
  const { displayName, bio, website } = req.body ?? {};
  const avatarFile = req.file;

  if (
    (displayName === undefined || displayName === "") &&
    (bio === undefined || bio.trim() === "") &&
    (website === undefined || website.trim() === "") &&
    !avatarFile
  ) {
    return next(new AppError("Nothing to update", 400));
  }

  const user = await User.findById(req.user.id);
  if (!user) return next(new AppError("User not found", 404));

  if (displayName !== undefined) {
    if (displayName.trim().length < 3)
      return next(
        new AppError("Display name must be at least 3 characters", 400)
      );
    user.displayName = displayName.trim();
  }

  if (bio !== undefined) {
    if (bio.length > 200)
      return next(new AppError("Bio can’t exceed 200 characters", 400));
    user.bio = bio;
  }

  if (website !== undefined) {
    const urlPattern = /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i;
    if (website && !urlPattern.test(website))
      return next(new AppError("Invalid website URL", 400));
    user.website = website;
  }

  if (avatarFile) {
    const { secure_url, public_id } = await uploadThreadAvatar(avatarFile.path);
    user.avatar = { secure_url, public_id };
  }

  user.isVerified = true;
  await user.save();

  res.json({
    message: "Profile updated successfully",
    status: "success",
  });
});

export const toggleFollow = catchAsync(async (req, res, next) => {
  if (!req.params.username)
    return next(new AppError("Username is required", 400));

  const user = await User.findById(req.user.id);
  if (!user) return next(new AppError("User not found", 404));

  const targetUser = await User.findOne({ username: req.params.username });
  if (!targetUser) return next(new AppError("Target user not found", 404));

  if (user._id.equals(targetUser._id)) {
    return next(new AppError("Cannot follow yourself", 400));
  }

  const isFollowing = user.following.includes(targetUser._id);

  if (isFollowing) {
    user.following = user.following.filter((id) => !id.equals(targetUser._id));
    targetUser.followers = targetUser.followers.filter(
      (id) => !id.equals(user._id)
    );
  } else {
    user.following.push(targetUser._id);
    targetUser.followers.push(user._id);
  }

  await Promise.all([user.save(), targetUser.save()]);

  res.json({
    status: "success",
    message: isFollowing ? "Unfollowed successfully" : "Followed successfully",
  });
});

export const searchProfiles = catchAsync(async (req, res, next) => {
  const { query } = req.query;
  const rawUserId = req.user?.id;

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return res.status(400).json({
      status: "error",
      message: "Please provide a valid non-empty search query",
    });
  }

  const userId = rawUserId?.toString();

  const profiles = await User.find({
    $or: [
      { username: { $regex: query.trim(), $options: "i" } },
      { name: { $regex: query.trim(), $options: "i" } },
    ],
    ...(userId && { _id: { $ne: userId } }),
  })
    .select("avatar username displayName followers following")
    .populate("followers", "username")
    .populate("following", "username")
    .limit(10);

  const enhancedProfiles = profiles.map((profile) => ({
    ...profile.toObject(),
    totalFollowers: profile.followers.length,
    totalFollowing: profile.following.length,
    isFollowed: userId
      ? profile.followers.some((follower) => follower._id.toString() === userId)
      : false,
  }));

  res.json({
    status: "success",
    results: enhancedProfiles.length,
    profiles: enhancedProfiles,
  });
});

export const getFollows = catchAsync(async (req, res, next) => {
  const { username, type } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const viewerId = req.user.id;

  if (!["followers", "following"].includes(type)) {
    return next(
      new AppError(
        "Invalid follow type. Must be 'followers' or 'following'.",
        400
      )
    );
  }

  const user = await User.findOne({ username });
  if (!user) return next(new AppError("User not found", 404));

  const followIds = user[type];

  const followUsers = await User.find({ _id: { $in: followIds } }).select(
    "username avatar displayName likedBy likesGiven"
  );

  const transformed = followUsers.map((followUser) => ({
    _id: followUser._id,
    username: followUser.username,
    displayName: followUser.displayName,
    avatar: followUser.avatar,
    likedByMe: followUser.likedBy.includes(viewerId),
    likedMe: followUser.likesGiven.includes(user?._id),
  }));

  res.json({
    status: "success",
    results: transformed.length,
    [type]: transformed,
  });
});

export const likeProfile = catchAsync(async (req, res, next) => {
  const targetUsername = req.params.username;
  const viewerId = req.user.id;

  if (!mongoose.Types.ObjectId.isValid(viewerId)) {
    return next(new AppError("Invalid user ID", 400));
  }

  const targetUser = await User.findOne({ username: targetUsername });
  const viewerUser = await User.findById(viewerId);

  if (!targetUser || !viewerUser) {
    return next(new AppError("User not found", 404));
  }

  const hasLiked = targetUser.likedBy.includes(viewerId);

  if (hasLiked) {
    targetUser.likedBy.pull(viewerId);
    viewerUser.likesGiven.pull(targetUser._id);
  } else {
    targetUser.likedBy.push(viewerId);
    viewerUser.likesGiven.push(targetUser._id);
  }

  await targetUser.save();
  await viewerUser.save();

  res.status(200).json({
    status: "success",
    liked: !hasLiked,
    totalLikes: targetUser.likedBy.length,
  });
});

export const generateBio = catchAsync(async (req, res, next) => {
  const userId = req.user.id;

  if (!userId) return next(new AppError("login required", 400));

  const user = await User.findById(userId);
  if (!user) return next(new AppError("User not found", 404));

  const prompt = `
    Generate a short, creative user bio using the following details:

    Name: ${user.displayName || user.username}
    Interests: ${user.interests?.join(", ") || "Not specified"}
    Website: ${user.website || "Not specified"}

    Keep it friendly and under 200 characters.
    `;

  const aiResponse = await openai.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "gpt-3.5-turbo",
  });


  const bio = aiResponse.choices[0].message.content.trim();

  res.status(200).json({ status: "success", userID: userId, bio: bio });
});
