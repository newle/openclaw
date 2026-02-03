-- Add join_code and join_code_expires_at to treasures table
ALTER TABLE treasures 
ADD COLUMN join_code VARCHAR(4),
ADD COLUMN join_code_expires_at TIMESTAMP WITH TIME ZONE;

-- Index for faster lookup by join code
CREATE INDEX idx_treasures_join_code ON treasures(join_code);
