import express from "express";
import {
  createThread,
  deleteThread,
  likeThread,
  getAllThreads,
  getThreads,
  getSingleThread,
  getReplies,
  getMyReposts,
  getThreadReplies,
  getAllRepliesForUserThreads,
} from "../controllers/threadController.js";
import { protect } from "../middlewares/auth.js";
import { uploadThreadMedia } from "../utils/multer.js";

const router = express.Router();
router.use(protect);

router.post("/create", uploadThreadMedia, createThread);
router.delete("/:id/delete", deleteThread);
router.patch("/:id/like", likeThread);
router.get("/:id/one", getSingleThread);
router.get("/:threadId/replies", getThreadReplies);


router.get("/:username/me-threads", getThreads);
router.get("/:username/me-replies", getReplies);
router.get("/:username/me-reposts", getMyReposts);


router.get("/replies/all", getAllRepliesForUserThreads);

router.get("/all", getAllThreads);

export default router;
