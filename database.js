const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  name: String,
  email: { type: String, unique: true, required: true },
  password: String,
  idNumber: { type: String, unique: true },
  role: { type: String, enum: ['student', 'admin'], default: 'student' },
  bio: String,
  profilePic: String,
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User',approved:{type:Boolean,default:false} }],
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' ,approved:{type:Boolean,default:false}}],
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

const postSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  content: String,
  image: String,
  approved:{type:Boolean,default:false},
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments: [ {
    commenter: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    name: String,
    text: String,
    time: { type: Date, default: Date.now },
  },]
}, { timestamps: true });

const Post = mongoose.model('Post', postSchema);

const chatSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' }
}, { timestamps: true });

const Chat = mongoose.model('Chat', chatSchema);

const messageSchema = new mongoose.Schema({
  chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat' },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  content: String,
  seenBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

const Message = mongoose.model('Message', messageSchema);

module.exports = {
  User,
  Post,
  Chat,
  Message
};
