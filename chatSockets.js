const { Message, Chat, User } = require("./database");

function getRoomName(id1, id2) {
  return [id1.toString(), id2.toString()].sort().join("_");
}

async function joinRoom(userId, chatId, socket) {
  try {
    const chat = await Chat.findById(chatId);
    if (!chat) {
      console.error("Chat not found for joining room");
      return;
    }

    // Determine the other user in the chat
    const otherUserId = chat.participants.find(
      (id) => id.toString() !== userId.toString()
    );
    if (!otherUserId) {
      console.error("Other user not found in chat participants");
      return;
    }

    const roomName = getRoomName(userId, otherUserId);
    socket.join(roomName);
    console.log(`🟢 User ${userId} joined room: ${roomName}`);
  } catch (err) {
    console.error("Error joining room:", err.message);
  }
}

async function addMessage(requestBody, callback, io, socket) {
  try {
    const { type, value, userId, chatId } = requestBody;

    if (!type || !value || !userId || !chatId) {
      return callback({
        success: false,
        message: "Missing required fields: type, value, userId, or chatId",
      });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return callback({ success: false, message: "Chat not found" });
    }

    const receiverId = chat.participants.find(
      (id) => id.toString() !== userId.toString()
    );
    if (!receiverId) {
      return callback({ success: false, message: "Receiver not found" });
    }

    const roomName = getRoomName(userId, receiverId);

    const newMessage = new Message({
      chat: chatId,
      sender: userId,
    });

    if (type === "text") newMessage.content = value;
    else if (type === "image") newMessage.image = value;
    else if (type === "video") newMessage.video = value;
    else if (type === "file") newMessage.file = value;
    else {
      return callback({ success: false, message: "Invalid message type" });
    }

    await newMessage.save();
    await Chat.findByIdAndUpdate(chatId, { lastMessage: newMessage._id });

    const populatedMessage = await Message.findById(newMessage._id).populate(
      "sender",
      "_id fullName"
    );

    socket.join(roomName); // optional if not already joined
    io.to(roomName).emit("newMessage", {
      senderId: userId,
      receiverId,
      chatId,
      type,
      value,
      messageData: populatedMessage,
    });

    callback({
      success: true,
      message: "Message added successfully",
      data: populatedMessage,
    });
  } catch (error) {
    callback({ success: false, message: error.message });
  }
}


async function searchUser(currentUserId, searchTerm, callback) {
  try {
    const regex = new RegExp(searchTerm, "i");

    const currentUser = await User.findById(currentUserId).select("following");

    const followingIds = (currentUser?.following || []).map(f => f._id.toString());

    const users = await User.find({
      _id: {
        $ne: currentUserId,
        $nin: followingIds, // only exclude people the current user is following
      },
      role: { $ne: "admin" },
      fullName: regex,
    }).select("_id fullName idNumber email role profileImage");

    callback({ success: true, users });
  } catch (error) {
    callback({ success: false, message: error.message });
  }
}

module.exports = { addMessage, joinRoom ,searchUser};
