const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { User,Post } = require("./database");
 

const userRouter = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

// ✅ GET /getLoggedInUser - Retrieves currently logged-in user using JWT from cookies
userRouter.get("/getLoggedInUser", async (req, res) => {
  try {
    const token = req.cookies.token;
    console.log(req.cookie)

    if (!token) {
      return res.status(401).json({success:false ,  message: "No authentication token found" });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(404).json({success:false,  message: "User not found" });
    }

    res.status(200).json({
      success:true,
      user: {
        createdAt:user.createdAt,
        followers: user.followers,
        following: user.following,
        fullName: user.fullName,
        id: user._id,
        email: user.email,
        role: user.role,
        ...(user.role === "student" && { idNumber: user.idNumber }),
      },
    });
  } catch (err) {
    console.error("Error getting logged in user:", err);
    return res.status(500).json({success:false ,  message: "Invalid or expired token" });
  }
});

// POST /user/login
userRouter.post("/login", async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;

    if (!email || !password) {
      return res.status(400).json({success:false,  message: "Email and password are required." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({success:false,  message: "No account found with this email." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success:false, message: "Incorrect password." });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: rememberMe ? "60d" : "10m" }
    );

  
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: rememberMe ? 60 * 24 * 60 * 60 * 1000 : 10 * 60 * 1000,
    });

    res.status(200).json({
      success:true,
      message: "Login successful",
      user: {
        createdAt:user.createdAt,
        followers: user.followers,
        following: user.following,
        fullName: user.fullName,
        id: user._id,
        email: user.email,
        role: user.role,
        ...(user.role === "student" && { idNumber: user.idNumber }),
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({success:false, message: "Server error" });
  }
});


// POST /user/follow
userRouter.post("/follow", async (req, res) => {
  try {
    const { followerId, targetId } = req.body;

    if (!followerId || !targetId) {
      return res.status(400).json({ success:false ,  message: "Both followerId and targetId are required." });
    }

    if (followerId === targetId) {
      return res.status(400).json({ success:false ,  message: "You cannot follow yourself." });
    }

    const follower = await User.findById(followerId);
    const target = await User.findById(targetId);

    if (!follower || !target) {
      return res.status(404).json({success:false,  message: "User not found." });
    }

    // Check if already following
    const isAlreadyFollowing = follower.following.some(
      (f) => f._id.toString() === targetId
    );
    if (isAlreadyFollowing) {
      return res.status(400).json({success:false,  message: "Already following this user." });
    }

    // Add to each other's following/followers
    follower.following.push({ _id: target._id ,approved:false});
    target.followers.push({ _id: follower._id ,approved:false});

    await follower.save();
    await target.save();

    res.status(200).json({
      success:true,
      message: "Followed successfully.",
      updatedFollower: {
        id: follower._id,
        following: follower.following,
      },
      updatedTarget: {
        id: target._id,
        followers: target.followers,
      },
    });
    
  } catch (error) {
    console.error("Follow error:", error);
    res.status(500).json({ success:false, message: "Server error while following user." });
  }
});


// POST /user/unfollow
userRouter.post("/unfollow", async (req, res) => {
  try {
    const { followerId, targetId } = req.body;

    if (!followerId || !targetId) {
      return res.status(400).json({ success: false, message: "Both followerId and targetId are required." });
    }

    if (followerId === targetId) {
      return res.status(400).json({ success: false, message: "You cannot unfollow yourself." });
    }

    const follower = await User.findById(followerId);
    const target = await User.findById(targetId);

    if (!follower || !target) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const wasFollowing = follower.following.some(f => f._id.toString() === targetId);
    if (!wasFollowing) {
      return res.status(400).json({ success: false, message: "You are not following this user." });
    }

    // Remove from following and followers
    follower.following = follower.following.filter(f => f._id.toString() !== targetId);
    target.followers = target.followers.filter(f => f._id.toString() !== followerId);

    await follower.save();
    await target.save();

    res.status(200).json({
      success: true,
      message: "Unfollowed successfully.",
      updatedFollower: {
        id: follower._id,
        following: follower.following,
      },
      updatedTarget: {
        id: target._id,
        followers: target.followers,
      },
    });
  } catch (error) {
    console.error("Unfollow error:", error);
    res.status(500).json({ success: false, message: "Server error while unfollowing user." });
  }
});


// ✅ Get user statistics
userRouter.post("/stats", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required.",
      });
    }

    const user = await User.findById(userId).populate("following followers");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const postCount = await Post.countDocuments({ author: userId, approved: true });

    res.status(200).json({
      success: true,
      stats: {
        postCount,
        followingCount: user.following.length,
        followerCount: user.followers.length,
      },
    });
  } catch (error) {
    console.error("Error fetching user stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user statistics.",
    });
  }
});


userRouter.post("/discover", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID is required." });
    }

    const currentUser = await User.findById(userId);

    if (!currentUser) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const followingIds = currentUser.following.map((f) => f._id.toString());
    const followerIds = currentUser.followers.map((f) => f._id.toString());

    // 1. People you're following where approved is false
    const unapprovedFollowingIds = currentUser.following
      .filter((f) => f.approved === false)
      .map((f) => f._id);

    const unapprovedFollowing = await User.find({ _id: { $in: unapprovedFollowingIds } })
      .select("fullName idNumber");

    // 2. People you follow but they don't follow you back (non-mutual)
    const nonMutualFollowingIds = followingIds.filter((id) => !followerIds.includes(id));

    const nonMutualFollowing = await User.find({ _id: { $in: nonMutualFollowingIds } })
      .select("fullName idNumber");

    // 3. 10 random users excluding yourself
    const randomUsers = await User.aggregate([
      { $match: { _id: { $ne: currentUser._id } } },
      { $sample: { size: 10 } },
      { $project: { fullName: 1, idNumber: 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        unapprovedFollowing,
        nonMutualFollowing,
        randomUsers,
      },
    });

  } catch (error) {
    console.error("Discover route error:", error);
    res.status(500).json({ success: false, message: "Failed to load discover data." });
  }
});


// ✅ PATCH /user/approveFollow - Approve a pending follow request
userRouter.patch("/approveFollow", async (req, res) => {
  try {
    const { userId, followerId } = req.body;

    if (!userId || !followerId) {
      return res.status(400).json({
        success: false,
        message: "Both userId and followerId are required.",
      });
    }

    const user = await User.findById(userId);
    const follower = await User.findById(followerId);

    if (!user || !follower) {
      return res.status(404).json({
        success: false,
        message: "User or follower not found.",
      });
    }

    // Update approved in target user's followers
    const followerInUser = user.followers.find(f => f._id.toString() === followerId);
    if (followerInUser) {
      followerInUser.approved = true;
    }

    // Update approved in follower's following
    const userInFollower = follower.following.find(f => f._id.toString() === userId);
    if (userInFollower) {
      userInFollower.approved = true;
    }

    await user.save();
    await follower.save();

    res.status(200).json({
      success: true,
      message: "Follow request approved successfully.",
    });
  } catch (error) {
    console.error("Error approving follow request:", error);
    res.status(500).json({
      success: false,
      message: "Server error while approving follow request.",
    });
  }
});




module.exports = userRouter;
