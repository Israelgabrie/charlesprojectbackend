// backend/getPendingPosts.js
const { User, Post } = require("./database");

async function getPendingPosts(id, callback) {
  try {
    const adminUser = await User.findById(id);
    if (!adminUser || adminUser.role !== 'admin') {
      return callback({
        success: false,
        message: "Unauthorized: Only admins can view pending posts.",
        posts: [],
      });
    }

    const pendingPosts = await Post.find({ approved: false })
      .populate('author', 'fullName idNumber profilePic')
      .sort({ createdAt: -1 });

    callback({
      success: true,
      message: "Pending posts retrieved successfully.",
      posts: pendingPosts,
    });

  } catch (error) {
    console.error("Error fetching pending posts:", error);
    callback({
      success: false,
      message: "An error occurred while fetching pending posts.",
      posts: [],
    });
  }
}

module.exports = {
  getPendingPosts
};
