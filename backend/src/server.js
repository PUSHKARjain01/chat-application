
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { Server } = require("socket.io");

const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const messageRoutes = require("./routes/messageRoutes");
const Message = require("./models/Message");

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"],
    },
});

app.set("io", io);

const onlineUsers = new Map();

io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
        return next(new Error("Authentication required"));
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId =
            decoded._id ||
            decoded.userId ||
            decoded.id ||
            decoded.sub;

        if (!userId || !mongoose.isValidObjectId(userId)) {
            return next(new Error("Invalid user ID in token"));
        }

        socket.userId = String(userId);
        next();
    } catch (error) {
        next(new Error("Invalid or expired token"));
    }
});

io.on("connection", (socket) => {
    const currentUserId = socket.userId;
    let typingTo = "";

    socket.join(currentUserId);

    if (!onlineUsers.has(currentUserId)) {
        onlineUsers.set(currentUserId, new Set());
    }

    onlineUsers.get(currentUserId).add(socket.id);

    console.log("Socket connected:", socket.id);
    console.log("User ID:", currentUserId);

    const broadcastOnlineUsers = () => {
        io.emit("onlineUsers", Array.from(onlineUsers.keys()));
    };

    const stopTyping = () => {
        if (!typingTo) return;

        io.to(typingTo).emit("userTyping", {
            senderId: currentUserId,
            isTyping: false,
        });

        typingTo = "";
    };

    broadcastOnlineUsers();

    // Typing indicator.
    socket.on("typing", (payload = {}) => {
        const receiverId = String(payload.receiverId || "");

        if (
            !mongoose.isValidObjectId(receiverId) ||
            receiverId === currentUserId
        ) {
            return;
        }

        // If the user switches conversations, stop the old indicator.
        if (typingTo && typingTo !== receiverId) {
            stopTyping();
        }

        typingTo = receiverId;

        socket.to(receiverId).emit("userTyping", {
            senderId: currentUserId,
            isTyping: true,
        });
    });

    socket.on("stopTyping", () => {
        stopTyping();
    });

    // Read receipts.
    socket.on("markMessagesRead", async (payload = {}) => {
        try {
            const senderId = String(payload.senderId || "");

            if (
                !mongoose.isValidObjectId(senderId) ||
                senderId === currentUserId
            ) {
                return;
            }

            const unreadMessages = await Message.find({
                sender: senderId,
                receiver: currentUserId,
                readAt: null,
            }).select("_id");

            if (unreadMessages.length === 0) {
                socket.emit("messagesMarkedRead", {
                    senderId,
                    messageIds: [],
                });
                return;
            }

            const ids = unreadMessages.map((item) => item._id);
            const messageIds = ids.map(String);
            const readAt = new Date();

            await Message.updateMany(
                {
                    _id: { $in: ids },
                    receiver: currentUserId,
                    readAt: null,
                },
                {
                    $set: { readAt },
                }
            );

            io.to(senderId).emit("messageRead", {
                readerId: currentUserId,
                messageIds,
                readAt: readAt.toISOString(),
            });

            socket.emit("messagesMarkedRead", {
                senderId,
                messageIds,
                readAt: readAt.toISOString(),
            });
        } catch (error) {
            console.error("Mark messages read error:", error.message);
        }
    });

    socket.on("disconnect", () => {
        // Remove the typing indicator if the socket disconnects.
        stopTyping();

        const sockets = onlineUsers.get(currentUserId);

        if (sockets) {
            sockets.delete(socket.id);

            if (sockets.size === 0) {
                onlineUsers.delete(currentUserId);
            }
        }

        console.log("Socket disconnected:", socket.id);
        broadcastOnlineUsers();
    });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/messages", messageRoutes);

app.get("/", (req, res) => {
    res.send("Backend is working!");
});

const PORT = process.env.PORT || 500;

async function startServer() {
    try {
        await connectDB();

        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Failed to start backend:", error.message);
        process.exit(1);
    }
}

startServer();
