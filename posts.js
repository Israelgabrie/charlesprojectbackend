// posts.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { Post, User, RecentActivity } = require("./database");
const router = express.Router();

// Multer config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    // ✅ Common Image Types
    "image/jpeg", // .jpeg, .jpg
    "image/png", // .png
    "image/gif", // .gif
    "image/webp", // .webp
    "image/avif", // .avif
    "image/apng", // .apng
    "image/svg+xml", // .svg
    "image/bmp", // .bmp
    "image/x-icon", // .ico
    "image/tiff", // .tiff, .tif
    "image/heif", // .heif
    "image/heic", // .heic

    // ✅ Common Video Types
    "video/mp4", // .mp4
    "video/webm", // .webm
    "video/ogg", // .ogv
    "video/quicktime", // .mov
    "video/x-msvideo", // .avi
    "video/x-matroska", // .mkv
    "video/mpeg", // .mpeg
    "video/3gpp", // .3gp
    "video/3gpp2", // .3g2
    "video/x-flv", // .flv
    "video/x-ms-wmv", // .wmv

    // ✅ Less common, still supported formats
    "image/x-png", // legacy PNG
    "image/x-bmp", // alternate BMP
    "image/vnd.microsoft.icon", // alternate ICO
    "image/emf", // Enhanced Metafile (Windows)
    "image/wmf", // Windows Metafile

    // ✅ Optional exotic video formats (some require fallbacks)
    "video/x-ms-asf", // .asf
    "video/x-ms-vob", // .vob
    "video/x-dv", // .dv

    // ✅ For robust support
    "application/octet-stream", // generic fallback (⚠️ use cautiously)
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only image and video files are allowed"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});
router.post("/requestPost", upload.single("media"), async (req, res) => {
  try {
    const { author, content, privacy, postType, priority } = req.body;
    const mediaPath = req.file ? `/uploads/${req.file.filename}` : null;

    const mimetype = req.file?.mimetype;
    const isVideo = mimetype?.startsWith("video");

    const user = await User.findById(author);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Author not found" });
    }

    const isAdmin = user.role === "admin";
    const autoApprove = isAdmin || user.canAutoPost;

    const newPost = new Post({
      author,
      content,
      image: isVideo ? null : mediaPath,
      video: isVideo ? mediaPath : null,
      privacy,
      postType: postType || "normal", // 🆕 Optional, default to "normal"
      priority: priority || "normal", // 🆕 Optional, default to "normal"
      approved: autoApprove,
      approvedBy: autoApprove ? user._id : null,
      approvedAt: autoApprove ? new Date() : null,
    });

    await newPost.save();

    const newActivity = new RecentActivity({
      actionType: "post",
      description: autoApprove
        ? `${user.fullName} created an auto-approved post`
        : `New post requested by ${user.fullName}`,
    });

    await newActivity.save();

    res.status(200).json({ success: true, post: newPost });
  } catch (error) {
    console.error("Post upload failed:", error);
    res.status(500).json({ success: false, error: "Failed to create post" });
  }
});

// ✅ POST /post/pending — Get all pending posts (admin only)
router.post("/pending", async (req, res) => {
  try {
    const adminId = req.body.id;

    const adminUser = await User.findById(adminId);
    if (!adminUser || adminUser.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Only admins can view pending posts.",
        posts: [],
      });
    }

    const pendingPosts = await Post.find({ approved: false })
      .populate("author", "fullName idNumber profilePic")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: "Pending posts retrieved successfully.",
      posts: pendingPosts,
    });
  } catch (error) {
    console.error("Error fetching pending posts:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while fetching pending posts.",
      posts: [],
    });
  }
});

