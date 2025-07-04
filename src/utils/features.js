import cloudinary from "../config/cloudinary.js";
import fs from "fs";
import jwt from "jsonwebtoken";
import AppError from "./appError.js";


const uploadThreadAvatar = async (filePath) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: "thread/avatars",
      resource_type: "image",
    });
    if (result) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    return {
      public_id: result.public_id,
      secure_url: result.secure_url,
    };
  } catch (error) {
    console.error("Error uploading image:", error);
    if (filePath) {
      fs.unlinkSync(filePath);
    }
    throw new AppError("Failed to upload avatar image.", 500, {
      details: error.message,
      code: "UPLOAD_ERROR",
    });
  }
};

const uploadThreadMedia = async (files) => {
  try {
    const uploadPromises = files.map((file) => {
      return cloudinary.uploader.upload(file.path, {
        folder: "thread/media",
        resource_type: "image",
      });
    });

    const results = await Promise.all(uploadPromises);

    if (files.length > 0) {
      files.forEach((file) => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }

    return results.map((result) => ({
      public_id: result.public_id,
      secure_url: result.secure_url,
    }));
  } catch (error) {
    console.error("Error uploading image:", error);
    files.forEach((file) => {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    });
    throw new AppError("Failed to upload media files.", 500, {
      details: error.message,
      code: "UPLOAD_ERROR",
    });
  }
};

const deleteFileFromCloudinary = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error("Error deleting image from Cloudinary:", error);
    throw error;
  }
};

const genToken = (payload, secret, expiresIn) =>
  jwt.sign(payload, secret, { expiresIn });

const Response = (res, statusCode, message, data) => {
  res.status(statusCode).json({
    status: "success",
    message,
    data,
  });
};

export {
  uploadThreadAvatar,
  uploadThreadMedia,
  deleteFileFromCloudinary,
  genToken,
  Response,
};
