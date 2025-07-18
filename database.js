const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    canAutoPost: { type: Boolean, default: false },
    isApproved: { type: Boolean, default: false },
    name: String,
    email: { type: String, unique: true, required: true },
    password: String,
    idNumber: { type: String, unique: true },
    role: { type: String, enum: ["student", "admin"], default: "student" },
    bio: String,
    profileImage: String,
    following: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        approved: { type: Boolean, default: false },
      },
    ],
    followers: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        approved: { type: Boolean, default: false },
      },
    ],
    active: { type: Boolean, default: false }, // Is the user currently online?
    lastSeen: { type: Date, default: null }, // When was the user last active?

    savedPosts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Post" }],
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    content: String,
    image: String,
    video: String,

    // 🟢 New fields
    postType: {
      type: String,
      enum: ["normal", "announcement", "event", "news", "update", "general"],
      default: "normal",
    },
    priority: {
      type: String,
      enum: ["low", "normal", "high","urgent"],
      default: "normal",
    },

    approved: { type: Boolean, default: false },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: { type: Date, default: null },
    privacy: String,

    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    comments: [
      {
        commenter: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        name: String,
        text: String,
        time: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

const Post = mongoose.model("Post", postSchema);

const chatSchema = new mongoose.Schema(
  {
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
  },
  { timestamps: true }
);

const Chat = mongoose.model("Chat", chatSchema);

const messageSchema = new mongoose.Schema(
  {
    chat: { type: mongoose.Schema.Types.ObjectId, ref: "Chat" },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    content: String,
    image: String,
    video: String,
    file: String,
  },
  { timestamps: true }
);

const Message = mongoose.model("Message", messageSchema);

const recentActivitySchema = new mongoose.Schema({
  description: { type: String, required: true },
  actionType: {
    type: String,
    enum: [
      "post",
      "comment",
      "like",
      "follow",
      "report",
      "login",
      "changePassword",
      "newPic",
      "delete",
      "signUp",
      "security"
    ],
    required: true,
  },
  createdAt: { type: Date, default: Date.now },
});

const RecentActivity = mongoose.model("recentActivity", recentActivitySchema);

const reportSchema = new mongoose.Schema({
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  viewed: { type: Boolean, default: false },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
});

const Report = mongoose.model("Report", reportSchema);

// async function approveAllUsers(){
//   try {
//     const users = await User.find();
//     for (const user of users) {
//       user.approved = true;
//       console.log( user.approved)
//       await user.save();
//       console.log(`User ${user.fullName} approved successfully.`);
//     }
//     console.log("All unapproved users have been approved.");
//   } catch (error) {
//     console.error("Error approving users:", error);
//   }
// }

// approveAllUsers();

module.exports = {
  User,
  Post,
  Chat,
  Message,
  RecentActivity,
  Report,
};
