
const Message = require("../models/Message");

// POST /api/messages
// Save a message and notify the receiver.
const sendMessage = async (req, res) => {
    try {
        const { receiver, text } = req.body;

        if (!receiver || !text || !text.trim()) {
            return res.status(400).json({
                message: "Receiver and message are required",
            });
        }

        const senderId =
            req.user?._id ||
            req.user?.id ||
            req.user?.userId ||
            req.user?.sub;

        if (!senderId) {
            return res.status(401).json({
                message: "User ID missing from authentication token",
            });
        }

        if (String(senderId) === String(receiver)) {
            return res.status(400).json({
                message: "You cannot send a message to yourself",
            });
        }

        const savedMessage = await Message.create({
            sender: senderId,
            receiver,
            text: text.trim(),
        });

        const populatedMessage = await Message.findById(
            savedMessage._id
        )
            .populate("sender", "name email")
            .populate("receiver", "name email");

        const io = req.app.get("io");

        if (io) {
            const receiverId = String(
                populatedMessage.receiver._id
            );

            io.to(receiverId).emit(
                "newMessage",
                populatedMessage
            );

            console.log(
                "Message emitted to receiver:",
                receiverId
            );

            console.log(
                "Message ID:",
                String(populatedMessage._id)
            );
        }

        return res.status(201).json({
            message: "Message sent successfully",
            data: populatedMessage,
        });
    } catch (error) {
        console.error("Send message error:", error);

        return res.status(500).json({
            message: "Server error",
        });
    }
};

// GET /api/messages/:userId
// Get the conversation between the logged-in user and another user.
const getMessages = async (req, res) => {
    try {
        const currentUserId =
            req.user?._id ||
            req.user?.id ||
            req.user?.userId ||
            req.user?.sub;

        const otherUserId = req.params.userId;

        if (!currentUserId) {
            return res.status(401).json({
                message: "Authentication required",
            });
        }

        if (!otherUserId) {
            return res.status(400).json({
                message: "User ID is required",
            });
        }

        const messages = await Message.find({
            $or: [
                {
                    sender: currentUserId,
                    receiver: otherUserId,
                },
                {
                    sender: otherUserId,
                    receiver: currentUserId,
                },
            ],
        })
            .populate("sender", "name email")
            .populate("receiver", "name email")
            .sort({ createdAt: 1 });

        return res.status(200).json({
            count: messages.length,
            data: messages,
        });
    } catch (error) {
        console.error("Get messages error:", error);

        return res.status(500).json({
            message: "Server error",
        });
    }
};

module.exports = {
    sendMessage,
    getMessages,
};
