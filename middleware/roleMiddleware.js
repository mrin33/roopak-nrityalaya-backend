// Role-based access control middleware

// @desc    Check if user is an admin
// @access  Private
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ 
      message: 'Access denied. Admin privileges required.' 
    });
  }
};

// @desc    Check if user is a teacher
// @access  Private
const isTeacher = (req, res, next) => {
  if (req.user && req.user.role === 'teacher') {
    next();
  } else {
    res.status(403).json({ 
      message: 'Access denied. Teacher privileges required.' 
    });
  }
};

// @desc    Check if user is a student
// @access  Private
const isStudent = (req, res, next) => {
  if (req.user && req.user.role === 'student') {
    next();
  } else {
    res.status(403).json({ 
      message: 'Access denied. Student privileges required.' 
    });
  }
};

// @desc    Check if user is either admin or teacher
// @access  Private
const isAdminOrTeacher = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'teacher')) {
    next();
  } else {
    res.status(403).json({ 
      message: 'Access denied. Admin or Teacher privileges required.' 
    });
  }
};

// @desc    Check if user is either admin or student
// @access  Private
const isAdminOrStudent = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'student')) {
    next();
  } else {
    res.status(403).json({ 
      message: 'Access denied. Admin or Student privileges required.' 
    });
  }
};

// @desc    Check if user is either teacher or student
// @access  Private
const isTeacherOrStudent = (req, res, next) => {
  if (req.user && (req.user.role === 'teacher' || req.user.role === 'student')) {
    next();
  } else {
    res.status(403).json({ 
      message: 'Access denied. Teacher or Student privileges required.' 
    });
  }
};

// @desc    Allow any authenticated user (admin, teacher, or student)
// @access  Private
const isAuthenticated = (req, res, next) => {
  if (req.user) {
    next();
  } else {
    res.status(401).json({ 
      message: 'Access denied. Authentication required.' 
    });
  }
};

module.exports = {
  isAdmin,
  isTeacher,
  isStudent,
  isAdminOrTeacher,
  isAdminOrStudent,
  isTeacherOrStudent,
  isAuthenticated
};
