-- 0001 baseline: schema of the production database as dumped on 2026-04-06
-- (pg_dump 18.1, schema only). Source of truth for the existing structure.
--
-- On an EXISTING database this migration is recorded as applied without
-- being executed (see db/migrate.js). It only runs on an empty database.

--
-- PostgreSQL database dump
--

-- Dumped from database version 18.1
-- Dumped by pg_dump version 18.1

--
-- Name: check_batch_capacity(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_batch_capacity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;

--
-- Name: generate_roll_number(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.generate_roll_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
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
$_$;

--
-- Name: update_batch_enrollment(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_batch_enrollment() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;

--
-- Name: attendance; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attendance (
    attendance_id integer NOT NULL,
    student_id integer,
    batch_id integer,
    attendance_date date NOT NULL,
    status character varying(20) NOT NULL,
    marked_by integer,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT attendance_status_check CHECK (((status)::text = ANY ((ARRAY['present'::character varying, 'absent'::character varying, 'late'::character varying])::text[])))
);

--
-- Name: attendance_attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.attendance_attendance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: attendance_attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.attendance_attendance_id_seq OWNED BY public.attendance.attendance_id;

--
-- Name: batch_transfers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.batch_transfers (
    transfer_id integer NOT NULL,
    batch_id integer,
    from_teacher_id integer,
    to_teacher_id integer,
    transfer_date date NOT NULL,
    reason text,
    is_permanent boolean DEFAULT false,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

--
-- Name: TABLE batch_transfers; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.batch_transfers IS 'Tracks temporary (one-day) or permanent teacher substitutions';

--
-- Name: batch_transfers_transfer_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.batch_transfers_transfer_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: batch_transfers_transfer_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.batch_transfers_transfer_id_seq OWNED BY public.batch_transfers.transfer_id;

--
-- Name: batches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.batches (
    batch_id integer NOT NULL,
    batch_name character varying(255) NOT NULL,
    level_id integer,
    teacher_id integer,
    schedule character varying(100),
    "time" character varying(50),
    room character varying(100),
    max_students integer DEFAULT 15,
    current_enrolled integer DEFAULT 0,
    is_active boolean DEFAULT true,
    start_date date,
    end_date date,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT batches_max_students_check CHECK (((max_students > 0) AND (max_students <= 15)))
);

--
-- Name: batches_batch_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.batches_batch_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: batches_batch_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.batches_batch_id_seq OWNED BY public.batches.batch_id;

--
-- Name: events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.events (
    event_id integer NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    event_date date NOT NULL,
    event_time character varying(50),
    venue_name character varying(255),
    venue_address text,
    organizers text,
    performances_description text,
    participating_students text,
    event_photo_url character varying(500),
    event_video_url character varying(500),
    is_active boolean DEFAULT true,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

--
-- Name: events_event_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.events_event_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: events_event_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.events_event_id_seq OWNED BY public.events.event_id;

--
-- Name: fee_payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fee_payments (
    payment_id integer NOT NULL,
    student_id integer,
    fee_structure_id integer,
    payment_month integer,
    payment_year integer,
    amount_paid numeric(10,2) NOT NULL,
    late_fee_applied numeric(10,2) DEFAULT 0.00,
    total_amount numeric(10,2) NOT NULL,
    payment_date date NOT NULL,
    due_date date NOT NULL,
    is_late boolean DEFAULT false,
    days_late integer DEFAULT 0,
    payment_method character varying(50),
    transaction_id character varying(255),
    status character varying(20) DEFAULT 'completed'::character varying,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fee_payments_payment_method_check CHECK (((payment_method)::text = ANY ((ARRAY['cash'::character varying, 'upi'::character varying, 'card'::character varying, 'net_banking'::character varying, 'cheque'::character varying])::text[]))),
    CONSTRAINT fee_payments_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'completed'::character varying, 'failed'::character varying, 'refunded'::character varying])::text[])))
);

--
-- Name: fee_payments_payment_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.fee_payments_payment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: fee_payments_payment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.fee_payments_payment_id_seq OWNED BY public.fee_payments.payment_id;

