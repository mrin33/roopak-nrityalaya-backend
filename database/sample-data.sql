-- =====================================================
-- SAMPLE TEST DATA FOR ROOPAK NRITYALAYA V2.0
-- =====================================================

-- =====================================================
-- 1. CREATE TEST USERS
-- =====================================================

-- Admin user
INSERT INTO users (email, password_hash, role, is_active) VALUES
('admin@roopak.com', '$2b$10$YourHashedPasswordHere', 'admin', true);

-- Teacher users
INSERT INTO users (email, password_hash, role, is_active) VALUES
('priya.sharma@roopak.com', '$2b$10$YourHashedPasswordHere', 'teacher', true),
('rajesh.kumar@roopak.com', '$2b$10$YourHashedPasswordHere', 'teacher', true),
('meera.iyer@roopak.com', '$2b$10$YourHashedPasswordHere', 'teacher', true),
('anil.verma@roopak.com', '$2b$10$YourHashedPasswordHere', 'teacher', true);

-- Student users (will create 20 students)
INSERT INTO users (email, password_hash, role, is_active)
SELECT 
    'student' || num || '@test.com',
    '$2b$10$YourHashedPasswordHere',
    'student',
    true
FROM generate_series(1, 20) AS num;

-- =====================================================
-- 2. CREATE TEACHERS
-- =====================================================

INSERT INTO teachers (user_id, full_name, phone, specialization, experience_years, qualifications, bio, is_senior, average_rating, total_reviews)
VALUES
(2, 'Priya Sharma', '9876543210', 'Lucknow Gharana', 15, 'MA in Kathak, Visharad', 'Expert in Lucknow Gharana style with 15 years of teaching experience', true, 4.8, 45),
(3, 'Rajesh Kumar', '9876543211', 'Jaipur Gharana', 12, 'MA in Kathak, Visharad Purna', 'Specialized in Jaipur Gharana technique', true, 4.7, 38),
(4, 'Meera Iyer', '9876543212', 'Kathak Classical', 10, 'Visharad', 'Focus on classical Kathak forms and expressions', false, 4.6, 25),
(5, 'Anil Verma', '9876543213', 'Banaras Gharana', 8, 'Madhyama Purna', 'Teaching Banaras Gharana style', false, 4.5, 20);

-- =====================================================
-- 3. CREATE STUDENTS (With auto-generated roll numbers!)
-- =====================================================

-- Praveshika Pratham students (will get PP1, PP2, PP3...)
INSERT INTO students (user_id, full_name, phone, date_of_birth, gender, address, current_level_id, payment_window, enrollment_reason)
VALUES
(6, 'Riya Sharma', '9876540001', '2010-05-15', 'Female', 'Pune, Maharashtra', 1, 'monthly', 'Interested in learning traditional dance'),
(7, 'Amit Kumar', '9876540002', '2011-08-22', 'Male', 'Pune, Maharashtra', 1, 'quarterly', 'Parents recommendation'),
(8, 'Priya Patel', '9876540003', '2010-11-10', 'Female', 'Pune, Maharashtra', 1, 'monthly', 'Passion for Kathak'),
(9, 'Rahul Singh', '9876540004', '2012-03-18', 'Male', 'Pune, Maharashtra', 1, 'half_yearly', 'School cultural program'),
(10, 'Sneha Gupta', '9876540005', '2011-07-25', 'Female', 'Pune, Maharashtra', 1, 'yearly', 'Family tradition of dance');

-- Praveshika Purna students (will get PM1, PM2, PM3...)
INSERT INTO students (user_id, full_name, phone, date_of_birth, gender, address, current_level_id, payment_window, enrollment_reason)
VALUES
(11, 'Arjun Reddy', '9876540006', '2009-12-08', 'Male', 'Pune, Maharashtra', 2, 'monthly', 'Upgrading from PP level'),
(12, 'Ananya Iyer', '9876540007', '2010-04-20', 'Female', 'Pune, Maharashtra', 2, 'quarterly', 'Continued learning'),
(13, 'Karan Mehta', '9876540008', '2010-09-15', 'Male', 'Pune, Maharashtra', 2, 'monthly', 'Performance interest');

