// posts.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { Post, User } = require("./database");

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
    "image/jpeg",
    "image/png",
    "image/gif",
    "video/mp4",
    "video/mpeg",
    "video/quicktime",
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

// ✅ POST /post/request — Create new post
router.post("/requestPost", upload.single("media"), async (req, res) => {
  try {
    console.log("some came")
    const { author, content, privacy } = req.body;
    const mediaPath = req.file ? `/uploads/${req.file.filename}` : null;

    const newPost = new Post({
      author,
      content,
      image: mediaPath,
      privacy,
    });

    await newPost.save();
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
    const remainingPendingPosts = await Post.find({ approved: false }).populate("author");

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
    const  userId  = req.body.id;

    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID is required." });
    }

    const user = await User.findById(userId).populate("following");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const followingIds = user.following.map((f) => f._id);

    // Fetch different types of posts (followed, top-liked, recent)
    const followedPosts = await Post.find({
      author: { $in: followingIds, $ne: userId },
      approved: true,
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("author");

    const topLikedPosts = await Post.find({
      approved: true,
      author: { $ne: userId },
    })
      .sort({ likes: -1 })
      .limit(10)
      .populate("author");

    const recentPosts = await Post.find({
      approved: true,
      author: { $ne: userId },
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("author");

    // Combine all posts
    const allPosts = [...followedPosts, ...topLikedPosts, ...recentPosts];

    // Remove duplicates by post ID
    const uniquePostsMap = new Map();
    allPosts.forEach((post) => {
      uniquePostsMap.set(post._id.toString(), post);
    });

    const uniquePosts = Array.from(uniquePostsMap.values());

    // Shuffle randomly
    const shuffledFeed = uniquePosts.sort(() => 0.5 - Math.random());

    res.status(200).json({
      success: true,
      feed: shuffledFeed,
    });
  } catch (error) {
    console.error("Error fetching user feed:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while fetching the feed.",
    });
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
      .populate("comments.commenter", "fullName profilePic")
      .lean();

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found.",
        comments: [],
      });
    }

    // Ensure comment structure is consistent and sorted (latest first)
    const comments = (post.comments || [])
      .map((c) => ({
        user: c.commenter,
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
      .populate("comments.commenter", "fullName profilePic")
      .lean();

    const updatedComments = (updatedPost.comments || [])
      .map((c) => ({
        user: c.commenter,
        comment: c.text,
        createdAt: c.time,
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

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





module.exports = router;
