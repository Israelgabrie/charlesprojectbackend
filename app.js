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

// Init express app
const app = express();
const portNumber = 4200;

// CORS setup
app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json());

// Route registrations
app.use("/user", userRouter);
app.use("/addUser", userRoutes);
app.use("/post", postRoutes); // Mount post router here

// Serve uploaded media files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// MongoDB connection and server start
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
        origin: "http://localhost:5173",
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    io.on("connection", (socket) => {
      console.log("🧩 New socket connected:", socket.id);

      socket.on("getPosts", (id, callback) => {
        // this socket gets random feeds for USER
      });

      socket.on("getPendingPosts", (id, callback) => {
        // this socket gets all the pending posts for the admin to approve
        getPendingPosts(id, callback);
      });
    });

  } catch (error) {
    console.error("❌ Failed to connect to MongoDB", error);
    process.exit(1);
  }
}

startServer();