--
-- Name: fee_structure; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fee_structure (
    fee_structure_id integer NOT NULL,
    level_id integer,
    payment_window character varying(20),
    base_amount numeric(10,2) NOT NULL,
    discount_percentage numeric(5,2) DEFAULT 0.00,
    discounted_amount numeric(10,2),
    late_fee_amount numeric(10,2) DEFAULT 100.00,
    grace_period_days integer DEFAULT 10,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fee_structure_payment_window_check CHECK (((payment_window)::text = ANY ((ARRAY['monthly'::character varying, 'quarterly'::character varying, 'half_yearly'::character varying, 'yearly'::character varying])::text[])))
);

--
-- Name: fee_structure_fee_structure_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.fee_structure_fee_structure_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: fee_structure_fee_structure_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.fee_structure_fee_structure_id_seq OWNED BY public.fee_structure.fee_structure_id;

--
-- Name: gallery; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gallery (
    gallery_id integer NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    media_type character varying(20),
    media_url character varying(500) NOT NULL,
    category character varying(100),
    uploaded_by integer,
    uploader_role character varying(20),
    is_visible boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT gallery_media_type_check CHECK (((media_type)::text = ANY ((ARRAY['photo'::character varying, 'video'::character varying])::text[])))
);

--
-- Name: gallery_gallery_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.gallery_gallery_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: gallery_gallery_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.gallery_gallery_id_seq OWNED BY public.gallery.gallery_id;

--
-- Name: gallery_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gallery_requests (
    request_id integer NOT NULL,
    student_id integer,
    title character varying(255) NOT NULL,
    description text,
    media_type character varying(20),
    media_url character varying(500) NOT NULL,
    category character varying(100),
    status character varying(20) DEFAULT 'pending'::character varying,
    reviewed_by integer,
    reviewed_at timestamp without time zone,
    rejection_reason text,
    requested_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT gallery_requests_media_type_check CHECK (((media_type)::text = ANY ((ARRAY['photo'::character varying, 'video'::character varying])::text[]))),
    CONSTRAINT gallery_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])))
);

--
-- Name: TABLE gallery_requests; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.gallery_requests IS 'Student upload requests requiring admin approval';

--
-- Name: gallery_requests_request_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.gallery_requests_request_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: gallery_requests_request_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.gallery_requests_request_id_seq OWNED BY public.gallery_requests.request_id;

--
-- Name: learning_resources; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.learning_resources (
    resource_id integer NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    resource_type character varying(50),
    file_url character varying(500),
    file_size character varying(50),
    level_id integer,
    uploaded_by integer,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT learning_resources_resource_type_check CHECK (((resource_type)::text = ANY ((ARRAY['video'::character varying, 'audio'::character varying, 'document'::character varying, 'image'::character varying])::text[])))
);

--
-- Name: learning_resources_resource_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.learning_resources_resource_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: learning_resources_resource_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.learning_resources_resource_id_seq OWNED BY public.learning_resources.resource_id;

--
-- Name: levels; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.levels (
    level_id integer NOT NULL,
    level_name character varying(100) NOT NULL,
    level_number integer NOT NULL,
    level_code character varying(10) NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

--
-- Name: levels_level_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.levels_level_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: levels_level_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.levels_level_id_seq OWNED BY public.levels.level_id;

--
-- Name: makeup_class_bookings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.makeup_class_bookings (
    booking_id integer NOT NULL,
    student_id integer,
    original_batch_id integer,
    original_class_date date NOT NULL,
    makeup_batch_id integer,
    makeup_class_date date NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    approved_by integer,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT makeup_class_bookings_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'completed'::character varying])::text[])))
);

--
-- Name: TABLE makeup_class_bookings; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.makeup_class_bookings IS 'Allows absent students to attend other batches for makeup';

--
-- Name: makeup_class_bookings_booking_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.makeup_class_bookings_booking_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: makeup_class_bookings_booking_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.makeup_class_bookings_booking_id_seq OWNED BY public.makeup_class_bookings.booking_id;

