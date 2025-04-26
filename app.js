const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const fs = require("fs");
const {
  getPendingPosts,
  getManageUsersStats,
  getFilteredUsers,
  getStudentUsers,
} = require("./adminSocket");

// Routes
const userRoutes = require("./addUsers");
const userRouter = require("./userRoute");
const postRoutes = require("./posts"); // post router
const chatRouter = require("./chats");
const {
  addMessage,
  joinRoom,
  searchUser,
  handleActiveChat,
  handleInactiveChat,
} = require("./chatSockets");

const {
  User,
  Post,
  Chat,
  Message,
  RecentActivity,
  Report,
} = require("./database");

const multer = require("multer");
const adminRouter = require("./adminApi");

// Init express app
const app = express();
const portNumber = 4200;

// CORS setup
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://192.168.137.1:3000",
      "http://192.168.15.54:5173",
      "http://169.254.227.134:5173",
      "http://192.168.43.173:5173",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"], // Add OPTIONS here
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json());

// Route registrations
app.use("/user", userRouter);
app.use("/addUser", userRoutes);
app.use("/chat", chatRouter);
app.use("/admin", adminRouter);
app.use("/post", postRoutes); // Mount post router here

// Serve uploaded media files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Configure multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, "uploads/profilePics");

    // Check if the directory exists, if not, create it
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true }); // recursive ensures parent folders are created if needed
    }

    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, fileName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const fileTypes = /jpeg|jpg|png|gif/;
    const extname = fileTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimeType = fileTypes.test(file.mimetype);
    if (extname && mimeType) {
      return cb(null, true);
    }
    cb(new Error("Only images are allowed"));
  },
});

// Route for profile picture upload
app.post("/addProfilePic", upload.single("image"), async (req, res) => {
  try {
    const { userId } = req.body;
    const filePath = `/uploads/profilePics/${req.file.filename}`;

    const user = await User.findByIdAndUpdate(
      userId,
      { profileImage: filePath },
      { new: true }
    );

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const newActivity = new RecentActivity({
      actionType: "newPic",
      description: `${user.fullName} updated their profile Image`,
    });

    await newActivity.save();
    res.json({
      success: true,
      message: "Profile picture updated",
      profileImage: filePath,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/deleteUser", async (req, res) => {
  let { userId } = req.body;

  try {
    console.log(userId)
    console.log("deleting user(s):", userId);
    if (!userId || (Array.isArray(userId) && userId.length === 0)) {
      return res.status(400).json({ success: false, message: "User ID(s) required" });
    }

    // Normalize to array
    if (!Array.isArray(userId)) {
      userId = [userId];
    }

    for (const id of userId) {
      const user = await User.findById(id);
      if (!user) continue;

      // Delete user's posts
      await Post.deleteMany({ author: id });

      // Remove user's comments
      await Post.updateMany(
        { "comments.commenter": id },
        { $pull: { comments: { commenter: id } } }
      );

      // Delete user's chats and messages
      const chats = await Chat.find({ participants: id });
      for (const chat of chats) {
        await Message.deleteMany({ chat: chat._id });
        await Chat.deleteOne({ _id: chat._id });
      }

      // Remove user from other users' followers/following
      await User.updateMany(
        { "followers.user": id },
        { $pull: { followers: { user: id } } }
      );
      await User.updateMany(
        { "following.user": id },
        { $pull: { following: { user: id } } }
      );

      // Delete recent activities and reports involving user
      await RecentActivity.deleteMany({
        description: { $regex: user.fullName, $options: "i" },
      });
      await Report.deleteMany({ user: id });

      // Log the deletion
      await RecentActivity.create({
        description: `User ${user.fullName} has been deleted.`,
        actionType: "delete",
      });

      // Finally, delete the user
      await User.deleteOne({ _id: id });
    }

    res.status(200).json({ success: true, message: "User(s) and related data deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


async function startServer() {
  try {
    await mongoose.connect("mongodb://localhost:27017/campusConnect");
    console.log("✅ Connected to MongoDB");

    const server = app.listen(portNumber, () => {
      console.log(`🚀 Server running on port ${portNumber}`);
    });

    // Initialize Socket.IO
    const { Server } = require("socket.io");
    const io = new Server(server, {
      cors: {
        origin: [
          "http://localhost:5173",
          "http://192.168.15.54:3000",
          "http://192.168.15.54:5173",
          "http://169.254.227.134:5173",
          "http://192.168.43.173:5173",
        ],
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
        credentials: true,
      },
    });

    io.on("connection", (socket) => {
      console.log("🧩 New socket connected:", socket.id);

      // Client joins a specific chat room
      socket.on("joinRoom", (userId, chatId) => {
        joinRoom(userId, chatId, socket);
      });

      socket.on("joinAdminRoom", () => {
        console.log("socket joined admin room");
        socket.join("admin");
      });

      socket.on("getManageUsersStats", (userId, callback) => {
        getManageUsersStats(io, socket, userId, callback);
      });

      socket.on("getFilteredUsers", (filter, callback) => {
        getFilteredUsers(filter, callback);
      });

      socket.on("setActive", async (userId, callback) => {
        console.log("setting user active", userId);
        io.emit("newUserOnline", userId); // Notifies all users
        handleActiveChat(io, socket, userId, callback);
      });

      socket.on("setInActive", (userId, callback) => {
        console.log("setting user inactive", userId);
        console.log("notifying admins that a user just went ofline");
        io.emit("newUserOffline", userId); // Notifies all users
        handleInactiveChat(io, socket, userId, callback);
      });

      // Handle incoming messages
      socket.on("addMessage", (requestBody, callback) => {
        addMessage(requestBody, callback, io, socket);
      });

      socket.on("getStudentUser", (nameText, callback) => {
        getStudentUsers(io, socket, nameText, callback);
      });

      // Handle fetching random user feed
      socket.on("getPosts", (id, callback) => {
        // Your logic here
      });

      socket.on("searchUser", (userId, searchTerm, callback) => {
        searchUser(userId, searchTerm, callback);
      });

      // Handle fetching pending posts
      socket.on("getPendingPosts", (id, callback) => {
        getPendingPosts(id, callback);
      });
    });
  } catch (error) {
    console.error("❌ Failed to connect to MongoDB", error);
    process.exit(1);
  }
}

startServer();
