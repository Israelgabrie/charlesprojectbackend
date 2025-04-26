const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { User,Post,Chat, RecentActivity } = require("./database");
 

const userRouter = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

// ✅ GET /getLoggedInUser - Retrieves currently logged-in user using JWT from cookies
userRouter.get("/getLoggedInUser", async (req, res) => {
  try {
    const token = req.cookies.token;

    if (!token) {
      return res.status(401).json({ success: false, message: "No authentication token found" });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.status(200).json({
      success: true,
      user: {
        profileImage:user.profileImage,
        createdAt: user.createdAt,
        followers: user.followers,
        following: user.following,
        fullName: user.fullName,
        id: user._id,
        email: user.email,
        role: user.role,
        savedPosts: user.savedPosts || [],
        ...(user.role === "student" && { idNumber: user.idNumber }),
      },
    });
  } catch (err) {
    console.error("Error getting logged in user:", err);
    return res.status(500).json({ success: false, message: "Invalid or expired token" });
  }
});



// POST /user/login
userRouter.post("/login", async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "No account found with this email." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Incorrect password." });
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
      maxAge: rememberMe ? 60 * 24 * 60 * 60 * 1000 : 10 * 60 * 1000, // 60 days or 10 minutes
    });

     const newActivity = new RecentActivity({
          actionType:"login",
          description:`${user.fullName} Logged In `
        })
    
        await newActivity.save();

    res.status(200).json({
      success: true,
      message: "Login successful",
      user: {
        profileImage:user.profileImage,
        createdAt: user.createdAt,
        followers: user.followers,
        following: user.following,
        fullName: user.fullName,
        id: user._id,
        email: user.email,
        role: user.role,
        savedPosts: user.savedPosts || [],
        ...(user.role === "student" && { idNumber: user.idNumber }),
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});



// POST /user/follow
userRouter.post("/follow", async (req, res) => {
  try {
    const { followerId, targetId } = req.body;

    if (!followerId || !targetId) {
      return res.status(400).json({ success: false, message: "Both followerId and targetId are required." });
    }

    if (followerId === targetId) {
      return res.status(400).json({ success: false, message: "You cannot follow yourself." });
    }

    const follower = await User.findById(followerId);
    const target = await User.findById(targetId);

    if (!follower || !target) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // Check if already following
    const isAlreadyFollowing = follower.following.some(
      (f) => f._id.toString() === targetId
    );
    if (isAlreadyFollowing) {
      return res.status(400).json({ success: false, message: "Already following this user." });
    }

    // Add target to follower's "following"
    follower.following.push({ _id: target._id, approved: false });

    // Check if follower already exists in target's "followers"
    const targetFollowerEntry = target.followers.find(
      (f) => f._id.toString() === followerId
    );

    if (targetFollowerEntry) {
      // If the follower already exists in target's followers list (trying to follow back),
      // update both entries to approved: true (mutual)
      targetFollowerEntry.approved = true;

      // Also find target in follower's following list and mark approved = true
      const followerFollowingEntry = follower.following.find(
        (f) => f._id.toString() === targetId
      );
      if (followerFollowingEntry) {
        followerFollowingEntry.approved = true;
      }

      // Check if target is already following the follower (for their own following/followers symmetry)
      const followerAsFollower = follower.followers.find(
        (f) => f._id.toString() === targetId
      );
      if (followerAsFollower) {
        followerAsFollower.approved = true;
      }

      const targetFollowingEntry = target.following.find(
        (f) => f._id.toString() === followerId
      );
      if (targetFollowingEntry) {
        targetFollowingEntry.approved = true;
      }
    } else {
      // If not mutual yet, just add followerId to target's followers with approved: false
      target.followers.push({ _id: follower._id, approved: false });
    }

    await follower.save();
    await target.save();

    res.status(200).json({
      success: true,
      message: "Followed successfully.",
      updatedFollower: {
        id: follower._id,
        following: follower.following,
        followers: follower.followers,
      },
      updatedTarget: {
        id: target._id,
        followers: target.followers,
        following: target.following,
      },
    });

  } catch (error) {
    console.error("Follow error:", error);
    res.status(500).json({ success: false, message: "Server error while following user." });
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


userRouter.post("/stats", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required.",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Count entries that are subdocuments (regardless of any fields)
    const countEntries = (arr) => Array.isArray(arr) ? arr.length : 0;

    const followingCount = countEntries(user.following);
    const followerCount = countEntries(user.followers);

    const postCount = await Post.countDocuments({
      author: userId,
      approved: true,
    });


    return res.status(200).json({
      success: true,
      stats: { postCount, followingCount, followerCount },
    });
  } catch (err) {
    console.error("Error fetching user stats:", err);
    return res.status(500).json({
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

    // 1. Users you sent follow requests to (approved = false)
    const unapprovedFollowingIds = currentUser.following
      .filter((f) => f.approved === false)
      .map((f) => f._id);

    const unapprovedFollowing = await User.find({ _id: { $in: unapprovedFollowingIds } })
      .select("fullName idNumber profileImage");

    // 2. Users who sent you follow requests (approved = false)
    const unapprovedFollowerIds = currentUser.followers
      .filter((f) => f.approved === false)
      .map((f) => f._id);

    const unapprovedFollowers = await User.find({ _id: { $in: unapprovedFollowerIds } })
      .select("fullName idNumber profileImage");

    // 3. People you follow but who don't follow you back (non-mutual)
    const mutualFollowerIds = currentUser.followers
      .filter((f) => f.approved)
      .map((f) => f._id.toString());

    const nonMutualFollowingIds = currentUser.following
      .filter((f) => !mutualFollowerIds.includes(f._id.toString()))
      .map((f) => f._id);

    const nonMutualFollowing = await User.find({ _id: { $in: nonMutualFollowingIds } })
      .select("fullName idNumber profileImage");

    // 4. 10 random users excluding:
    //    - the current user
    //    - users with role "admin"
    //    - users the current user follows
    //    - users who follow the current user

    const excludeUserIds = [
      currentUser._id,
      ...currentUser.following.map(f => f._id),
      ...currentUser.followers.map(f => f._id)
    ];

    const randomUsers = await User.aggregate([
      {
        $match: {
          _id: { $nin: excludeUserIds },
          role: { $ne: "admin" }
        }
      },
      { $sample: { size: 10 } },
      { $project: { fullName: 1, idNumber: 1, profileImage: 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        unapprovedFollowing,   // people you sent requests to
        unapprovedFollowers,   // people who sent you requests
        nonMutualFollowing,    // people you follow but don't follow back
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

    // ✅ Update approval in `user.followers`
    const followerInUser = user.followers.find(f => f._id.toString() === followerId);
    if (followerInUser) {
      followerInUser.approved = true;
    }

    // ✅ Update approval in `follower.following`
    const userInFollower = follower.following.find(f => f._id.toString() === userId);
    if (userInFollower) {
      userInFollower.approved = true;
    }

    await user.save();
    await follower.save();

    // ✅ Check if both follow each other and are approved
    const isMutuallyFollowingAndApproved = async (userId, targetId) => {
      try {
        const [user, target] = await Promise.all([
          User.findById(userId).lean(),
          User.findById(targetId).lean()
        ]);

        if (!user || !target) return false;

        const userFollowsTarget = user.following.some(f =>
          f._id.toString() === targetId && f.approved
        );

        const targetFollowsUser = target.following.some(f =>
          f._id.toString() === userId && f.approved
        );

        return userFollowsTarget && targetFollowsUser;
      } catch (err) {
        console.error("Error checking mutual follow:", err);
        return false;
      }
    };

    const isMutual = await isMutuallyFollowingAndApproved(userId, followerId);
    console.log("value of isMutual:", isMutual);

    if (isMutual) {
      // ✅ Avoid duplicate chat creation
      const existingChat = await Chat.findOne({
        participants: { $all: [userId, followerId], $size: 2 }
      });

      if (!existingChat) {
        const newChat = new Chat({
          participants: [userId, followerId]
        });

        await newChat.save();
        console.log("New mutual chat created");
      } else {
        console.log("Chat already exists");
      }
    }

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

userRouter.post("/posts", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID is required." });
    }

    const posts = await Post.find({ author: userId })
      .populate("author", "fullName idNumber profileImage")
      .sort({ createdAt: -1 });

    if (!posts.length) {
      return res.status(404).json({ success: false, message: "No posts found." });
    }

    res.status(200).json({
      success: true,
      posts,
    });
  } catch (error) {
    console.error("Error fetching posts:", error);
    res.status(500).json({ success: false, message: "Server error while fetching posts." });
  }
});


userRouter.post("/savedPosts", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID is required." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const savedPosts = await Post.find({
      _id: { $in: user.savedPosts }
    })
      .populate("author", "fullName idNumber profileImage")
      .sort({ createdAt: -1 });

    if (!savedPosts.length) {
      return res.status(404).json({ success: false, message: "No saved posts found." });
    }

    res.status(200).json({
      success: true,
      savedPosts,
    });
  } catch (error) {
    console.error("Error fetching saved posts:", error);
    res.status(500).json({ success: false, message: "Server error while fetching saved posts." });
  }
});



module.exports = userRouter;