--
-- Name: notices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notices (
    notice_id integer NOT NULL,
    title character varying(255) NOT NULL,
    description text NOT NULL,
    target_audience character varying(20),
    priority character varying(20) DEFAULT 'normal'::character varying,
    expiry_date date,
    is_active boolean DEFAULT true,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT notices_priority_check CHECK (((priority)::text = ANY ((ARRAY['normal'::character varying, 'high'::character varying])::text[]))),
    CONSTRAINT notices_target_audience_check CHECK (((target_audience)::text = ANY ((ARRAY['all'::character varying, 'students'::character varying, 'teachers'::character varying])::text[])))
);

--
-- Name: notices_notice_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.notices_notice_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: notices_notice_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.notices_notice_id_seq OWNED BY public.notices.notice_id;

--
-- Name: student_activity_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.student_activity_logs (
    log_id integer NOT NULL,
    student_id integer,
    log_date date NOT NULL,
    activities_done text,
    performances text,
    practice_hours numeric(5,2) DEFAULT 0.00,
    notes text,
    mood character varying(50),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

--
-- Name: student_activity_logs_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.student_activity_logs_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: student_activity_logs_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.student_activity_logs_log_id_seq OWNED BY public.student_activity_logs.log_id;

--
-- Name: student_batches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.student_batches (
    student_batch_id integer NOT NULL,
    student_id integer,
    batch_id integer,
    joined_date date DEFAULT CURRENT_DATE,
    left_date date,
    is_active boolean DEFAULT true,
    switching_reason text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

--
-- Name: student_batches_student_batch_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.student_batches_student_batch_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: student_batches_student_batch_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.student_batches_student_batch_id_seq OWNED BY public.student_batches.student_batch_id;

--
-- Name: student_status_changes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.student_status_changes (
    change_id integer NOT NULL,
    student_id integer,
    status_from character varying(50),
    status_to character varying(50),
    change_type character varying(50),
    reason text NOT NULL,
    detailed_feedback text,
    change_date date DEFAULT CURRENT_DATE,
    changed_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT student_status_changes_change_type_check CHECK (((change_type)::text = ANY ((ARRAY['enrollment'::character varying, 'discontinuation'::character varying, 'rejoining'::character varying, 'batch_switch'::character varying])::text[])))
);

--
-- Name: student_status_changes_change_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.student_status_changes_change_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: student_status_changes_change_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.student_status_changes_change_id_seq OWNED BY public.student_status_changes.change_id;

--
-- Name: students; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.students (
    student_id integer NOT NULL,
    user_id integer,
    full_name character varying(255) NOT NULL,
    phone character varying(20),
    date_of_birth date,
    gender character varying(20),
    address text,
    emergency_contact character varying(20),
    emergency_contact_name character varying(255),
    current_level_id integer,
    roll_number character varying(20),
    payment_window character varying(20) DEFAULT 'monthly'::character varying,
    enrollment_date date DEFAULT CURRENT_DATE,
    enrollment_reason text,
    total_performances integer DEFAULT 0,
    total_exams_attended integer DEFAULT 0,
    total_practice_hours numeric(10,2) DEFAULT 0.00,
    attendance_percentage numeric(5,2) DEFAULT 0.00,
    is_active boolean DEFAULT true,
    discontinuation_date date,
    discontinuation_reason text,
    profile_photo_url character varying(500),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT students_payment_window_check CHECK (((payment_window)::text = ANY ((ARRAY['monthly'::character varying, 'quarterly'::character varying, 'half_yearly'::character varying, 'yearly'::character varying])::text[])))
);

--
-- Name: TABLE students; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.students IS 'Stores all student information with auto-generated roll numbers based on level';

--
-- Name: COLUMN students.roll_number; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.students.roll_number IS 'Auto-generated format: PP1, VP15, etc. based on level_code';

--
-- Name: COLUMN students.payment_window; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.students.payment_window IS 'Student preferred payment frequency with discount options';

--
-- Name: students_student_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.students_student_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: students_student_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.students_student_id_seq OWNED BY public.students.student_id;

--
-- Name: teacher_reviews; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.teacher_reviews (
    review_id integer NOT NULL,
    student_id integer,
    teacher_id integer,
    review_month integer,
    review_year integer,
    technique_rating integer,
    rhythm_rating integer,
    creativity_rating integer,
    discipline_rating integer,
    overall_rating numeric(3,2),
    review_text text,
    is_viewed_by_student boolean DEFAULT false,
    viewed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT teacher_reviews_creativity_rating_check CHECK (((creativity_rating >= 1) AND (creativity_rating <= 5))),
    CONSTRAINT teacher_reviews_discipline_rating_check CHECK (((discipline_rating >= 1) AND (discipline_rating <= 5))),
    CONSTRAINT teacher_reviews_review_month_check CHECK (((review_month >= 1) AND (review_month <= 12))),
    CONSTRAINT teacher_reviews_rhythm_rating_check CHECK (((rhythm_rating >= 1) AND (rhythm_rating <= 5))),
    CONSTRAINT teacher_reviews_technique_rating_check CHECK (((technique_rating >= 1) AND (technique_rating <= 5)))
);

--
-- Name: TABLE teacher_reviews; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.teacher_reviews IS 'Monthly structured reviews from teachers to students';

--
-- Name: teacher_reviews_review_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.teacher_reviews_review_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: teacher_reviews_review_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.teacher_reviews_review_id_seq OWNED BY public.teacher_reviews.review_id;

--
-- Name: teachers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.teachers (
    teacher_id integer NOT NULL,
    user_id integer,
    full_name character varying(255) NOT NULL,
    phone character varying(20),
    specialization character varying(255),
    experience_years integer DEFAULT 0,
    qualifications text,
    bio text,
    average_rating numeric(3,2) DEFAULT 0.00,
    total_reviews integer DEFAULT 0,
    total_students_taught integer DEFAULT 0,
    is_senior boolean DEFAULT false,
    profile_photo_url character varying(500),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT teachers_average_rating_check CHECK (((average_rating >= (0)::numeric) AND (average_rating <= (5)::numeric)))
);

--
-- Name: teachers_teacher_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.teachers_teacher_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: teachers_teacher_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.teachers_teacher_id_seq OWNED BY public.teachers.teacher_id;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    user_id integer NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(20) NOT NULL,
    is_active boolean DEFAULT true,
    last_login timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['student'::character varying, 'teacher'::character varying, 'admin'::character varying])::text[])))
);

