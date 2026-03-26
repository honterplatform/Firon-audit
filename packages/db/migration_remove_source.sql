-- Migration: Remove source column and FindingSource enum
-- Run this SQL script directly in Supabase SQL Editor (Dashboard > SQL Editor)
-- This migration removes the 'source' column from AuditFinding table and the FindingSource enum

BEGIN;

-- Step 1: Remove the source column
ALTER TABLE "AuditFinding" DROP COLUMN IF EXISTS "source";

-- Step 2: Drop the index on source if it exists
DROP INDEX IF EXISTS "AuditFinding_source_idx";

-- Step 3: Drop the FindingSource enum if it exists
DROP TYPE IF EXISTS "FindingSource";

COMMIT;

-- Verify the migration
SELECT 
  column_name, 
  data_type, 
  udt_name 
FROM information_schema.columns 
WHERE table_name = 'AuditFinding' 
ORDER BY ordinal_position;
