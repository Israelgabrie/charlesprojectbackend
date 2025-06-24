// backend/getPendingPosts.js
const { User, Post } = require("./database");

async function getPendingPosts(id, callback) {
  try {
    const adminUser = await User.findById(id);
    if (!adminUser || adminUser.role !== "admin") {
      return callback({
        success: false,
        message: "Unauthorized: Only admins can view pending posts.",
        posts: [],
      });
    }

    const pendingPosts = await Post.find({ approved: false })
      .populate("author", "fullName idNumber profilePic")
      .sort({ createdAt: -1 });

    callback({
      success: true,
      message: "Pending posts retrieved successfully.",
      posts: pendingPosts,
    });
  } catch (error) {
    console.error("Error fetching pending posts:", error);
    callback({
      success: false,
      message: "An error occurred while fetching pending posts.",
      posts: [],
    });
  }
}

async function getManageUsersStats(io, socket, id, callback) {
  try {
    const adminUser = await User.findById(id);
    if (!adminUser || adminUser.role !== "admin") {
      return callback({
        success: false,
        message: "Unauthorized: Only admins can view dashboard stats.",
      });
    }

    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ active: true });

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const usersLastWeek = await User.countDocuments({
      createdAt: { $gte: oneWeekAgo },
    });

    const totalStudents = await User.countDocuments({ role: "student" });
    const allStudentUsers = await User.find({ role: "student" }).select(
      "fullName email idNumber profileImage createdAt active canAutoPost isApproved"
    ).limit(20);
    console.log("all students")
    console.log(allStudentUsers)

    const stats = {
      success: true,
      message: "Dashboard stats retrieved successfully.",
      totalUsers,
      activeUsers,
      usersLastWeek,
      totalStudents,
      studentUsers: allStudentUsers,
    };

    // Emit to the socket OR use callback
    if (callback) {
      callback(stats);
    } else {
      socket.emit("dashboardStats", stats);
    }
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    callback({
      success: false,
      message: "An error occurred while fetching dashboard stats.",
    });
  }
}
async function getFilteredUsers(filterValue, callback) {
  try {
    let users;
    console.log(filterValue);

    if (filterValue === "All") {
      users = await User.find({ role: "student" }).select(
        "fullName email idNumber profileImage createdAt active role canAutoPost isApproved"
      );
    } else if (filterValue === "active") {
      users = await User.find({ active: true, role: "student" }).select(
        "fullName email idNumber profileImage createdAt active role canAutoPost isApproved"
      );
    } else {
      return callback({
        success: false,
        message: "Invalid filter value. Use 'All' or 'active'.",
        users: [],
      });
    }

    callback({
      success: true,
      message: `Successfully retrieved ${filterValue} users.`,
      users,
    });
  } catch (error) {
    console.error("Error fetching filtered users:", error);
    callback({
      success: false,
      message: "An error occurred while fetching filtered users.",
      users: [],
    });
  }
}

async function getStudentUsers(io, socket, nameText, callback) {
  try {
    let query = { role: "student" };

    if (nameText && nameText.trim() !== "") {
      const regex = new RegExp(nameText, "i"); // case-insensitive regex
      query.fullName = regex;
    }

    const students = await User.find(query).select(
      "fullName email idNumber profileImage createdAt active canAutoPost isApproved"
    );

    callback({
      success: true,
      message: "Student users retrieved successfully.",
      students,
    });
  } catch (error) {
    console.error("Error fetching student users:", error);
    callback({
      success: false,
      message: "An error occurred while fetching student users.",
      students: [],
    });
  }
}


module.exports = {
  getStudentUsers,
  getPendingPosts,
  getManageUsersStats,
  getFilteredUsers,
};