--
-- Name: users_user_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: users_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_user_id_seq OWNED BY public.users.user_id;

--
-- Name: attendance attendance_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance ALTER COLUMN attendance_id SET DEFAULT nextval('public.attendance_attendance_id_seq'::regclass);

--
-- Name: batch_transfers transfer_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.batch_transfers ALTER COLUMN transfer_id SET DEFAULT nextval('public.batch_transfers_transfer_id_seq'::regclass);

--
-- Name: batches batch_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.batches ALTER COLUMN batch_id SET DEFAULT nextval('public.batches_batch_id_seq'::regclass);

--
-- Name: events event_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events ALTER COLUMN event_id SET DEFAULT nextval('public.events_event_id_seq'::regclass);

--
-- Name: fee_payments payment_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_payments ALTER COLUMN payment_id SET DEFAULT nextval('public.fee_payments_payment_id_seq'::regclass);

--
-- Name: fee_structure fee_structure_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_structure ALTER COLUMN fee_structure_id SET DEFAULT nextval('public.fee_structure_fee_structure_id_seq'::regclass);

--
-- Name: gallery gallery_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gallery ALTER COLUMN gallery_id SET DEFAULT nextval('public.gallery_gallery_id_seq'::regclass);

--
-- Name: gallery_requests request_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gallery_requests ALTER COLUMN request_id SET DEFAULT nextval('public.gallery_requests_request_id_seq'::regclass);

