const { Message, Chat, User } = require("./database");

function getRoomName(id1, id2) {
  return [id1.toString(), id2.toString()].sort().join("_");
}

async function joinRoom(userId, chatId, socket) {
  try {
    const chat = await Chat.findById(chatId);
    if (!chat) return;

    const otherUserId = chat.participants.find(
      (id) => id.toString() !== userId.toString()
    );
    if (!otherUserId) return;

    const roomName = getRoomName(userId, otherUserId);
    socket.join(roomName);
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
        message: "Missing required fields",
      });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) return callback({ success: false, message: "Chat not found" });

    const receiverId = chat.participants.find(
      (id) => id.toString() !== userId.toString()
    );
    if (!receiverId)
      return callback({ success: false, message: "Receiver not found" });

    const roomName = getRoomName(userId, receiverId);
    const newMessage = new Message({ chat: chatId, sender: userId });

    if (type === "text") newMessage.content = value;
    else if (type === "image") newMessage.image = value;
    else if (type === "video") newMessage.video = value;
    else if (type === "file") newMessage.file = value;
    else return callback({ success: false, message: "Invalid message type" });

    await newMessage.save();
    await Chat.findByIdAndUpdate(chatId, { lastMessage: newMessage._id });

    const populatedMessage = await Message.findById(newMessage._id).populate(
      "sender",
      "_id fullName"
    );

    socket.join(roomName);
    io.to(roomName).emit("newMessage", {
      senderId: userId,
      receiverId,
      chatId,
      type,
      value,
      messageData: populatedMessage,
    });

    callback({ success: true, data: populatedMessage });
  } catch (error) {
    callback({ success: false, message: error.message });
  }
}

async function searchUser(currentUserId, searchTerm, callback) {
  try {
    const regex = new RegExp(searchTerm, "i");

    const currentUser = await User.findById(currentUserId).select("following");
    const followingIds = (currentUser?.following || []).map((f) =>
      f.user?.toString()
    );

    const users = await User.find({
      _id: {
        $ne: currentUserId,
        $nin: followingIds,
      },
      role: { $ne: "admin" },
      fullName: regex,
    }).select("_id fullName idNumber email role profileImage");

    callback({ success: true, users });
  } catch (error) {
    callback({ success: false, message: error.message });
  }
}

async function handleActiveChat(io, socket, userId, callback) {
  try {
    console.log("setting user as active");
    await User.findByIdAndUpdate(userId, { active: true, lastSeen: null });

    const chats = await Chat.find({ participants: userId });

    const activeFriends = [];

    for (const chat of chats) {
      const otherUserId = chat.participants.find(
        (id) => id.toString() !== userId.toString()
      );
      if (!otherUserId) continue;

      const friend = await User.findById(otherUserId).select(
        "_id fullName profileImage active"
      );
      if (!friend || !friend.active) continue;

      const roomName = getRoomName(userId, otherUserId);
      socket.join(roomName);

      const socketsInRoom = await io.in("admin").fetchSockets();
    
      socket.to(roomName).emit("userActive", {
        userId,
        chatId: chat._id, // ✅ now sending chatId
      });

      activeFriends.push({
        _id: friend._id,
        fullName: friend.fullName,
        profileImage: friend.profileImage,
        chatId: chat._id,
      });
    }

    callback({
      success: true,
      message: "Marked active and joined chat rooms",
      activeFriends,
    });

    const activeStudents = await User.find({
      active: true,
      role: "student",
    }).select("_id fullName idNumber email profileImage");

    console.log("printing aout all room sockets")
  } catch (error) {
    console.error("handleActiveChat error:", error.message);
    callback({ success: false, message: error.message });
  }
}

async function handleInactiveChat(io, socket, userId, callback) {
  try {
    const user = await User.findByIdAndUpdate(userId, {
      active: false,
      lastSeen: new Date(),
    });

    const chats = await Chat.find({ participants: userId });

    for (const chat of chats) {
      const otherUserId = chat.participants.find(
        (id) => id.toString() !== userId.toString()
      );
      if (!otherUserId) continue;

      const roomName = getRoomName(userId, otherUserId);
      socket.to(roomName).emit("userInactive", {
        userId,
        chatId: chat._id, // ✅ now sending chatId
        lastSeen: user.lastSeen,
      });
    }

    const activeStudents = await User.find({
      active: true,
      role: "student",
    }).select("_id fullName idNumber email profileImage");

    callback({ success: true });
  } catch (error) {
    console.error("handleInactiveChat error:", error.message);
    callback({ success: false, message: error.message });
  }
}

module.exports = {
  addMessage,
  joinRoom,
  searchUser,
  handleActiveChat,
  handleInactiveChat,
};
