-- ROADLIVE: PostgreSQL Initial Migration & Schema
-- Creates spatial schema, tables, indexes, RLS policies, and utility functions.

-- Enable PostGIS if available (optional extension)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Cities
CREATE TABLE IF NOT EXISTS cities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    default_zoom INTEGER DEFAULT 12,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Districts
CREATE TABLE IF NOT EXISTS districts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    city_id UUID NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    center_lat DOUBLE PRECISION NOT NULL,
    center_lng DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(city_id, slug)
);

-- 3. Profiles (extending auth.users or standalone driver profiles)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    role VARCHAR(20) DEFAULT 'driver' CHECK (role IN ('driver', 'moderator', 'admin')),
    level VARCHAR(50) DEFAULT 'Новичок' CHECK (level IN ('Новичок', 'Водитель', 'Активный водитель', 'Наблюдатель', 'Эксперт района')),
    rating NUMERIC(3, 2) DEFAULT 5.00,
    helpful_confirmations_count INTEGER DEFAULT 0,
    events_count INTEGER DEFAULT 0,
    questions_count INTEGER DEFAULT 0,
    answers_count INTEGER DEFAULT 0,
    reports_count INTEGER DEFAULT 0,
    is_banned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Road Events
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    city_id UUID NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
    district_id UUID REFERENCES districts(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('crossing', 'accident', 'patrol', 'fuel', 'road', 'traffic_light', 'hazard', 'other')),
    sub_type VARCHAR(100),
    status VARCHAR(30) DEFAULT 'active' CHECK (status IN ('active', 'expiring', 'expired', 'resolved', 'hidden')),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    address VARCHAR(255),
    direction VARCHAR(100),
    image_url TEXT,
    confirmation_count INTEGER DEFAULT 1,
    dispute_count INTEGER DEFAULT 0,
    confidence_score NUMERIC(3, 2) DEFAULT 1.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_confirmed_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- 5. Event Confirmations
CREATE TABLE IF NOT EXISTS event_confirmations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    action VARCHAR(20) NOT NULL CHECK (action IN ('confirm', 'dispute')),
    is_nearby BOOLEAN DEFAULT FALSE,
    distance_meters INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(event_id, user_id)
);

-- 6. Event Comments / Live Chat
CREATE TABLE IF NOT EXISTS event_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    author_name VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Driver Questions
CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    city_id UUID NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
    district_id UUID REFERENCES districts(id) ON DELETE SET NULL,
    category VARCHAR(50) NOT NULL,
    question TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    address VARCHAR(255),
    answers_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Question Answers
CREATE TABLE IF NOT EXISTS question_answers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    author_name VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    helpful_count INTEGER DEFAULT 0,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Gas Stations (АЗС)
CREATE TABLE IF NOT EXISTS stations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    city_id UUID NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    brand VARCHAR(100) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    address VARCHAR(255) NOT NULL,
    fuel_types JSONB NOT NULL DEFAULT '{"ai92": 62.40, "ai95": 65.90, "ai98": 78.50, "dt": 72.10}',
    queue_status VARCHAR(30) DEFAULT 'none' CHECK (queue_status IN ('none', 'small', 'large')),
    last_reported_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Station Observations
CREATE TABLE IF NOT EXISTS station_observations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    station_id UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    queue_status VARCHAR(30) NOT NULL CHECK (queue_status IN ('none', 'small', 'large')),
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Reports & Abuse Flagging
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    target_type VARCHAR(30) NOT NULL CHECK (target_type IN ('event', 'comment', 'question', 'answer', 'user')),
    target_id UUID NOT NULL,
    reason VARCHAR(100) NOT NULL CHECK (reason IN ('incorrect', 'spam', 'insult', 'inappropriate', 'fake')),
    details TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Telegram Accounts
CREATE TABLE IF NOT EXISTS telegram_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(100),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    photo_url TEXT,
    connected_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. Web Push Subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. Admin Audit Actions
CREATE TABLE IF NOT EXISTS admin_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id UUID NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. Businesses / Local Services (Prepared for future monetization)
CREATE TABLE IF NOT EXISTS businesses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    city_id UUID NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('car_wash', 'auto_service', 'tire_service', 'tow_truck', 'auto_parts')),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    address VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    rating NUMERIC(2, 1) DEFAULT 4.8,
    is_promoted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial and Filtering Indexes
CREATE INDEX IF NOT EXISTS idx_events_lat_lng ON events(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_events_city_status ON events(city_id, status);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_expires_at ON events(expires_at);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_questions_lat_lng ON questions(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_questions_city ON questions(city_id);

CREATE INDEX IF NOT EXISTS idx_stations_lat_lng ON stations(latitude, longitude);

-- Automated Event Aging Function
CREATE OR REPLACE FUNCTION refresh_event_status()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE events
    SET status = 'expired'
    WHERE status IN ('active', 'expiring')
      AND expires_at < NOW();
      
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    
    -- Also mark expiring if within 5 minutes of expiration
    UPDATE events
    SET status = 'expiring'
    WHERE status = 'active'
      AND expires_at < NOW() + INTERVAL '5 minutes'
      AND expires_at >= NOW();
      
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Row Level Security (RLS)
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Public read policies
CREATE POLICY "Public read cities" ON cities FOR SELECT USING (true);
CREATE POLICY "Public read districts" ON districts FOR SELECT USING (true);
CREATE POLICY "Public read profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Public read active events" ON events FOR SELECT USING (status != 'hidden');
CREATE POLICY "Public read confirmations" ON event_confirmations FOR SELECT USING (true);
CREATE POLICY "Public read comments" ON event_comments FOR SELECT USING (true);
CREATE POLICY "Public read questions" ON questions FOR SELECT USING (true);
CREATE POLICY "Public read answers" ON question_answers FOR SELECT USING (true);
CREATE POLICY "Public read stations" ON stations FOR SELECT USING (true);
CREATE POLICY "Public read observations" ON station_observations FOR SELECT USING (true);

-- Authenticated driver policies
CREATE POLICY "Drivers create events" ON events FOR INSERT WITH CHECK (true);
CREATE POLICY "Drivers confirm events" ON event_confirmations FOR INSERT WITH CHECK (true);
CREATE POLICY "Drivers comment events" ON event_comments FOR INSERT WITH CHECK (true);
CREATE POLICY "Drivers ask questions" ON questions FOR INSERT WITH CHECK (true);
CREATE POLICY "Drivers answer questions" ON question_answers FOR INSERT WITH CHECK (true);
CREATE POLICY "Drivers submit observations" ON station_observations FOR INSERT WITH CHECK (true);
CREATE POLICY "Drivers submit reports" ON reports FOR INSERT WITH CHECK (true);