--
-- Name: learning_resources resource_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learning_resources ALTER COLUMN resource_id SET DEFAULT nextval('public.learning_resources_resource_id_seq'::regclass);

--
-- Name: levels level_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.levels ALTER COLUMN level_id SET DEFAULT nextval('public.levels_level_id_seq'::regclass);

--
-- Name: makeup_class_bookings booking_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.makeup_class_bookings ALTER COLUMN booking_id SET DEFAULT nextval('public.makeup_class_bookings_booking_id_seq'::regclass);

--
-- Name: notices notice_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notices ALTER COLUMN notice_id SET DEFAULT nextval('public.notices_notice_id_seq'::regclass);

--
-- Name: student_activity_logs log_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_activity_logs ALTER COLUMN log_id SET DEFAULT nextval('public.student_activity_logs_log_id_seq'::regclass);

--
-- Name: student_batches student_batch_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_batches ALTER COLUMN student_batch_id SET DEFAULT nextval('public.student_batches_student_batch_id_seq'::regclass);

--
-- Name: student_status_changes change_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_status_changes ALTER COLUMN change_id SET DEFAULT nextval('public.student_status_changes_change_id_seq'::regclass);

--
-- Name: students student_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students ALTER COLUMN student_id SET DEFAULT nextval('public.students_student_id_seq'::regclass);

--
-- Name: teacher_reviews review_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher_reviews ALTER COLUMN review_id SET DEFAULT nextval('public.teacher_reviews_review_id_seq'::regclass);

--
-- Name: teachers teacher_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teachers ALTER COLUMN teacher_id SET DEFAULT nextval('public.teachers_teacher_id_seq'::regclass);

--
-- Name: users user_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN user_id SET DEFAULT nextval('public.users_user_id_seq'::regclass);

--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (attendance_id);

--
-- Name: attendance attendance_student_id_batch_id_attendance_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_student_id_batch_id_attendance_date_key UNIQUE (student_id, batch_id, attendance_date);

--
-- Name: batch_transfers batch_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.batch_transfers
    ADD CONSTRAINT batch_transfers_pkey PRIMARY KEY (transfer_id);

--
-- Name: batches batches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_pkey PRIMARY KEY (batch_id);

--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (event_id);

--
-- Name: fee_payments fee_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_payments
    ADD CONSTRAINT fee_payments_pkey PRIMARY KEY (payment_id);

--
-- Name: fee_structure fee_structure_level_id_payment_window_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_structure
    ADD CONSTRAINT fee_structure_level_id_payment_window_key UNIQUE (level_id, payment_window);

--
-- Name: fee_structure fee_structure_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_structure
    ADD CONSTRAINT fee_structure_pkey PRIMARY KEY (fee_structure_id);

--
-- Name: gallery gallery_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gallery
    ADD CONSTRAINT gallery_pkey PRIMARY KEY (gallery_id);

--
-- Name: gallery_requests gallery_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gallery_requests
    ADD CONSTRAINT gallery_requests_pkey PRIMARY KEY (request_id);

--
-- Name: learning_resources learning_resources_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learning_resources
    ADD CONSTRAINT learning_resources_pkey PRIMARY KEY (resource_id);

--
-- Name: levels levels_level_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.levels
    ADD CONSTRAINT levels_level_code_key UNIQUE (level_code);

--
-- Name: levels levels_level_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.levels
    ADD CONSTRAINT levels_level_number_key UNIQUE (level_number);

--
-- Name: levels levels_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.levels
    ADD CONSTRAINT levels_pkey PRIMARY KEY (level_id);

--
-- Name: makeup_class_bookings makeup_class_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.makeup_class_bookings
    ADD CONSTRAINT makeup_class_bookings_pkey PRIMARY KEY (booking_id);

--
-- Name: notices notices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notices
    ADD CONSTRAINT notices_pkey PRIMARY KEY (notice_id);

--
-- Name: student_activity_logs student_activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_activity_logs
    ADD CONSTRAINT student_activity_logs_pkey PRIMARY KEY (log_id);

