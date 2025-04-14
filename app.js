const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const userRoutes = require("./addUsers"); // ✅ correct
const userRouter = require("./userRoute");
const app = express();
const portNumber = 4200;


// CORS setup
app.use(cors({
  origin: "http://localhost:5173",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  credentials: true
}));

app.use(express.json());
app.use("/user", userRouter); // 👈 this makes /user/login work
app.use("/addUser", userRoutes);

// Connect to MongoDB and then start the server
async function startServer() {
  try {
    await mongoose.connect('mongodb://localhost:27017/campusConnect');
    console.log("✅ Connected to MongoDB");

    app.listen(portNumber, () => {
      console.log(`🚀 Server running on port ${portNumber}`);
    });
  } catch (error) {
    console.error("❌ Failed to connect to MongoDB", error);
    process.exit(1);
  }
}

startServer();