// ✅ POST /post/approvePost — Approve a pending post (admin only)
router.post("/approvePost", async (req, res) => {
  try {
    const { adminId, postId } = req.body;

    const adminUser = await User.findById(adminId);
    if (!adminUser || adminUser.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Only admins can approve posts.",
        remainingPendingPosts: [],
      });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found.",
        remainingPendingPosts: [],
      });
    }

    if (post.approved) {
      return res.status(400).json({
        success: false,
        message: "Post is already approved.",
        remainingPendingPosts: [],
      });
    }

    // Approve the post
    post.approved = true;
    await post.save();

    const newActivity = new RecentActivity({
      actionType: "post",
      description: `${adminUser.fullName} approved a post`,
    });

    await newActivity.save();

    // Fetch remaining pending posts
    const remainingPendingPosts = await Post.find({ approved: false })
      .populate("author", "fullName idNumber profilePic")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: "Post approved successfully.",
      post,
      remainingPendingPosts,
    });
  } catch (error) {
    console.error("Error approving post:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while approving the post.",
      remainingPendingPosts: [],
    });
  }
});

// ✅ DELETE /post/deletePost — Delete a pending post (admin only)
router.delete("/deletePost", async (req, res) => {
  try {
    const { adminId, postId } = req.body;

    const adminUser = await User.findById(adminId);
    if (!adminUser || adminUser.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Only admins can delete posts.",
      });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found.",
      });
    }

    if (post.approved) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete an already approved post.",
      });
    }

    await Post.findByIdAndDelete(postId);

    // Get remaining pending posts after deletion
    const remainingPendingPosts = await Post.find({ approved: false }).populate(
      "author"
    );

    const newActivity = new RecentActivity({
      actionType: "post",
      description: `${adminUser.fullName} deleted apost `,
    });

    await newActivity.save();

    res.status(200).json({
      success: true,
      message: "Post deleted successfully.",
      remainingPendingPosts,
    });
  } catch (error) {
    console.error("Error deleting post:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while deleting the post.",
    });
  }
});

router.post("/userFeed", async (req, res) => {
  try {
    const userId = req.body.id;
    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID is required." });
    }

    const user = await User.findById(userId).populate("following.user").lean();
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const followingIds = user.following.map((f) => f.user?._id || f._id);
    const authorPopulate = {
      path: "author",
      select: "fullName email idNumber role profileImage",
    };

    const now = new Date();
    const oneDayAgo = new Date(now.setDate(now.getDate() - 1));

    const priorityAdminPosts = await Post.find({
      approved: true,
      postType: "announcement",
      priority: "urgent",
      createdAt: { $gte: oneDayAgo },
    })
      .populate(authorPopulate)
      .lean();

    const followedPosts = await Post.find({
      author: { $in: followingIds, $ne: userId },
      approved: true,
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate(authorPopulate)
      .lean();

    const topLikedPosts = await Post.find({
      approved: true,
      author: { $ne: userId },
    })
      .sort({ likes: -1 })
      .limit(10)
      .populate(authorPopulate)
      .lean();

    const recentPosts = await Post.find({
      approved: true,
      author: { $ne: userId },
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate(authorPopulate)
      .lean();

    const allPosts = [
      ...priorityAdminPosts,
      ...followedPosts,
      ...topLikedPosts,
      ...recentPosts,
    ];

    const uniquePostsMap = new Map();
    allPosts.forEach((post) => uniquePostsMap.set(post._id.toString(), post));
    let uniquePosts = Array.from(uniquePostsMap.values());

    // 🧠 Only count comments, don’t include full list
    uniquePosts = uniquePosts.map((post) => ({
      ...post,
      commentCount: post.comments?.length || 0,
      comments: undefined,
    }));

    const shuffledFeed = uniquePosts
      .sort(() => 0.5 - Math.random())
      .slice(0, 20);

    res.status(200).json({
      success: true,
      feed: shuffledFeed,
      savedPosts: user.savedPosts || [],
    });
  } catch (error) {
    console.error("Error fetching user feed:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while fetching the feed.",
    });
  }
});

router.post("/moreFeed", async (req, res) => {
  try {
    const { id: userId, before } = req.body;
    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID is required." });
    }

    const user = await User.findById(userId).populate("following.user").lean();
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const authorPopulate = {
      path: "author",
      select: "fullName email idNumber role profileImage",
    };

    const query = {
      approved: true,
      ...(before && { createdAt: { $lt: new Date(before) } }),
    };

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(20)
      .populate(authorPopulate)
      .lean();

    const trimmedPosts = posts.map((post) => ({
      ...post,
      commentCount: post.comments?.length || 0,
      comments: undefined,
    }));

    res.status(200).json({
      success: true,
      morePosts: trimmedPosts,
    });
  } catch (error) {
    console.error("Error fetching more posts:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to load more posts." });
  }
});

