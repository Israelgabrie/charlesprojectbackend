const express = require("express");
const adminRouter = express.Router();
const {
  User,
  Post,
  Chat,
  Message,
  RecentActivity,
  Report,
} = require("./database");

// Route to get system stats
adminRouter.post("/stats", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID is required." });
    }

    const user = await User.findOne({ _id: userId });

    if (user.role != "admin") {
      return res
        .status(403)
        .json({ success: false, message: "Access denied." });
    }
    const totalUsers = await User.countDocuments();
    const approvedPosts = await Post.countDocuments({ approved: true });
    const pendingPosts = await Post.countDocuments({ approved: false });
    const totalPosts = approvedPosts + pendingPosts;
    const RecentActivities = await RecentActivity.find()
      .sort({ createdAt: -1 })
      .limit(5);
    const totalReports = await Report.countDocuments();

    res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        totalPosts: totalPosts,
        pendingPosts,
        totalReports,
        recentActivities: RecentActivities,
      },
    });
  } catch (error) {
    console.error("Error fetching admin stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch stats.",
    });
  }
});

module.exports = adminRouter;
