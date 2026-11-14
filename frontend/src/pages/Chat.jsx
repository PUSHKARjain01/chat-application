
import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import { useAuth } from "../context/authContext";

const API_URL = "http://localhost:500/api";
const SOCKET_URL = "http://localhost:500";

const getId = (value) => {
    if (!value) return "";

    if (typeof value === "object") {
        return String(value._id || value.id || "");
    }

    return String(value);
};

function Chat() {
    const { user, logout } = useAuth();

    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [messages, setMessages] = useState([]);
    const [message, setMessage] = useState("");
    const [onlineUsers, setOnlineUsers] = useState([]);
    const [typingUserId, setTypingUserId] = useState("");
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [error, setError] = useState("");

    const messagesEndRef = useRef(null);
    const selectedUserRef = useRef(null);
    const socketRef = useRef(null);
    const typingTimeoutRef = useRef(null);

    selectedUserRef.current = selectedUser;

    const token = localStorage.getItem("token");

    const currentId = getId(
        user?._id || user?.userId || user?.id
    );

    const markConversationRead = (senderId) => {
        const socket = socketRef.current;

        if (
            socket?.connected &&
            senderId &&
            senderId !== currentId
        ) {
            socket.emit("markMessagesRead", { senderId });
        }
    };

    const stopTyping = () => {
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = null;
        }

        const socket = socketRef.current;

        if (socket?.connected) {
            socket.emit("stopTyping");
        }
    };

    const handleMessageInput = (value) => {
        setMessage(value);

        const socket = socketRef.current;

        if (!selectedUser || !socket?.connected) return;

        if (!value.trim()) {
            stopTyping();
            return;
        }

        socket.emit("typing", {
            receiverId: getId(
                selectedUser._id || selectedUser.id
            ),
        });

        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        typingTimeoutRef.current = setTimeout(() => {
            socket.emit("stopTyping");
            typingTimeoutRef.current = null;
        }, 1200);
    };

    // Load users.
    useEffect(() => {
        let cancelled = false;

        const fetchUsers = async () => {
            try {
                setLoadingUsers(true);
                setError("");

                const response = await axios.get(`${API_URL}/users`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                const userList =
                    response.data.data ||
                    response.data.users ||
                    response.data;

                if (!Array.isArray(userList)) {
                    throw new Error("Invalid users response");
                }

                if (!cancelled) {
                    setUsers(
                        userList.filter(
                            (item) =>
                                getId(item._id || item.id) !== currentId
                        )
                    );
                }
            } catch (err) {
                console.error("Failed to load users:", err);

                if (!cancelled) {
                    setError("Could not load users. Please try again.");
                }
            } finally {
                if (!cancelled) {
                    setLoadingUsers(false);
                }
            }
        };

        if (token && currentId) {
            fetchUsers();
        } else {
            setLoadingUsers(false);
            setError("Please log in again.");
        }

        return () => {
            cancelled = true;
        };
    }, [token, currentId]);

    // Socket.IO: online users, messages, typing, and read receipts.
    useEffect(() => {
        if (!token || !currentId) return;

        const socket = io(SOCKET_URL, {
            auth: { token },
        });

        socketRef.current = socket;

        const handleConnect = () => {
            console.log("Connected to chat server:", socket.id);

            const activeUser = selectedUserRef.current;

            if (activeUser) {
                markConversationRead(
                    getId(activeUser._id || activeUser.id)
                );
            }
        };

        const handleConnectError = (err) => {
            console.error("Socket connection failed:", err.message);
        };

        const handleOnlineUsers = (ids) => {
            setOnlineUsers(Array.isArray(ids) ? ids.map(String) : []);
        };

        const handleUserTyping = (payload = {}) => {
            const activeUser = selectedUserRef.current;
            if (!activeUser) return;

            const selectedId = getId(
                activeUser._id || activeUser.id
            );

            if (String(payload.senderId) !== selectedId) return;

            setTypingUserId(
                payload.isTyping ? selectedId : ""
            );
        };

        const handleNewMessage = (incomingMessage) => {
            const senderId = getId(incomingMessage.sender);
            const receiverId = getId(incomingMessage.receiver);
            const activeUser = selectedUserRef.current;

            if (!activeUser) return;

            const selectedId = getId(
                activeUser._id || activeUser.id
            );

            const belongsToConversation =
                (senderId === currentId && receiverId === selectedId) ||
                (senderId === selectedId && receiverId === currentId);

            if (!belongsToConversation) return;

            setMessages((previous) => {
                const incomingId = getId(
                    incomingMessage._id || incomingMessage.id
                );

                const exists = previous.some(
                    (item) =>
                        getId(item._id || item.id) === incomingId
                );

                return exists
                    ? previous
                    : [...previous, incomingMessage];
            });

            if (
                senderId === selectedId &&
                receiverId === currentId
            ) {
                markConversationRead(senderId);
            }
        };

        const handleMessageRead = (receipt) => {
            const ids = new Set(
                (receipt.messageIds || []).map(String)
            );

            setMessages((previous) =>
                previous.map((item) => {
                    const id = getId(item._id || item.id);

                    return ids.has(id)
                        ? {
                              ...item,
                              readAt:
                                  receipt.readAt ||
                                  new Date().toISOString(),
                          }
                        : item;
                })
            );
        };

        const handleMessagesMarkedRead = (receipt) => {
            const ids = new Set(
                (receipt.messageIds || []).map(String)
            );

            if (!ids.size) return;

            setMessages((previous) =>
                previous.map((item) => {
                    const id = getId(item._id || item.id);

                    return ids.has(id)
                        ? {
                              ...item,
                              readAt:
                                  receipt.readAt ||
                                  new Date().toISOString(),
                          }
                        : item;
                })
            );
        };

        socket.on("connect", handleConnect);
        socket.on("connect_error", handleConnectError);
        socket.on("onlineUsers", handleOnlineUsers);
        socket.on("userTyping", handleUserTyping);
        socket.on("newMessage", handleNewMessage);
        socket.on("messageRead", handleMessageRead);
        socket.on("messagesMarkedRead", handleMessagesMarkedRead);

        return () => {
            socket.off("connect", handleConnect);
            socket.off("connect_error", handleConnectError);
            socket.off("onlineUsers", handleOnlineUsers);
            socket.off("userTyping", handleUserTyping);
            socket.off("newMessage", handleNewMessage);
            socket.off("messageRead", handleMessageRead);
            socket.off("messagesMarkedRead", handleMessagesMarkedRead);

            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }

            socket.disconnect();

            if (socketRef.current === socket) {
                socketRef.current = null;
            }
        };
    }, [token, currentId]);

    // Load conversation history.
    useEffect(() => {
        let cancelled = false;

        const fetchMessages = async () => {
            if (!selectedUser || !token) {
                setMessages([]);
                setLoadingMessages(false);
                return;
            }

            const selectedId = getId(
                selectedUser._id || selectedUser.id
            );

            try {
                setLoadingMessages(true);
                setError("");
                setMessages([]);

                const response = await axios.get(
                    `${API_URL}/messages/${selectedId}`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }
                );

                const list =
                    response.data.data ||
                    response.data.messages ||
                    [];

                if (cancelled) return;

                const messageList = Array.isArray(list) ? list : [];
                setMessages(messageList);

                const hasUnreadIncoming = messageList.some(
                    (item) =>
                        getId(item.sender) === selectedId &&
                        getId(item.receiver) === currentId &&
                        !item.readAt
                );

                if (hasUnreadIncoming) {
                    markConversationRead(selectedId);
                }
            } catch (err) {
                console.error("Failed to load messages:", err);

                if (!cancelled) {
                    setError("Could not load conversation messages.");
                }
            } finally {
                if (!cancelled) {
                    setLoadingMessages(false);
                }
            }
        };

        fetchMessages();

        return () => {
            cancelled = true;
        };
    }, [selectedUser, token, currentId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({
            behavior: "smooth",
        });
    }, [messages]);

    const handleSendMessage = async (event) => {
        event.preventDefault();

        const text = message.trim();

        if (!text || !selectedUser || !token) return;

        stopTyping();

        try {
            setError("");

            const receiverId = getId(
                selectedUser._id || selectedUser.id
            );

            const response = await axios.post(
                `${API_URL}/messages`,
                {
                    receiver: receiverId,
                    text,
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            const savedMessage = response.data.data;

            if (!savedMessage) {
                throw new Error("Server did not return the saved message.");
            }

            setMessages((previous) => {
                const savedId = getId(
                    savedMessage._id || savedMessage.id
                );

                const exists = previous.some(
                    (item) =>
                        getId(item._id || item.id) === savedId
                );

                return exists
                    ? previous
                    : [...previous, savedMessage];
            });

            setMessage("");
        } catch (err) {
            console.error("Send message failed:", err);

            setError(
                err.response?.data?.message ||
                err.message ||
                "Message could not be sent."
            );
        }
    };

    const handleSelectUser = (selected) => {
        stopTyping();
        setTypingUserId("");
        setSelectedUser(selected);
        setError("");

        markConversationRead(
            getId(selected._id || selected.id)
        );
    };

    const formatTime = (date) => {
        if (!date) return "";

        const parsed = new Date(date);

        if (Number.isNaN(parsed.getTime())) return "";

        return parsed.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const isOnline = (id) => onlineUsers.includes(String(id));

    return (
        <div className="chat-container">
            <header className="chat-header">
                <div>
                    <h1>Chat Application</h1>
                    <p>Welcome, {user?.name || "User"}</p>
                </div>

                <button onClick={logout} className="logout-button">
                    Logout
                </button>
            </header>

            <div className="chat-body">
                <aside className="users-panel">
                    <h2>Users</h2>

                    {loadingUsers && <p>Loading users...</p>}

                    {!loadingUsers && users.length === 0 && (
                        <p>No other users found.</p>
                    )}

                    {users.map((item) => {
                        const itemId = getId(item._id || item.id);
                        const online = isOnline(itemId);

                        const isSelected =
                            itemId === getId(
                                selectedUser?._id || selectedUser?.id
                            );

                        return (
                            <button
                                key={itemId}
                                type="button"
                                className={`user-item ${
                                    isSelected ? "selected" : ""
                                }`}
                                onClick={() => handleSelectUser(item)}
                            >
                                <span className="avatar">
                                    {(item.name || "U")
                                        .charAt(0)
                                        .toUpperCase()}
                                </span>

                                <span className="user-details">
                                    <strong>{item.name}</strong>
                                    <small>{item.email}</small>

                                    <small
                                        className={`presence ${
                                            online ? "online" : "offline"
                                        }`}
                                    >
                                        <span className="presence-dot" />
                                        {online ? "Online" : "Offline"}
                                    </small>
                                </span>
                            </button>
                        );
                    })}
                </aside>

                <section className="conversation">
                    {!selectedUser ? (
                        <div className="no-chat">
                            <h2>Select a user</h2>
                            <p>
                                Select someone from the left to start chatting.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="conversation-header">
                                <span className="avatar">
                                    {(selectedUser.name || "U")
                                        .charAt(0)
                                        .toUpperCase()}
                                </span>

                                <div>
                                    <h2>{selectedUser.name}</h2>

                                    <p
                                        className={`presence ${
                                            isOnline(
                                                getId(
                                                    selectedUser._id ||
                                                    selectedUser.id
                                                )
                                            )
                                                ? "online"
                                                : "offline"
                                        }`}
                                    >
                                        <span className="presence-dot" />

                                        {typingUserId ===
                                        getId(
                                            selectedUser._id ||
                                            selectedUser.id
                                        )
                                            ? "Typing..."
                                            : isOnline(
                                                  getId(
                                                      selectedUser._id ||
                                                      selectedUser.id
                                                  )
                                              )
                                              ? "Online"
                                              : "Offline"}
                                    </p>
                                </div>
                            </div>

                            <div className="messages">
                                {loadingMessages && (
                                    <p>Loading messages...</p>
                                )}

                                {!loadingMessages && messages.length === 0 && (
                                    <p className="no-messages">
                                        No messages yet. Say hello!
                                    </p>
                                )}

                                {messages.map((item, index) => {
                                    const isSent =
                                        getId(item.sender) === currentId;

                                    return (
                                        <div
                                            key={
                                                getId(item._id || item.id) ||
                                                `${item.createdAt}-${index}`
                                            }
                                            className={`message ${
                                                isSent ? "sent" : "received"
                                            }`}
                                        >
                                            <p>{item.text}</p>

                                            <small className="message-time">
                                                {formatTime(item.createdAt)}

                                                {isSent && (
                                                    <span
                                                        className={`message-status ${
                                                            item.readAt ? "read" : ""
                                                        }`}
                                                        title={
                                                            item.readAt
                                                                ? "Read"
                                                                : "Sent"
                                                        }
                                                    >
                                                        {item.readAt
                                                            ? " ✓✓ Read"
                                                            : " ✓ Sent"}
                                                    </span>
                                                )}
                                            </small>
                                        </div>
                                    );
                                })}

                                <div ref={messagesEndRef} />
                            </div>

                            <form
                                className="message-input"
                                onSubmit={handleSendMessage}
                            >
                                <input
                                    type="text"
                                    placeholder="Type a message..."
                                    value={message}
                                    onChange={(event) =>
                                        handleMessageInput(event.target.value)
                                    }
                                    onBlur={stopTyping}
                                />

                                <button
                                    type="submit"
                                    disabled={!message.trim()}
                                >
                                    Send
                                </button>
                            </form>
                        </>
                    )}
                </section>
            </div>

            {error && (
                <p className="chat-error" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}

export default Chat;
