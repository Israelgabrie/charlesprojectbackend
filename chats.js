const { User, Post, Chat, Message } = require("./database.js");
const express = require("express");
const chatRouter = express.Router();
const mongoose = require("mongoose");



// Route to get all chats for a user
// Route to get all chats for a user
chatRouter.post("/getChats", async (req, res) => {
  const { userId } = req.body;

  if (!userId) return res.status(400).json({ error: "User ID is required" });

  try {
    // Fetch the current user's info
    const currentUser = await User.findById(userId).select("fullName");
    if (!currentUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const chats = await Chat.find({ participants: userId })
      .populate({
        path: "participants",
        select: "fullName idNumber profileImage", // <-- updated here
      })
      .populate({
        path: "lastMessage",
        select: "content createdAt",
      })
      .sort({ updatedAt: -1 });

    const formattedChats = chats.map(chat => {
      const otherParticipant = chat.participants.find(
        p => p._id.toString() !== userId
      );

      return {
        chatId: chat._id,
        fullName: otherParticipant.fullName,
        profileImage: otherParticipant.profileImage, // <-- added here
        lastMessage: chat.lastMessage?.content || "",
        time: chat.lastMessage?.createdAt || chat.updatedAt,
      };
    });

    res.json({
      success: true,
      chats: formattedChats,
      message: "Chats fetched successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch chats",
      details: error.message,
      message: error.message,
    });
  }
});


chatRouter.post("/getMessages", async (req, res) => {
  const { chatId, userId } = req.body;

  if (!chatId || !userId) {
    return res.status(400).json({ success: false, message: "Chat ID and User ID are required" });
  }

  try {
    // 1. Find the chat
    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({ success: false, message: "Chat not found" });
    }

    // 2. Check if user is a participant
    const isParticipant = chat.participants.some(participantId => participantId.equals(userId));

    if (!isParticipant) {
      return res.status(403).json({ success: false, message: "Access denied: You are not a participant of this chat" });
    }

    // 3. Fetch messages if user is allowed
    const messages = await Message.find({ chat: chatId })
      .populate({
        path: "sender",
        select: "fullName profilePic",
      })
      .sort({ createdAt: 1 }); // oldest first

    const formattedMessages = messages.map(msg => ({
      _id: msg._id,
      content: msg.content,
      sender: {
        _id: msg.sender._id,
        fullName: msg.sender.fullName,
        profilePic: msg.sender.profilePic,
      },
      createdAt: msg.createdAt,
      seenBy: msg.seenBy,
    }));

    res.json({ success: true, messages: formattedMessages, message: "Messages fetched successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


module.exports = chatRouter;
