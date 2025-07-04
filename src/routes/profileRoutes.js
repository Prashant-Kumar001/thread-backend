import express from "express";
import { protect } from "../middlewares/auth.js";
import {
  getProfile,
  updateProfile,
  toggleFollow,
  searchProfiles,
  getFollows,
  // generateBio,
} from "../controllers/profileController.js";
import {
  likeProfile,
} from "../controllers/profileController.js"; 
import { uploadAvatar } from "../utils/multer.js";

const router = express.Router();

router.use(protect);

router.get("/me/:username", getProfile);
router.put("/", uploadAvatar, updateProfile);

router.patch("/follow/:username", toggleFollow);

router.get("/:username/:type/users", getFollows);

router.get("/search", searchProfiles);

router.post("/like/:username", likeProfile);

// router.post("/generate-bio", generateBio);


export default router;
