const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const { User } = require("./database");
const dotenv = require("dotenv").config();

// Route: POST /user - Create Admin or Student (only admins can create accounts)
router.post("/user", async (req, res) => {
  try {
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
      return res.status(400).json({ message: "Valid email is required." });
    }

    // ✅ Validate password
    if (!password) {
      return res.status(400).json({ message: "Password is required." });
    }

    // ✅ Determine role
    const isStudent = !!idNumber;
    const role = isStudent ? "student" : "admin";

    // ✅ Validate ID number if student
    if (isStudent) {
      const idRegex = /^\d{11,12}$/;
      if (!idRegex.test(idNumber)) {
        return res.status(400).json({ message: "ID number must be 11 or 12 digits long." });
      }
    }

    // ✅ Check if user already exists
    const existingUser = await User.findOne(
      isStudent ? { $or: [{ email }, { idNumber }] } : { email }
    );

    if (existingUser) {
      return res.status(409).json({ message: "User with this email or ID number already exists." });
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
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