--
-- Name: student_activity_logs student_activity_logs_student_id_log_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_activity_logs
    ADD CONSTRAINT student_activity_logs_student_id_log_date_key UNIQUE (student_id, log_date);

--
-- Name: student_batches student_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_batches
    ADD CONSTRAINT student_batches_pkey PRIMARY KEY (student_batch_id);

--
-- Name: student_batches student_batches_student_id_batch_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_batches
    ADD CONSTRAINT student_batches_student_id_batch_id_key UNIQUE (student_id, batch_id);

--
-- Name: student_status_changes student_status_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_status_changes
    ADD CONSTRAINT student_status_changes_pkey PRIMARY KEY (change_id);

--
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (student_id);

--
-- Name: students students_roll_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_roll_number_key UNIQUE (roll_number);

--
-- Name: teacher_reviews teacher_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher_reviews
    ADD CONSTRAINT teacher_reviews_pkey PRIMARY KEY (review_id);

--
-- Name: teacher_reviews teacher_reviews_student_id_teacher_id_review_month_review_y_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher_reviews
    ADD CONSTRAINT teacher_reviews_student_id_teacher_id_review_month_review_y_key UNIQUE (student_id, teacher_id, review_month, review_year);

--
-- Name: teachers teachers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_pkey PRIMARY KEY (teacher_id);

--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);

--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);

--
-- Name: idx_attendance_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attendance_date ON public.attendance USING btree (attendance_date);

--
-- Name: idx_attendance_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attendance_student ON public.attendance USING btree (student_id);

--
-- Name: idx_batches_level; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_batches_level ON public.batches USING btree (level_id);

--
-- Name: idx_batches_teacher; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_batches_teacher ON public.batches USING btree (teacher_id);

--
-- Name: idx_fee_payments_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fee_payments_date ON public.fee_payments USING btree (payment_date);

--
-- Name: idx_fee_payments_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fee_payments_student ON public.fee_payments USING btree (student_id);

--
-- Name: idx_gallery_requests_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_gallery_requests_status ON public.gallery_requests USING btree (status);

--
-- Name: idx_students_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_students_active ON public.students USING btree (is_active);

--
-- Name: idx_students_level; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_students_level ON public.students USING btree (current_level_id);

--
-- Name: idx_students_roll; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_students_roll ON public.students USING btree (roll_number);

--
-- Name: idx_teacher_reviews_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_teacher_reviews_student ON public.teacher_reviews USING btree (student_id);

--
-- Name: student_batches enforce_batch_capacity; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER enforce_batch_capacity BEFORE INSERT OR UPDATE ON public.student_batches FOR EACH ROW EXECUTE FUNCTION public.check_batch_capacity();

--
-- Name: students student_roll_number_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER student_roll_number_trigger BEFORE INSERT ON public.students FOR EACH ROW EXECUTE FUNCTION public.generate_roll_number();

--
-- Name: student_batches update_batch_count_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_batch_count_trigger AFTER INSERT OR DELETE OR UPDATE ON public.student_batches FOR EACH ROW EXECUTE FUNCTION public.update_batch_enrollment();

--
-- Name: attendance attendance_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(batch_id) ON DELETE CASCADE;

--
-- Name: attendance attendance_marked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_marked_by_fkey FOREIGN KEY (marked_by) REFERENCES public.teachers(teacher_id);

--
-- Name: attendance attendance_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id) ON DELETE CASCADE;

--
-- Name: batch_transfers batch_transfers_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.batch_transfers
    ADD CONSTRAINT batch_transfers_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(batch_id) ON DELETE CASCADE;

--
-- Name: batch_transfers batch_transfers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.batch_transfers
    ADD CONSTRAINT batch_transfers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id);

--
-- Name: batch_transfers batch_transfers_from_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.batch_transfers
    ADD CONSTRAINT batch_transfers_from_teacher_id_fkey FOREIGN KEY (from_teacher_id) REFERENCES public.teachers(teacher_id);

--
-- Name: batch_transfers batch_transfers_to_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.batch_transfers
    ADD CONSTRAINT batch_transfers_to_teacher_id_fkey FOREIGN KEY (to_teacher_id) REFERENCES public.teachers(teacher_id);

