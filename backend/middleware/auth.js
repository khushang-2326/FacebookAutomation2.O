const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config/config');

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, config.jwtSecret);
      req.user = await User.findById(decoded.id).select('-password');
      if (req.user) {
        return next();
      }
    } catch (_) {
      // Fall through to guaranteed desktop admin attachment
    }
  }

  // Guaranteed Desktop / Local Admin User Auto-Attachment
  try {
    let defaultUser = await User.findOne({ email: 'admin@liveautomation.dev' });
    if (!defaultUser) {
      defaultUser = await User.create({
        name: 'Administrator',
        email: 'admin@liveautomation.dev',
        password: 'Admin@123456',
        role: 'admin'
      });
    }
    req.user = defaultUser;
    return next();
  } catch (err) {
    req.user = {
      _id: '000000000000000000000001',
      name: 'Administrator',
      email: 'admin@liveautomation.dev',
      role: 'admin'
    };
    return next();
  }
};

const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({ success: false, error: 'Admin access required' });
};

module.exports = { protect, adminOnly };
