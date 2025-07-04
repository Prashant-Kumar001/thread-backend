import jwt from "jsonwebtoken";
import User from "../models/User.js";
import AppError from "../utils/appError.js";
import catchAsync from "../utils/catchAsync.js";
import {
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
  ACCESS_EXPIRES,
  REFRESH_EXPIRES,
  REFRESH_MAX_AGE_MS,
} from "../config/index.js";
import { genToken } from "../utils/features.js";

import { hmacHash, cookieOptions } from "../utils/helper.js";

export const register = catchAsync(async (req, res, next) => {
  const { username, email, password } = req.body || {};

  if (!username || !email || !password)
    return next(new AppError("Username, email and password are required", 400));
  if (password.length < 8)
    return next(new AppError("Password must be at least 8 characters", 400));
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email))
    return next(new AppError("Invalid email format", 400));
  if (await User.findOne({ $or: [{ email }, { username }] }))
    return next(
      new AppError("User with email or username already exists", 409)
    );
  const user = await User.create({ username, email, password });
  const accessToken = genToken(
    { id: user._id, tokenType: "access" },
    JWT_ACCESS_SECRET,
    ACCESS_EXPIRES
  );
  const refreshToken = genToken(
    { id: user._id, tokenType: "refresh" },
    JWT_REFRESH_SECRET,
    REFRESH_EXPIRES
  );
  user.refreshTokens.push({
    token: hmacHash(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_MAX_AGE_MS),
    ip: req.ip,
    userAgent: req.headers["user-agent"] || "unknown",
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  });
  user.lastSeenAt = new Date();
  await user.save();


  res.cookie("refreshToken", refreshToken, cookieOptions);
  res.status(201).json({
    status: "success",
    accessToken,
    user: { id: user._id, username: user.username, email: user.email },
  });
});


export const login = catchAsync(async (req, res, next) => {
  const { email: identifier, password } = req.body || {};
  if (!identifier || !password)
    return next(new AppError("Identifier and password are required", 400));

  const user = await User.findOne({
    $or: [{ email: identifier }, { username: identifier }],
  }).select("+password +refreshTokens");
  if (!user || !(await user.comparePw(password)))
    return next(new AppError("Invalid credentials", 401));


  user.refreshTokens = user.refreshTokens.filter(
    (rt) => rt.expiresAt > Date.now()
  );

  const accessToken = genToken(
    { id: user._id, tokenType: "access" },
    JWT_ACCESS_SECRET,
    ACCESS_EXPIRES
  );
  const refreshToken = genToken(
    { id: user._id, tokenType: "refresh" },
    JWT_REFRESH_SECRET,
    REFRESH_EXPIRES
  );

  user.refreshTokens.push({
    token: hmacHash(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_MAX_AGE_MS),
    ip: req.ip,
    userAgent: req.headers["user-agent"] || "unknown",
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  });
  user.lastSeenAt = new Date();
  await user.save();


  res.cookie("refreshToken", refreshToken, cookieOptions);
  res.json({ accessToken, user: { id: user._id, username: user.username } });
});


export const refresh = catchAsync(async (req, res, next) => {
  const token = req.cookies?.refreshToken;
  if (!token) return next(new AppError("Refresh token required", 400));

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_REFRESH_SECRET);
    if (decoded.tokenType !== "refresh") {
      throw new jwt.JsonWebTokenError("Wrong token type");
    }
  } catch (err) {
    const status = err.name === "TokenExpiredError" ? 400 : 401;
    return next(
      new AppError("Invalid or expired refresh token", status, {
        details: err.message,
        code: "AUTH_TOKEN_INVALID",
      })
    );
  }

  const user = await User.findById(decoded.id).select("+refreshTokens");
  if (!user) return next(new AppError("User not found", 404));

  const hashed = hmacHash(token);
  const stored = user.refreshTokens.find(
    (rt) => rt.token === hashed && rt.expiresAt > Date.now()
  );

  if (!stored) {
    return next(new AppError("Refresh token revoked or expired", 401));
  }

  user.refreshTokens = user.refreshTokens.filter((rt) => rt.token !== hashed);

  const newRefreshToken = genToken(
    { id: user._id, tokenType: "refresh" },
    JWT_REFRESH_SECRET,
    REFRESH_EXPIRES
  );

  user.refreshTokens.push({
    token: hmacHash(newRefreshToken),
    expiresAt: new Date(Date.now() + REFRESH_MAX_AGE_MS),
    ip: req.ip,
    userAgent: req.headers["user-agent"] || "unknown",
    createdAt: new Date(),
    lastUsedAt: new Date(),
  });

  const newAccessToken = genToken(
    { id: user._id, tokenType: "access" },
    JWT_ACCESS_SECRET,
    ACCESS_EXPIRES
  );

  user.lastSeenAt = new Date();
  await user.save();

  res.cookie("refreshToken", newRefreshToken, cookieOptions);
  res.json({
    accessToken: newAccessToken,
    user: {
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      loggedIn: true,
      id: user._id,
    }

  });
});


export const logout = catchAsync(async (req, res, next) => {
  const token = req.cookies?.refreshToken;
  if (!token) return next(new AppError("Refresh token required", 400));

  const decoded = jwt.decode(token);
  if (!decoded?.id) return next(new AppError("Invalid token", 400));

  const user = await User.findById(decoded.id).select("+refreshTokens");
  if (user) {
    user.refreshTokens = user.refreshTokens.filter(
      (rt) => rt.token !== hmacHash(token)
    );
    await user.save();
  }

  res.clearCookie("refreshToken", cookieOptions);
  res.status(204).end();
});


export const logoutAll = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  await User.findByIdAndUpdate(userId, { $set: { refreshTokens: [] } });
  res.clearCookie("refreshToken", cookieOptions);
  res.status(204).end();
});