-- Madhyama Pratham students (will get MP1, MP2...)
INSERT INTO students (user_id, full_name, phone, date_of_birth, gender, address, current_level_id, payment_window, enrollment_reason)
VALUES
(14, 'Divya Shah', '9876540009', '2008-06-12', 'Female', 'Pune, Maharashtra', 3, 'half_yearly', 'Professional training goal'),
(15, 'Rohan Desai', '9876540010', '2009-01-30', 'Male', 'Pune, Maharashtra', 3, 'monthly', 'Cultural preservation'),
(16, 'Meera Nair', '9876540011', '2008-10-05', 'Female', 'Pune, Maharashtra', 3, 'yearly', 'Serious dancer'),
(17, 'Vikram Joshi', '9876540012', '2009-07-18', 'Male', 'Pune, Maharashtra', 3, 'quarterly', 'Family encouragement');

-- Madhyama Purna students (will get MM1, MM2...)
INSERT INTO students (user_id, full_name, phone, date_of_birth, gender, address, current_level_id, payment_window, enrollment_reason)
VALUES
(18, 'Aditi Verma', '9876540013', '2007-03-22', 'Female', 'Pune, Maharashtra', 4, 'yearly', 'Preparing for professional career'),
(19, 'Kunal Kapoor', '9876540014', '2008-11-08', 'Male', 'Pune, Maharashtra', 4, 'half_yearly', 'Advanced training');

-- Visharad Pratham students (will get VP1, VP2...)
INSERT INTO students (user_id, full_name, phone, date_of_birth, gender, address, current_level_id, payment_window, enrollment_reason)
VALUES
(20, 'Simran Kaur', '9876540015', '2006-08-15', 'Female', 'Pune, Maharashtra', 5, 'yearly', 'Advanced performer'),
(21, 'Tanvi Malhotra', '9876540016', '2007-02-28', 'Female', 'Pune, Maharashtra', 5, 'yearly', 'Professional training'),
(22, 'Aditya Rao', '9876540017', '2006-12-10', 'Male', 'Pune, Maharashtra', 5, 'half_yearly', 'Expert level goal');

-- Visharad Purna students (will get VM1, VM2...)
INSERT INTO students (user_id, full_name, phone, date_of_birth, gender, address, current_level_id, payment_window, enrollment_reason)
VALUES
(23, 'Isha Chatterjee', '9876540018', '2005-05-20', 'Female', 'Pune, Maharashtra', 6, 'yearly', 'Near completion of training'),
(24, 'Aryan Sinha', '9876540019', '2006-09-12', 'Male', 'Pune, Maharashtra', 6, 'yearly', 'Pursuing mastery');

-- Alankar Pratham student (will get AP1)
INSERT INTO students (user_id, full_name, phone, date_of_birth, gender, address, current_level_id, payment_window, enrollment_reason)
VALUES
(25, 'Kavya Krishnan', '9876540020', '2004-07-18', 'Female', 'Pune, Maharashtra', 7, 'yearly', 'Expert level dancer');

-- =====================================================
-- 4. CREATE BATCHES
-- =====================================================

INSERT INTO batches (batch_name, level_id, teacher_id, schedule, time, room, max_students, is_active, start_date)
VALUES
-- Praveshika Pratham batches
('Morning Batch A', 1, 1, 'Mon, Wed, Fri', '8:00 AM - 9:30 AM', 'Studio 1', 15, true, '2025-09-01'),
('Evening Batch B', 1, 2, 'Tue, Thu, Sat', '5:00 PM - 6:30 PM', 'Studio 2', 15, true, '2025-09-01'),

-- Praveshika Purna batch
('Weekend Special', 2, 1, 'Sat, Sun', '10:00 AM - 11:30 AM', 'Studio 1', 15, true, '2025-09-01'),

-- Madhyama batches
('Intermediate Batch', 3, 3, 'Mon, Wed, Fri', '6:00 PM - 7:30 PM', 'Main Hall', 15, true, '2025-08-15'),
('Advanced Evening', 4, 3, 'Tue, Thu', '7:00 PM - 8:30 PM', 'Main Hall', 12, true, '2025-08-15'),

-- Visharad batches
('Expert Morning', 5, 2, 'Mon, Wed, Fri', '7:00 AM - 8:30 AM', 'Studio 2', 10, true, '2025-07-01'),
('Master Class', 6, 4, 'Tue, Thu', '6:00 AM - 7:30 AM', 'Main Hall', 8, true, '2025-07-01');

