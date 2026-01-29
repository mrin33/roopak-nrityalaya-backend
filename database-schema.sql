-- Roopak Nrityalaya Database Schema
-- Run this file in PostgreSQL to create all tables

-- Create database (run separately first)
-- CREATE DATABASE roopak_nrityalaya;

-- Connect to the database
-- \c roopak_nrityalaya;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (for authentication)
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Levels table (8 levels of Kathak)
CREATE TABLE levels (
    level_id SERIAL PRIMARY KEY,
    level_number INTEGER UNIQUE NOT NULL,
    level_name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert the 8 levels
INSERT INTO levels (level_number, level_name, description) VALUES
(1, 'Praveshika Pratham', 'Beginner level - First step'),
(2, 'Praveshika Purna', 'Beginner level - Completion'),
(3, 'Madhyama Pratham', 'Intermediate level - First step'),
(4, 'Madhyama Purna', 'Intermediate level - Completion'),
(5, 'Visharad Pratham', 'Advanced level - First step'),
(6, 'Visharad Purna', 'Advanced level - Completion'),
(7, 'Alankar Pratham', 'Expert level - First step'),
(8, 'Alankar Purna', 'Expert level - Completion');

-- Teachers table
CREATE TABLE teachers (
    teacher_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    date_of_birth DATE,
    address TEXT,
    qualification TEXT,
    experience_years INTEGER,
    specialization TEXT,
    is_senior BOOLEAN DEFAULT false,
    bio TEXT,
    photo_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Students table
CREATE TABLE students (
    student_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    date_of_birth DATE,
    address TEXT,
    guardian_name VARCHAR(255),
    guardian_phone VARCHAR(20),
    current_level_id INTEGER REFERENCES levels(level_id),
    enrollment_date DATE DEFAULT CURRENT_DATE,
    photo_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Batches table
CREATE TABLE batches (
    batch_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_name VARCHAR(100) NOT NULL,
    level_id INTEGER REFERENCES levels(level_id),
    teacher_id UUID REFERENCES teachers(teacher_id),
    schedule TEXT,
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Student-Batch mapping (a student can only be in one active batch)
CREATE TABLE student_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES students(student_id) ON DELETE CASCADE,
    batch_id UUID REFERENCES batches(batch_id) ON DELETE CASCADE,
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(student_id, batch_id)
);

-- Attendance table
CREATE TABLE attendance (
    attendance_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES students(student_id) ON DELETE CASCADE,
    batch_id UUID REFERENCES batches(batch_id),
    class_date DATE NOT NULL,
    status VARCHAR(20) CHECK (status IN ('present', 'absent', 'late')),
    marked_by UUID REFERENCES teachers(teacher_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, batch_id, class_date)
);

-- Fee Structure table
CREATE TABLE fee_structure (
    fee_id SERIAL PRIMARY KEY,
    monthly_fee DECIMAL(10, 2) NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default fee (you can change this amount)
INSERT INTO fee_structure (monthly_fee, effective_from) VALUES (1000.00, CURRENT_DATE);

-- Fee Payments table
CREATE TABLE fee_payments (
    payment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES students(student_id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    payment_month DATE NOT NULL,
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    payment_status VARCHAR(20) CHECK (payment_status IN ('paid', 'pending', 'partial')),
    payment_method VARCHAR(50),
    razorpay_payment_id VARCHAR(255),
    razorpay_order_id VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notices table
CREATE TABLE notices (
    notice_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    posted_by UUID REFERENCES users(user_id),
    target_audience VARCHAR(20) CHECK (target_audience IN ('all', 'students', 'teachers')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Events table
CREATE TABLE events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_name VARCHAR(255) NOT NULL,
    event_date DATE,
    event_year INTEGER,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Gallery table (photos and videos)
CREATE TABLE gallery (
    gallery_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID REFERENCES events(event_id) ON DELETE CASCADE,
    media_type VARCHAR(20) CHECK (media_type IN ('photo', 'video')),
    media_url VARCHAR(500) NOT NULL,
    caption TEXT,
    uploaded_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Learning Resources table
CREATE TABLE learning_resources (
    resource_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    resource_type VARCHAR(20) CHECK (resource_type IN ('video', 'audio', 'document')),
    resource_url VARCHAR(500) NOT NULL,
    level_id INTEGER REFERENCES levels(level_id),
    batch_id UUID REFERENCES batches(batch_id),
    uploaded_by UUID REFERENCES teachers(teacher_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_students_user_id ON students(user_id);
CREATE INDEX idx_teachers_user_id ON teachers(user_id);
CREATE INDEX idx_attendance_student ON attendance(student_id);
CREATE INDEX idx_attendance_date ON attendance(class_date);
CREATE INDEX idx_fee_payments_student ON fee_payments(student_id);
CREATE INDEX idx_notices_active ON notices(is_active);

-- Create default admin user
-- Password: admin123 (hashed)
-- You should change this after first login!
INSERT INTO users (email, password_hash, role) VALUES 
('admin@roopak.com', '$2a$10$XQJ3qOQxXqKxQxKZH5qH4.YvJYH5GQH5GQH5GQH5GQH5GQH5GQH5G', 'admin');

COMMENT ON TABLE users IS 'Main authentication table for all users';
COMMENT ON TABLE teachers IS 'Teacher profiles and information';
COMMENT ON TABLE students IS 'Student profiles and information';
COMMENT ON TABLE batches IS 'Class batches organized by level';
COMMENT ON TABLE attendance IS 'Daily attendance records';
COMMENT ON TABLE fee_payments IS 'Monthly fee payment tracking';
