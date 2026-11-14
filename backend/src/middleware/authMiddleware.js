
const jwt = require("jsonwebtoken");

const protect = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                message: "Not authorized, token missing",
            });
        }

        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        // Support common JWT user ID field names
        const userId =
            decoded._id ||
            decoded.id ||
            decoded.userId ||
            decoded.sub;

        if (!userId) {
            return res.status(401).json({
                message: "User ID missing from token",
            });
        }

        // Normalize the authenticated user ID
        req.user = {
            ...decoded,
            _id: userId,
        };

        next();
    } catch (error) {
        return res.status(401).json({
            message: "Not authorized, invalid token",
        });
    }
};

module.exports = protect;
