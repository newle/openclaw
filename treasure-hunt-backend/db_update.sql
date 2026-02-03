
-- Rename final_rank to final_cost if it exists, or add final_cost column
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'participations' AND column_name = 'final_rank') THEN
        ALTER TABLE participations RENAME COLUMN final_rank TO final_cost;
    ELSE
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'participations' AND column_name = 'final_cost') THEN
            ALTER TABLE participations ADD COLUMN final_cost INTEGER;
        END IF;
    END IF;

    -- Ensure other columns exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'participations' AND column_name = 'start_time') THEN
        ALTER TABLE participations ADD COLUMN start_time TIMESTAMP WITH TIME ZONE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'participations' AND column_name = 'end_time') THEN
        ALTER TABLE participations ADD COLUMN end_time TIMESTAMP WITH TIME ZONE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'participations' AND column_name = 'is_completed') THEN
        ALTER TABLE participations ADD COLUMN is_completed BOOLEAN DEFAULT FALSE;
    END IF;
END $$;