--
-- Name: batches batches_level_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_level_id_fkey FOREIGN KEY (level_id) REFERENCES public.levels(level_id);

--
-- Name: batches batches_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(teacher_id) ON DELETE SET NULL;

--
-- Name: events events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id);

--
-- Name: fee_payments fee_payments_fee_structure_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_payments
    ADD CONSTRAINT fee_payments_fee_structure_id_fkey FOREIGN KEY (fee_structure_id) REFERENCES public.fee_structure(fee_structure_id);

--
-- Name: fee_payments fee_payments_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_payments
    ADD CONSTRAINT fee_payments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id) ON DELETE CASCADE;

--
-- Name: fee_structure fee_structure_level_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_structure
    ADD CONSTRAINT fee_structure_level_id_fkey FOREIGN KEY (level_id) REFERENCES public.levels(level_id);

--
-- Name: gallery_requests gallery_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gallery_requests
    ADD CONSTRAINT gallery_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(user_id);

--
-- Name: gallery_requests gallery_requests_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gallery_requests
    ADD CONSTRAINT gallery_requests_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id) ON DELETE CASCADE;

--
-- Name: gallery gallery_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gallery
    ADD CONSTRAINT gallery_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(user_id);

--
-- Name: learning_resources learning_resources_level_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learning_resources
    ADD CONSTRAINT learning_resources_level_id_fkey FOREIGN KEY (level_id) REFERENCES public.levels(level_id);

--
-- Name: learning_resources learning_resources_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learning_resources
    ADD CONSTRAINT learning_resources_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.teachers(teacher_id);

--
-- Name: makeup_class_bookings makeup_class_bookings_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.makeup_class_bookings
    ADD CONSTRAINT makeup_class_bookings_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.teachers(teacher_id);

--
-- Name: makeup_class_bookings makeup_class_bookings_makeup_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.makeup_class_bookings
    ADD CONSTRAINT makeup_class_bookings_makeup_batch_id_fkey FOREIGN KEY (makeup_batch_id) REFERENCES public.batches(batch_id);

--
-- Name: makeup_class_bookings makeup_class_bookings_original_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.makeup_class_bookings
    ADD CONSTRAINT makeup_class_bookings_original_batch_id_fkey FOREIGN KEY (original_batch_id) REFERENCES public.batches(batch_id);

--
-- Name: makeup_class_bookings makeup_class_bookings_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.makeup_class_bookings
    ADD CONSTRAINT makeup_class_bookings_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id) ON DELETE CASCADE;

--
-- Name: notices notices_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notices
    ADD CONSTRAINT notices_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id);

--
-- Name: student_activity_logs student_activity_logs_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_activity_logs
    ADD CONSTRAINT student_activity_logs_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id) ON DELETE CASCADE;

--
-- Name: student_batches student_batches_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_batches
    ADD CONSTRAINT student_batches_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(batch_id) ON DELETE CASCADE;

--
-- Name: student_batches student_batches_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_batches
    ADD CONSTRAINT student_batches_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id) ON DELETE CASCADE;

--
-- Name: student_status_changes student_status_changes_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_status_changes
    ADD CONSTRAINT student_status_changes_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(user_id);

--
-- Name: student_status_changes student_status_changes_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_status_changes
    ADD CONSTRAINT student_status_changes_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id) ON DELETE CASCADE;

--
-- Name: students students_current_level_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_current_level_id_fkey FOREIGN KEY (current_level_id) REFERENCES public.levels(level_id);

--
-- Name: students students_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;

--
-- Name: teacher_reviews teacher_reviews_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher_reviews
    ADD CONSTRAINT teacher_reviews_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id) ON DELETE CASCADE;

--
-- Name: teacher_reviews teacher_reviews_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher_reviews
    ADD CONSTRAINT teacher_reviews_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(teacher_id) ON DELETE CASCADE;

--
-- Name: teachers teachers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;

--
-- PostgreSQL database dump complete
--