-- =====================================================
-- 5. ENROLL STUDENTS IN BATCHES
-- =====================================================

-- Morning Batch A (PP students)
INSERT INTO student_batches (student_id, batch_id, is_active) VALUES
(1, 1, true), (2, 1, true), (3, 1, true), (4, 1, true);

-- Evening Batch B (PP student)
INSERT INTO student_batches (student_id, batch_id, is_active) VALUES
(5, 2, true);

-- Weekend Special (PM students)
INSERT INTO student_batches (student_id, batch_id, is_active) VALUES
(6, 3, true), (7, 3, true), (8, 3, true);

-- Intermediate Batch (MP students)
INSERT INTO student_batches (student_id, batch_id, is_active) VALUES
(9, 4, true), (10, 4, true), (11, 4, true), (12, 4, true);

-- Advanced Evening (MM students)
INSERT INTO student_batches (student_id, batch_id, is_active) VALUES
(13, 5, true), (14, 5, true);

-- Expert Morning (VP students)
INSERT INTO student_batches (student_id, batch_id, is_active) VALUES
(15, 6, true), (16, 6, true), (17, 6, true);

-- Master Class (VM students)
INSERT INTO student_batches (student_id, batch_id, is_active) VALUES
(18, 7, true), (19, 7, true);

-- =====================================================
-- 6. ADD SAMPLE ATTENDANCE RECORDS
-- =====================================================

-- Morning Batch A attendance for last 10 days
INSERT INTO attendance (student_id, batch_id, attendance_date, status, marked_by)
SELECT 
    s.student_id,
    1 as batch_id,
    CURRENT_DATE - (num || ' days')::INTERVAL as attendance_date,
    CASE WHEN RANDOM() < 0.9 THEN 'present' WHEN RANDOM() < 0.95 THEN 'late' ELSE 'absent' END as status,
    1 as teacher_id
FROM (SELECT student_id FROM student_batches WHERE batch_id = 1) s
CROSS JOIN generate_series(1, 10) num;

-- =====================================================
-- 7. ADD SAMPLE FEE PAYMENTS
-- =====================================================

-- January 2026 payments
INSERT INTO fee_payments (student_id, fee_structure_id, payment_month, payment_year, amount_paid, late_fee_applied, total_amount, payment_date, due_date, is_late, payment_method, status)
SELECT 
    s.student_id,
    fs.fee_structure_id,
    1 as payment_month,
    2026 as payment_year,
    fs.discounted_amount,
    0.00 as late_fee_applied,
    fs.discounted_amount as total_amount,
    '2026-01-03'::DATE as payment_date,
    '2026-01-05'::DATE as due_date,
    false as is_late,
    CASE WHEN RANDOM() < 0.5 THEN 'upi' ELSE 'cash' END as payment_method,
    'completed' as status
FROM students s
JOIN fee_structure fs ON s.current_level_id = fs.level_id AND s.payment_window = fs.payment_window
WHERE s.student_id <= 15; -- First 15 students paid

-- February 2026 - Some pending
INSERT INTO fee_payments (student_id, fee_structure_id, payment_month, payment_year, amount_paid, late_fee_applied, total_amount, payment_date, due_date, is_late, payment_method, status)
SELECT 
    s.student_id,
    fs.fee_structure_id,
    2 as payment_month,
    2026 as payment_year,
    0.00 as amount_paid,
    0.00 as late_fee_applied,
    fs.discounted_amount as total_amount,
    NULL as payment_date,
    '2026-02-05'::DATE as due_date,
    false as is_late,
    NULL as payment_method,
    'pending' as status
FROM students s
JOIN fee_structure fs ON s.current_level_id = fs.level_id AND s.payment_window = fs.payment_window
WHERE s.student_id > 15; -- Remaining students have pending fees

-- =====================================================
-- 8. ADD SAMPLE NOTICES
-- =====================================================