// ✅ POST /post/getComments — Get all comments for a post
router.post("/getComments", async (req, res) => {
  try {
    const { postId } = req.body;

    if (!postId) {
      return res.status(400).json({
        success: false,
        message: "postId is required.",
      });
    }

    const post = await Post.findById(postId)
      .populate("comments.commenter", "fullName profileImage")
      .lean();

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found.",
        comments: [],
      });
    }

    // Map and sort comments by most recent
    const comments = (post.comments || [])
      .map((c) => ({
        userId: c.commenter?._id || null,
        fullName: c.commenter?.fullName || "Unknown",
        profileImage: c.commenter?.profileImage || null,
        comment: c.text,
        createdAt: c.time,
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.status(200).json({
      success: true,
      comments,
    });
  } catch (error) {
    console.error("Error fetching comments:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while retrieving comments.",
      comments: [],
    });
  }
});

/// ✅ POST /post/addComment — Add a comment to a post
router.post("/addComment", async (req, res) => {
  try {
    const { postId, commenter, text } = req.body;

    if (!postId || !commenter || !text) {
      return res.status(400).json({
        success: false,
        message: "postId, commenter, and text are required.",
      });
    }

    const user = await User.findById(commenter);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Commenter not found.",
      });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found.",
      });
    }

    // Add new comment
    const comment = {
      commenter: user._id,
      name: user.fullName,
      text,
      time: new Date(),
    };

    post.comments.push(comment);
    await post.save();

    // Fetch updated comments with populated commenter info
    const updatedPost = await Post.findById(postId)
      .populate("comments.commenter", "fullName profileImage")
      .lean();

    const updatedComments = (updatedPost.comments || [])
      .map((c) => ({
        userId: c.commenter?._id || null,
        fullName: c.commenter?.fullName || "Unknown",
        profileImage: c.commenter?.profileImage || null,
        comment: c.text,
        createdAt: c.time,
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Log activity
    const newActivity = new RecentActivity({
      actionType: "comment",
      description: `${user.fullName} made a comment`,
    });

    await newActivity.save();

    res.status(200).json({
      success: true,
      message: "Comment added successfully.",
      comments: updatedComments,
    });
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while adding the comment.",
    });
  }
});

// ✅ POST /post/like — Like or unlike a post
router.post("/like", async (req, res) => {
  try {
    const { postId, userId } = req.body;

    if (!postId || !userId) {
      return res.status(400).json({
        success: false,
        message: "postId and userId are required.",
      });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found.",
      });
    }

    const alreadyLiked = post.likes.includes(userId);

    if (alreadyLiked) {
      // Unlike
      post.likes = post.likes.filter((id) => id.toString() !== userId);
    } else {
      // Like
      post.likes.push(userId);
    }

    await post.save();

    const likedByUser = post.likes.includes(userId); // updated like status

    res.status(200).json({
      success: true,
      message: likedByUser ? "Post liked" : "Post unliked",
      likesCount: post.likes.length,
      likedByUser, // 🔥 Useful for frontend
    });
  } catch (error) {
    console.error("Error liking/unliking post:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while processing the like.",
    });
  }
});

// ✅ POST /post/save — Save or unsave a post
router.post("/save", async (req, res) => {
  try {
    const { userId, postId } = req.body;

    if (!userId || !postId) {
      return res.status(400).json({
        success: false,
        message: "userId and postId are required.",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const alreadySaved = user.savedPosts.includes(postId);

    if (alreadySaved) {
      // Unsave post
      user.savedPosts = user.savedPosts.filter(
        (id) => id.toString() !== postId
      );
    } else {
      // Save post
      user.savedPosts.push(postId);
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: alreadySaved ? "Post unsaved" : "Post saved",
      savedPosts: user.savedPosts,
    });
  } catch (error) {
    console.error("Error saving/unsaving post:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while saving the post.",
    });
  }
});

module.exports = router;
