const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const fs = require("fs");
const { getPendingPosts } = require("./adminSocket");

// Routes
const userRoutes = require("./addUsers");
const userRouter = require("./userRoute");
const postRoutes = require("./posts"); // post router
const chatRouter = require("./chats");
const { addMessage, joinRoom, searchUser } = require("./chatSockets");
const { User, RecentActivity } = require("./database");
const multer = require("multer");
const adminRouter = require("./adminApi");

// Init express app
const app = express();
const portNumber = 4200;

// CORS setup
app.use(
  cors({
    origin: ["http://localhost:5173","http://192.168.137.1:3000","http://192.168.15.54:5173"],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json());

// Route registrations
app.use("/user", userRouter);
app.use("/addUser", userRoutes);
app.use("/chat", chatRouter);
app.use("/admin",adminRouter)
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
    const fileName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;
    cb(null, fileName);
  },
});



const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const fileTypes = /jpeg|jpg|png|gif/;
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
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

    const user = await User.findByIdAndUpdate(userId, { profileImage: filePath }, { new: true });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const newActivity = new RecentActivity({
      actionType:"newPic",
      description:`${user.fullName} updated their profile Image`
    })

    await newActivity.save();
    res.json({ success: true, message: "Profile picture updated", profileImage: filePath });
  } catch (err) {
    console.error(err);
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
        origin: ["http://localhost:5173", "http://192.168.15.54:3000","http://192.168.15.54:5173"],
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    io.on("connection", (socket) => {
      console.log("🧩 New socket connected:", socket.id);

      // Client joins a specific chat room
      socket.on("joinRoom", (userId, chatId) => {
        joinRoom(userId, chatId, socket);      
        console.log(`🟢 User joined room: ${chatId}`);
      });

      // Handle incoming messages
      socket.on("addMessage", (requestBody, callback) => {
        addMessage(requestBody, callback, io,socket);
      });

      // Handle fetching random user feed
      socket.on("getPosts", (id, callback) => {
        // Your logic here
      });

      socket.on("searchUser",(userId,searchTerm, callback) => {
        searchUser(userId, searchTerm, callback);        
      })

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