INSERT INTO notices (title, description, target_audience, priority, expiry_date, created_by)
VALUES
('Annual Day Performance Registration', 'Registration for Annual Day 2026 is now open. Contact your batch teacher.', 'all', 'high', '2026-03-01', 1),
('Level Examinations - March 2026', 'Level examinations scheduled for March 15-20, 2026. Prepare well!', 'students', 'high', '2026-03-20', 1),
('Teacher Workshop', 'Advanced technique workshop on Feb 15, 2026 at 9 AM.', 'teachers', 'normal', '2026-02-15', 1),
('Academy Holiday - Holi', 'Academy will be closed on March 25-26 for Holi celebrations.', 'all', 'normal', '2026-03-26', 1);

-- =====================================================
-- 9. ADD SAMPLE EVENTS
-- =====================================================

INSERT INTO events (title, description, event_date, event_time, venue_name, venue_address, organizers, performances_description, created_by)
VALUES
('Annual Day 2025', 'Grand celebration of Kathak performances by all levels', '2025-12-15', '6:00 PM', 'Shaniwar Wada', 'Shaniwar Peth, Pune', 'Roopak Nrityalaya Academy', 'Various Kathak performances including Tarana, Thumri, and group performances', 1),
('Guru Purnima Celebration', 'Special event honoring our teachers', '2025-07-13', '10:00 AM', 'Academy Main Hall', 'Pune', 'Students and Management', 'Student tribute performances and award ceremony', 1);

-- =====================================================
-- 10. ADD SAMPLE TEACHER REVIEWS
-- =====================================================

INSERT INTO teacher_reviews (student_id, teacher_id, review_month, review_year, technique_rating, rhythm_rating, creativity_rating, discipline_rating, overall_rating, review_text)
VALUES
(1, 1, 1, 2026, 4, 5, 4, 5, 4.5, 'Excellent progress in footwork. Keep practicing taal patterns.'),
(2, 1, 1, 2026, 3, 4, 3, 4, 3.5, 'Good improvement. Focus more on hand gestures.'),
(3, 1, 1, 2026, 5, 5, 4, 5, 4.75, 'Outstanding performance. Very dedicated student.'),
(9, 3, 1, 2026, 4, 4, 5, 4, 4.25, 'Creative expressions. Good understanding of rhythm.'),
(10, 3, 1, 2026, 4, 3, 4, 3, 3.5, 'Needs to improve attendance and practice consistency.');

-- =====================================================
-- 11. ADD SAMPLE ACTIVITY LOGS
-- =====================================================

INSERT INTO student_activity_logs (student_id, log_date, activities_done, practice_hours, notes)
VALUES
(1, '2026-02-01', 'Practiced Teen Taal variations, footwork drills', 2.5, 'Feeling confident with the new composition'),
(1, '2026-02-02', 'Hand gesture practice, Thumri practice', 2.0, 'Need to work on expressions'),
(3, '2026-02-01', 'Group practice for annual day, solo piece rehearsal', 3.0, 'Great session!'),
(15, '2026-02-01', 'Advanced chakkars, Tarana composition', 2.5, 'Working on speed and precision');

-- =====================================================
-- 12. ADD SAMPLE GALLERY REQUESTS
-- =====================================================

INSERT INTO gallery_requests (student_id, title, description, media_type, media_url, category, status)
VALUES
(1, 'My First Performance', 'Annual Day 2025 performance photo', 'photo', '/uploads/student1_performance.jpg', 'Performances', 'pending'),
(3, 'Practice Session', 'Our batch practicing for competition', 'photo', '/uploads/batch_practice.jpg', 'Practice', 'approved'),
(15, 'Solo Tarana', 'Video of my Tarana performance', 'video', '/uploads/tarana_solo.mp4', 'Performances', 'pending');

-- =====================================================
-- 13. VERIFY DATA
-- =====================================================

-- Check students with auto-generated roll numbers
SELECT student_id, roll_number, full_name, current_level_id 
FROM students 
ORDER BY roll_number;

-- Check batch enrollments
SELECT 
    b.batch_name,
    b.current_enrolled,
    b.max_students,
    (b.max_students - b.current_enrolled) as available_seats
FROM batches b
ORDER BY b.batch_name;

-- Check fee payment summary
SELECT 
    COUNT(*) FILTER (WHERE status = 'completed') as paid,
    COUNT(*) FILTER (WHERE status = 'pending') as pending,
    SUM(total_amount) FILTER (WHERE status = 'completed') as total_collected
FROM fee_payments;

-- =====================================================
-- SAMPLE DATA INSERTED SUCCESSFULLY!
-- =====================================================
