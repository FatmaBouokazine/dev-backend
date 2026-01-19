const jwt = require('jsonwebtoken');

// Middleware to verify JWT token
const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Middleware to verify admin role
const adminMiddleware = (req, res, next) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
  }
  next();
};

// Middleware to verify reception agent role
const receptionMiddleware = (req, res, next) => {
  if (req.user.role !== 'Reception Agent' && req.user.role !== 'Admin') {
    return res.status(403).json({ message: 'Access denied. Reception Agent privileges required.' });
  }
  next();
};

module.exports = {
  authMiddleware,
  adminMiddleware,
  receptionMiddleware
};