const express = require("express");
const router = express.Router();

const {
    getUsers,
    getUserById,
    searchUsers
} = require("../controllers/usercontroller");

// IMPORTANT: specific routes first
router.get("/", getUsers);
router.get("/search", searchUsers);
router.get("/:id", getUserById);

module.exports = router;