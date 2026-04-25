// backend/src/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
// ⚠️ IMPORTANT: Must use the SAME secret as authController.js and userController.js
const JWT_SECRET = process.env.JWT_SECRET || 'tasksarsnkg,mfnfvajdngkjnbskjnfdkjfnkjvnfjakdngkjkjdzkfjfvkjkjgjvkjad';

// Protect any logged-in user (employee or admin)
exports.verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided. Please log in.' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;   // { id, email, role }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token. Please log in again.' });
  }
};

// Allow only admins
exports.verifyAdmin = (req, res, next) => {
  exports.verifyToken(req, res, () => {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access only.' });
    }
    next();
  });
};

