import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const refreshTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date, default: Date.now },
    ip: String,
    userAgent: String,
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },

    displayName: { type: String, maxlength: 50 },
    bio: { type: String, maxlength: 160 },
    avatar: {
      secure_url: { type: String },
      public_id: { type: String },
    },
    website: { type: String },

    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    likesGiven: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    profileLikeVisibility: {
      type: String,
      enum: ["private", "public", "mutual"],
      default: "public",
    },

    refreshTokens: {
      type: [refreshTokenSchema],
      default: [],
    },

    lastSeenAt: { type: Date, default: null },

    role: { type: String, enum: ["user", "admin"], default: "user" },
    isVerified: { type: Boolean, default: false },
    profileViews: { type: Number, default: 0 },
  },
  { timestamps: true }
);

userSchema.index({ "refreshTokens.token": 1 });

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePw = function (candidatePw) {
  return bcrypt.compare(candidatePw, this.password);
};

const User = mongoose.models.User || mongoose.model("User", userSchema);
export default User;
