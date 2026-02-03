-- Enable PostGIS extension for geolocation
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    openid VARCHAR(100) UNIQUE NOT NULL,
    nickname VARCHAR(100),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_openid ON users(openid);

-- Create treasures table
CREATE TABLE treasures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID REFERENCES users(id),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    difficulty INTEGER CHECK (difficulty >= 1 AND difficulty <= 5),
    is_public BOOLEAN DEFAULT true,
    max_participants INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT true,
    center_location GEOGRAPHY(POINT, 4326),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_treasures_location ON treasures USING GIST(center_location);
CREATE INDEX idx_treasures_creator ON treasures(creator_id);

-- Create locations table
CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    treasure_id UUID REFERENCES treasures(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL,
    coordinates GEOGRAPHY(POINT, 4326) NOT NULL,
    photo_url TEXT NOT NULL,
    description TEXT,
    photo_features JSONB,
    UNIQUE(treasure_id, order_index)
);

CREATE INDEX idx_locations_treasure ON locations(treasure_id);
CREATE INDEX idx_locations_coordinates ON locations USING GIST(coordinates);

-- Create participations table
CREATE TABLE participations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    treasure_id UUID REFERENCES treasures(id),
    start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    end_time TIMESTAMP WITH TIME ZONE,
    completed_locations INTEGER DEFAULT 0,
    is_completed BOOLEAN DEFAULT false,
    final_rank INTEGER,
    UNIQUE(user_id, treasure_id)
);

CREATE INDEX idx_participations_user ON participations(user_id);
CREATE INDEX idx_participations_treasure ON participations(treasure_id);
CREATE INDEX idx_participations_completed ON participations(is_completed);

-- Create verifications table
CREATE TABLE verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participation_id UUID REFERENCES participations(id),
    location_id UUID REFERENCES locations(id),
    photo_url TEXT NOT NULL,
    similarity_score FLOAT,
    distance_meters FLOAT,
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_verifications_participation ON verifications(participation_id);
CREATE INDEX idx_verifications_location ON verifications(location_id);

-- Setup RLS Policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE treasures ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE participations ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;

-- Grant permissions to anon and authenticated roles
GRANT SELECT ON users TO anon, authenticated;
GRANT SELECT ON treasures TO anon, authenticated;
GRANT SELECT ON locations TO anon, authenticated;
GRANT SELECT ON participations TO anon, authenticated;
GRANT SELECT ON verifications TO anon, authenticated;

GRANT ALL PRIVILEGES ON users TO authenticated;
GRANT ALL PRIVILEGES ON treasures TO authenticated;
GRANT ALL PRIVILEGES ON locations TO authenticated;
GRANT ALL PRIVILEGES ON participations TO authenticated;
GRANT ALL PRIVILEGES ON verifications TO authenticated;

-- Policies

-- Users: Anyone can read basic user info, user can update own profile
CREATE POLICY "Public profiles are viewable by everyone" ON users
    FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

-- Treasures: Public ones viewable by all, private viewable by creator/participants (simplified for now)
CREATE POLICY "Public treasures are viewable by everyone" ON treasures
    FOR SELECT USING (is_public = true);

CREATE POLICY "Users can create treasures" ON treasures
    FOR INSERT WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Users can update own treasures" ON treasures
    FOR UPDATE USING (auth.uid() = creator_id);

-- Locations: Viewable if treasure is viewable (This is simplified, RLS on join is complex, usually we just allow public read for now)
CREATE POLICY "Locations are viewable by everyone" ON locations
    FOR SELECT USING (true);

CREATE POLICY "Creators can insert locations" ON locations
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM treasures 
            WHERE id = locations.treasure_id 
            AND creator_id = auth.uid()
        )
    );

-- Participations
CREATE POLICY "Users can view their own participations" ON participations
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can join treasures" ON participations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own participation" ON participations
    FOR UPDATE USING (auth.uid() = user_id);

-- Verifications
CREATE POLICY "Users can view their own verifications" ON verifications
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM participations
            WHERE id = verifications.participation_id
            AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert verifications" ON verifications
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM participations
            WHERE id = verifications.participation_id
            AND user_id = auth.uid()
        )
    );
