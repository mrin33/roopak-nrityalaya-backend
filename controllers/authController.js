const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Student = require('../models/Student');

// Generate JWT Token
const generateToken = (userId, email, role) => {
  return jwt.sign(
    { userId, email, role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' } // Token expires in 7 days
  );
};

// @desc    Register new student
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const {
      email,
      password,
      fullName,
      phone,
      dateOfBirth,
      address,
      guardianName,
      guardianPhone
    } = req.body;

    // Validation
    if (!email || !password || !fullName || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: email, password, fullName, phone'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered. Please login or use a different email.'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user account
    const user = await User.create(email, passwordHash, 'student');

    // Create student profile
    const studentData = {
      fullName,
      phone,
      dateOfBirth: dateOfBirth || null,
      address: address || null,
      guardianName: guardianName || null,
      guardianPhone: guardianPhone || null
    };

    const student = await Student.create(user.user_id, studentData);

    // Generate token
    const token = generateToken(user.user_id, user.email, user.role);

    res.status(201).json({
      success: true,
      message: 'Registration successful! Welcome to Roopak Nrityalaya.',
      data: {
        token,
        user: {
          userId: user.user_id,
          email: user.email,
          role: user.role,
          profile: {
            studentId: student.student_id,
            fullName: student.full_name,
            phone: student.phone,
            currentLevel: 1 // Starts at Praveshika Pratham
          }
        }
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during registration. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Find user by email
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if account is active
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact admin.'
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update last login
    await User.updateLastLogin(user.user_id);

    // Get full user profile seamlessly using User model (handles students and teachers)
    const userWithProfile = await User.getUserWithProfile(user.user_id);
    const profile = userWithProfile ? userWithProfile.profile : null;

    // Generate token
    const token = generateToken(user.user_id, user.email, user.role);

    res.json({
      success: true,
      message: 'Login successful!',
      data: {
        token,
        user: {
          userId: user.user_id,
          email: user.email,
          role: user.role,
          profile: profile
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during login. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    // req.user is set by authMiddleware
    const userId = req.user.userId;

    // Get user with profile
    const user = await User.getUserWithProfile(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        userId: user.user_id,
        email: user.email,
        role: user.role,
        isActive: user.is_active,
        profile: user.profile
      }
    });

  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Logout user (client-side will remove token)
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res) => {
  // With JWT, logout is mainly handled client-side by removing the token
  // This endpoint is here for consistency and future enhancements (like token blacklisting)
  
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
};
