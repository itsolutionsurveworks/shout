-- Step 1 of 2: run this on its own in the Supabase SQL editor FIRST.
-- Postgres does not allow a new enum value to be used in the same transaction that adds it,
-- so developer_role.sql must be run as a separate query afterwards.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'developer';
