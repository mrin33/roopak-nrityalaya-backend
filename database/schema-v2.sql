-- =====================================================
-- ROOPAK NRITYALAYA - COMPLETE DATABASE SCHEMA V2.0
-- Enhanced with all new features
-- =====================================================

-- Drop existing tables (in correct order)
DROP TABLE IF EXISTS makeup_class_bookings CASCADE;
DROP TABLE IF EXISTS student_status_changes CASCADE;
DROP TABLE IF EXISTS student_activity_logs CASCADE;
DROP TABLE IF EXISTS teacher_reviews CASCADE;
DROP TABLE IF EXISTS batch_transfers CASCADE;
DROP TABLE IF EXISTS gallery_requests CASCADE;
DROP TABLE IF EXISTS gallery CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS notices CASCADE;
DROP TABLE IF EXISTS fee_payments CASCADE;
DROP TABLE IF EXISTS fee_structure CASCADE;
DROP TABLE IF EXISTS attendance CASCADE;
DROP TABLE IF EXISTS learning_resources CASCADE;
DROP TABLE IF EXISTS student_batches CASCADE;
DROP TABLE IF EXISTS batches CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS teachers CASCADE;
DROP TABLE IF EXISTS levels CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- =====================================================
-- 1. USERS TABLE (Base authentication)
-- =====================================================
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 2. LEVELS TABLE (8 Kathak levels with codes)
-- =====================================================
CREATE TABLE levels (
    level_id SERIAL PRIMARY KEY,
    level_name VARCHAR(100) NOT NULL,
    level_number INTEGER NOT NULL UNIQUE,
    level_code VARCHAR(10) NOT NULL UNIQUE, -- PP, PM, MP, MM, VP, VM, AP, AM
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert 8 levels with codes
INSERT INTO levels (level_name, level_number, level_code, description) VALUES
('Praveshika Pratham', 1, 'PP', 'Beginner level - Introduction to Kathak'),
('Praveshika Purna', 2, 'PM', 'Elementary level completion'),
('Madhyama Pratham', 3, 'MP', 'Intermediate level - Part 1'),
('Madhyama Purna', 4, 'MM', 'Intermediate level - Part 2'),
('Visharad Pratham', 5, 'VP', 'Advanced level - Part 1'),
('Visharad Purna', 6, 'VM', 'Advanced level - Part 2'),
('Alankar Pratham', 7, 'AP', 'Expert level - Part 1'),
('Alankar Purna', 8, 'AM', 'Expert level - Part 2');

-- =====================================================
-- 3. TEACHERS TABLE (with rating system)
-- =====================================================
CREATE TABLE teachers (
    teacher_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    specialization VARCHAR(255),
    experience_years INTEGER DEFAULT 0,
    qualifications TEXT,
    bio TEXT,
    
    -- Rating system
    average_rating DECIMAL(3,2) DEFAULT 0.00 CHECK (average_rating >= 0 AND average_rating <= 5),
    total_reviews INTEGER DEFAULT 0,
    
    -- Performance metrics
    total_students_taught INTEGER DEFAULT 0,
    is_senior BOOLEAN DEFAULT false,
    
    profile_photo_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 4. STUDENTS TABLE (Enhanced with all new features)
-- =====================================================
CREATE TABLE students (
    student_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    date_of_birth DATE,
    gender VARCHAR(20),
    address TEXT,
    emergency_contact VARCHAR(20),
    emergency_contact_name VARCHAR(255),
    
    -- Level and Roll Number
    current_level_id INTEGER REFERENCES levels(level_id),
    roll_number VARCHAR(20) UNIQUE, -- Auto-generated: PP1, PP2, VP15, etc.
    
    -- Payment preferences
    payment_window VARCHAR(20) DEFAULT 'monthly' 
        CHECK (payment_window IN ('monthly', 'quarterly', 'half_yearly', 'yearly')),
    
    -- Enrollment tracking
    enrollment_date DATE DEFAULT CURRENT_DATE,
    enrollment_reason TEXT, -- Why joined
    
    -- Performance metrics
    total_performances INTEGER DEFAULT 0,
    total_exams_attended INTEGER DEFAULT 0,
    total_practice_hours DECIMAL(10,2) DEFAULT 0.00,
    attendance_percentage DECIMAL(5,2) DEFAULT 0.00,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    discontinuation_date DATE,
    discontinuation_reason TEXT,
    
    profile_photo_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- FUNCTION: Auto-generate Roll Number (PP1, VP2, etc.)
-- =====================================================
CREATE OR REPLACE FUNCTION generate_roll_number()
RETURNS TRIGGER AS $$
DECLARE
    level_code VARCHAR(10);
    next_number INTEGER;
    new_roll_number VARCHAR(20);
BEGIN
    -- Only generate if roll_number is not provided
    IF NEW.roll_number IS NULL AND NEW.current_level_id IS NOT NULL THEN
        -- Get level code
        SELECT l.level_code INTO level_code
        FROM levels l
        WHERE l.level_id = NEW.current_level_id;
        
        -- Get next number for this level code
        SELECT COALESCE(
            MAX(
                CAST(
                    SUBSTRING(roll_number FROM '[0-9]+$') AS INTEGER
                )
            ), 0
        ) + 1 INTO next_number
        FROM students
        WHERE roll_number ~ ('^' || level_code || '[0-9]+$');
        
        -- Generate new roll number
        NEW.roll_number := level_code || next_number;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto roll number generation
CREATE TRIGGER student_roll_number_trigger
BEFORE INSERT ON students
FOR EACH ROW
EXECUTE FUNCTION generate_roll_number();

-- =====================================================
-- 5. BATCHES TABLE (with max limit of 15)
-- =====================================================
CREATE TABLE batches (
    batch_id SERIAL PRIMARY KEY,
    batch_name VARCHAR(255) NOT NULL,
    level_id INTEGER REFERENCES levels(level_id),
    teacher_id INTEGER REFERENCES teachers(teacher_id) ON DELETE SET NULL,
    
    -- Schedule details
    schedule VARCHAR(100), -- e.g., "Mon, Wed, Fri"
    time VARCHAR(50), -- e.g., "8:00 AM - 9:30 AM"
    room VARCHAR(100),
    
    -- Capacity limits
    max_students INTEGER DEFAULT 15 CHECK (max_students > 0 AND max_students <= 15),
    current_enrolled INTEGER DEFAULT 0,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    start_date DATE,
    end_date DATE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 6. STUDENT_BATCHES (Many-to-many relationship)
-- =====================================================
CREATE TABLE student_batches (
    student_batch_id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(student_id) ON DELETE CASCADE,
    batch_id INTEGER REFERENCES batches(batch_id) ON DELETE CASCADE,
    joined_date DATE DEFAULT CURRENT_DATE,
    left_date DATE,
    is_active BOOLEAN DEFAULT true,
    switching_reason TEXT, -- Track why student switched batches
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, batch_id)
);

-- Function to check batch capacity before enrolling
CREATE OR REPLACE FUNCTION check_batch_capacity()
RETURNS TRIGGER AS $$
DECLARE
    current_count INTEGER;
    max_capacity INTEGER;
BEGIN
    -- Get current enrollment and max capacity
    SELECT current_enrolled, max_students INTO current_count, max_capacity
    FROM batches
    WHERE batch_id = NEW.batch_id;
    
    -- Check if batch is full
    IF NEW.is_active = true AND current_count >= max_capacity THEN
        RAISE EXCEPTION 'Batch is full. Maximum capacity is %', max_capacity;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to enforce batch capacity
CREATE TRIGGER enforce_batch_capacity
BEFORE INSERT OR UPDATE ON student_batches
FOR EACH ROW
EXECUTE FUNCTION check_batch_capacity();

-- Function to update batch enrollment count
CREATE OR REPLACE FUNCTION update_batch_enrollment()
RETURNS TRIGGER AS $$
BEGIN
    -- Update current_enrolled count
    IF TG_OP = 'INSERT' AND NEW.is_active = true THEN
        UPDATE batches SET current_enrolled = current_enrolled + 1 
        WHERE batch_id = NEW.batch_id;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.is_active = true AND NEW.is_active = false THEN
            UPDATE batches SET current_enrolled = current_enrolled - 1 
            WHERE batch_id = NEW.batch_id;
        ELSIF OLD.is_active = false AND NEW.is_active = true THEN
            UPDATE batches SET current_enrolled = current_enrolled + 1 
            WHERE batch_id = NEW.batch_id;
        END IF;
    ELSIF TG_OP = 'DELETE' AND OLD.is_active = true THEN
        UPDATE batches SET current_enrolled = current_enrolled - 1 
        WHERE batch_id = OLD.batch_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update batch enrollment
CREATE TRIGGER update_batch_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON student_batches
FOR EACH ROW
EXECUTE FUNCTION update_batch_enrollment();

-- =====================================================
-- 7. BATCH_TRANSFERS (One-day teacher substitution)
-- =====================================================
CREATE TABLE batch_transfers (
    transfer_id SERIAL PRIMARY KEY,
    batch_id INTEGER REFERENCES batches(batch_id) ON DELETE CASCADE,
    from_teacher_id INTEGER REFERENCES teachers(teacher_id),
    to_teacher_id INTEGER REFERENCES teachers(teacher_id),
    transfer_date DATE NOT NULL,
    reason TEXT,
    is_permanent BOOLEAN DEFAULT false, -- false = one-day only
    created_by INTEGER REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 8. ATTENDANCE TABLE
-- =====================================================
CREATE TABLE attendance (
    attendance_id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(student_id) ON DELETE CASCADE,
    batch_id INTEGER REFERENCES batches(batch_id) ON DELETE CASCADE,
    attendance_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('present', 'absent', 'late')),
    marked_by INTEGER REFERENCES teachers(teacher_id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, batch_id, attendance_date)
);

-- =====================================================
-- 9. MAKEUP_CLASS_BOOKINGS (Catch-up classes)
-- =====================================================
CREATE TABLE makeup_class_bookings (
    booking_id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(student_id) ON DELETE CASCADE,
    original_batch_id INTEGER REFERENCES batches(batch_id),
    original_class_date DATE NOT NULL,
    makeup_batch_id INTEGER REFERENCES batches(batch_id),
    makeup_class_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' 
        CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
    approved_by INTEGER REFERENCES teachers(teacher_id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 10. FEE_STRUCTURE (with discounts and late fees)
-- =====================================================
CREATE TABLE fee_structure (
    fee_structure_id SERIAL PRIMARY KEY,
    level_id INTEGER REFERENCES levels(level_id),
    payment_window VARCHAR(20) 
        CHECK (payment_window IN ('monthly', 'quarterly', 'half_yearly', 'yearly')),
    
    -- Base amounts
    base_amount DECIMAL(10,2) NOT NULL,
    
    -- Discounts for advance payment
    discount_percentage DECIMAL(5,2) DEFAULT 0.00, -- e.g., 5% for yearly, 3% for half-yearly
    discounted_amount DECIMAL(10,2),
    
    -- Late fee structure
    late_fee_amount DECIMAL(10,2) DEFAULT 100.00,
    grace_period_days INTEGER DEFAULT 10, -- Late fee applies after 10 days
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(level_id, payment_window)
);

-- Insert default fee structure
INSERT INTO fee_structure (level_id, payment_window, base_amount, discount_percentage, discounted_amount, late_fee_amount, grace_period_days)
VALUES
-- Monthly (no discount)
(1, 'monthly', 1000.00, 0.00, 1000.00, 100.00, 10),
(2, 'monthly', 1200.00, 0.00, 1200.00, 100.00, 10),
(3, 'monthly', 1500.00, 0.00, 1500.00, 150.00, 10),
(4, 'monthly', 1500.00, 0.00, 1500.00, 150.00, 10),
(5, 'monthly', 2000.00, 0.00, 2000.00, 200.00, 10),
(6, 'monthly', 2000.00, 0.00, 2000.00, 200.00, 10),
(7, 'monthly', 2500.00, 0.00, 2500.00, 250.00, 10),
(8, 'monthly', 2500.00, 0.00, 2500.00, 250.00, 10),

-- Quarterly (2% discount)
(1, 'quarterly', 3000.00, 2.00, 2940.00, 100.00, 10),
(2, 'quarterly', 3600.00, 2.00, 3528.00, 100.00, 10),
(3, 'quarterly', 4500.00, 2.00, 4410.00, 150.00, 10),

-- Half-yearly (5% discount)
(1, 'half_yearly', 6000.00, 5.00, 5700.00, 100.00, 10),
(2, 'half_yearly', 7200.00, 5.00, 6840.00, 100.00, 10),
(3, 'half_yearly', 9000.00, 5.00, 8550.00, 150.00, 10),

-- Yearly (10% discount)
(1, 'yearly', 12000.00, 10.00, 10800.00, 100.00, 10),
(2, 'yearly', 14400.00, 10.00, 12960.00, 100.00, 10),
(3, 'yearly', 18000.00, 10.00, 16200.00, 150.00, 10);

-- =====================================================
-- 11. FEE_PAYMENTS (Track all payments)
-- =====================================================
CREATE TABLE fee_payments (
    payment_id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(student_id) ON DELETE CASCADE,
    fee_structure_id INTEGER REFERENCES fee_structure(fee_structure_id),
    
    -- Payment details
    payment_month INTEGER, -- 1-12
    payment_year INTEGER,
    amount_paid DECIMAL(10,2) NOT NULL,
    late_fee_applied DECIMAL(10,2) DEFAULT 0.00,
    total_amount DECIMAL(10,2) NOT NULL,
    
    -- Payment tracking
    payment_date DATE NOT NULL,
    due_date DATE NOT NULL,
    is_late BOOLEAN DEFAULT false,
    days_late INTEGER DEFAULT 0,
    
    payment_method VARCHAR(50) 
        CHECK (payment_method IN ('cash', 'upi', 'card', 'net_banking', 'cheque')),
    transaction_id VARCHAR(255),
    
    -- Status
    status VARCHAR(20) DEFAULT 'completed' 
        CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 12. LEARNING_RESOURCES
-- =====================================================
CREATE TABLE learning_resources (
    resource_id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    resource_type VARCHAR(50) 
        CHECK (resource_type IN ('video', 'audio', 'document', 'image')),
    file_url VARCHAR(500),
    file_size VARCHAR(50),
    level_id INTEGER REFERENCES levels(level_id),
    uploaded_by INTEGER REFERENCES teachers(teacher_id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 13. NOTICES
-- =====================================================
CREATE TABLE notices (
    notice_id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    target_audience VARCHAR(20) 
        CHECK (target_audience IN ('all', 'students', 'teachers')),
    priority VARCHAR(20) DEFAULT 'normal' 
        CHECK (priority IN ('normal', 'high')),
    expiry_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 14. EVENTS (Enhanced with full details)
-- =====================================================
CREATE TABLE events (
    event_id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Event details
    event_date DATE NOT NULL,
    event_time VARCHAR(50),
    venue_name VARCHAR(255),
    venue_address TEXT,
    organizers TEXT,
    
    -- Performance details
    performances_description TEXT, -- What was performed
    participating_students TEXT, -- Comma-separated student IDs or names
    
    -- Media
    event_photo_url VARCHAR(500),
    event_video_url VARCHAR(500),
    
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 15. GALLERY (With admin approval for students)
-- =====================================================
CREATE TABLE gallery (
    gallery_id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    media_type VARCHAR(20) CHECK (media_type IN ('photo', 'video')),
    media_url VARCHAR(500) NOT NULL,
    category VARCHAR(100),
    
    -- Upload tracking
    uploaded_by INTEGER REFERENCES users(user_id),
    uploader_role VARCHAR(20), -- student, teacher, admin
    
    is_visible BOOLEAN DEFAULT false, -- Default false for student uploads
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 16. GALLERY_REQUESTS (Student upload requests)
-- =====================================================
CREATE TABLE gallery_requests (
    request_id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(student_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    media_type VARCHAR(20) CHECK (media_type IN ('photo', 'video')),
    media_url VARCHAR(500) NOT NULL,
    category VARCHAR(100),
    
    -- Approval workflow
    status VARCHAR(20) DEFAULT 'pending' 
        CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by INTEGER REFERENCES users(user_id),
    reviewed_at TIMESTAMP,
    rejection_reason TEXT,
    
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 17. TEACHER_REVIEWS (Monthly reviews on students)
-- =====================================================
CREATE TABLE teacher_reviews (
    review_id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(student_id) ON DELETE CASCADE,
    teacher_id INTEGER REFERENCES teachers(teacher_id) ON DELETE CASCADE,
    
    -- Review period
    review_month INTEGER CHECK (review_month >= 1 AND review_month <= 12),
    review_year INTEGER,
    
    -- Structured ratings (1-5 stars each)
    technique_rating INTEGER CHECK (technique_rating >= 1 AND technique_rating <= 5),
    rhythm_rating INTEGER CHECK (rhythm_rating >= 1 AND rhythm_rating <= 5),
    creativity_rating INTEGER CHECK (creativity_rating >= 1 AND creativity_rating <= 5),
    discipline_rating INTEGER CHECK (discipline_rating >= 1 AND discipline_rating <= 5),
    
    -- Overall
    overall_rating DECIMAL(3,2),
    review_text TEXT,
    
    -- Student notification
    is_viewed_by_student BOOLEAN DEFAULT false,
    viewed_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, teacher_id, review_month, review_year)
);

-- =====================================================
-- 18. STUDENT_ACTIVITY_LOGS (Daily/weekly logs)
-- =====================================================
CREATE TABLE student_activity_logs (
    log_id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(student_id) ON DELETE CASCADE,
    log_date DATE NOT NULL,
    
    -- Activities
    activities_done TEXT, -- What student practiced
    performances TEXT, -- Any performances done
    practice_hours DECIMAL(5,2) DEFAULT 0.00,
    
    -- Notes
    notes TEXT,
    mood VARCHAR(50), -- Optional: How student felt
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, log_date)
);

-- =====================================================
-- 19. STUDENT_STATUS_CHANGES (Track discontinuation/rejoining)
-- =====================================================
CREATE TABLE student_status_changes (
    change_id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(student_id) ON DELETE CASCADE,
    
    -- Status change
    status_from VARCHAR(50), -- e.g., 'active', 'inactive'
    status_to VARCHAR(50),
    change_type VARCHAR(50) 
        CHECK (change_type IN ('enrollment', 'discontinuation', 'rejoining', 'batch_switch')),
    
    -- Reason tracking
    reason TEXT NOT NULL,
    detailed_feedback TEXT,
    
    change_date DATE DEFAULT CURRENT_DATE,
    changed_by INTEGER REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- INDEXES for better query performance
-- =====================================================
CREATE INDEX idx_students_level ON students(current_level_id);
CREATE INDEX idx_students_roll ON students(roll_number);
CREATE INDEX idx_students_active ON students(is_active);
CREATE INDEX idx_batches_teacher ON batches(teacher_id);
CREATE INDEX idx_batches_level ON batches(level_id);
CREATE INDEX idx_attendance_student ON attendance(student_id);
CREATE INDEX idx_attendance_date ON attendance(attendance_date);
CREATE INDEX idx_fee_payments_student ON fee_payments(student_id);
CREATE INDEX idx_fee_payments_date ON fee_payments(payment_date);
CREATE INDEX idx_teacher_reviews_student ON teacher_reviews(student_id);
CREATE INDEX idx_gallery_requests_status ON gallery_requests(status);

-- =====================================================
-- COMMENTS for documentation
-- =====================================================
COMMENT ON TABLE students IS 'Stores all student information with auto-generated roll numbers based on level';
COMMENT ON COLUMN students.roll_number IS 'Auto-generated format: PP1, VP15, etc. based on level_code';
COMMENT ON COLUMN students.payment_window IS 'Student preferred payment frequency with discount options';
COMMENT ON TABLE batch_transfers IS 'Tracks temporary (one-day) or permanent teacher substitutions';
COMMENT ON TABLE makeup_class_bookings IS 'Allows absent students to attend other batches for makeup';
COMMENT ON TABLE gallery_requests IS 'Student upload requests requiring admin approval';
COMMENT ON TABLE teacher_reviews IS 'Monthly structured reviews from teachers to students';

-- =====================================================
-- END OF SCHEMA
-- =====================================================
