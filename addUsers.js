const express = require("express");
const router = express.Router();
const bcrypt = require('bcryptjs');
const { User, RecentActivity } = require("./database");
const dotenv = require("dotenv").config();

// Route: POST /user - Create Admin or Student (only admins can create accounts)
router.post("/user", async (req, res) => {
  try {
    console.log(req.body)
    const { fullName, email, password, idNumber, adminPassCode } = req.body;
    const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE;

    // ✅ Require passcode for both admins and students
    if (!adminPassCode || adminPassCode !== ADMIN_PASSCODE) {
      return res.status(403).json({ message: "Invalid admin passcode. Only admins can create accounts." });
    }

    // ✅ Validate full name
    if (!fullName || fullName.trim().length < 3) {
      return res.status(400).json({ message: "Full name is required and must be at least 3 characters." });
    }

    // ✅ Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ success:false,message: "Valid email is required." });
    }

    // ✅ Validate password
    if (!password) {
      return res.status(400).json({success:false, message: "Password is required." });
    }

    // ✅ Determine role
    const isStudent = !!idNumber;
    const role = isStudent ? "student" : "admin";

    // ✅ Validate ID number if student
    if (isStudent) {
      const idRegex = /^\d{11,12}$/;
      if (!idRegex.test(idNumber)) {
        return res.status(400).json({ success:false,message: "ID number must be 11 or 12 digits long." });
      }
    }

    // ✅ Check if user already exists
    const existingUser = await User.findOne(
      isStudent ? { $or: [{ email }, { idNumber }] } : { email }
    );

    if (existingUser) {
      return res.status(409).json({success:false, message: "User with this email or ID number already exists." });
    }

    // ✅ Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ Create user
    const newUser = new User({
      fullName, // ✅ Store full name
      email,
      password: hashedPassword,
      role,
      ...(isStudent && { idNumber }),
    });

    await newUser.save();
    const newActivity = new RecentActivity({
      description: `${newUser.role} account created by ${newUser.fullName}`,
      actionType: `signUp`,
    });

    await newActivity.save();

    res.status(201).json({
      message: `${role.charAt(0).toUpperCase() + role.slice(1)} account created successfully`,
      user: {
        id: newUser._id,
        fullName: newUser.fullName,
        email: newUser.email,
        role: newUser.role,
        ...(isStudent && { idNumber: newUser.idNumber }),
      },
    });
  } catch (err) {
    console.error("Error creating user:", err);
    res.status(500).json({success:false, message: "Server error" });
  }
});

// Route: POST /user/change-password - Change password using user ID
router.post("/changePassword", async (req, res) => {
  try {
    const { userId, currentPassword, newPassword } = req.body;

    // Validate inputs
    if (!userId || !currentPassword || !newPassword) {
      return res.status(400).json({ success:false,message: "User ID, current password, and new password are required." });
    }

    // Find user by ID
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({success:false, message: "User not found." });
    }

    // Check current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({success:false, message: "Current password is incorrect." });
    }

    // Optional: Prevent using same password
    const isSameAsOld = await bcrypt.compare(newPassword, user.password);
    if (isSameAsOld) {
      return res.status(400).json({success:false, message: "New password must be different from the current password." });
    }

    // Hash new password and update
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedNewPassword;
    await user.save();
    const newActivity = new RecentActivity({
      actionType:"changePassword",
      description:`${user.fullName} Changed their password`
    })

    await newActivity.save();

    res.status(200).json({success:true, message: "Password changed successfully." });
  } catch (err) {
    console.error("Error changing password:", err);
    res.status(500).json({success:false, message: "Server error" });
  }
});


module.exports = router;
