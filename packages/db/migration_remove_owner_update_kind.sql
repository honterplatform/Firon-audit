-- Migration: Remove owner column and update FindingKind enum
-- Run this SQL script directly in Supabase SQL Editor (Dashboard > SQL Editor)
-- This migration:
-- 1. Removes the 'owner' column from AuditFinding table
-- 2. Updates FindingKind enum from old values (performance, a11y, ux, copy, design) 
--    to new values (MarketingStrategy, Copywriting, UXUI, Motion, Generalist)
-- 3. Migrates existing data to the new enum values

BEGIN;

-- Step 1: Remove the owner column (simpler operation, do this first)
ALTER TABLE "AuditFinding" DROP COLUMN IF EXISTS "owner";

-- Step 2: Drop the FindingOwner enum if it exists
DROP TYPE IF EXISTS "FindingOwner";

-- Step 3: Create a new enum type with the new values
CREATE TYPE "FindingKind_new" AS ENUM ('MarketingStrategy', 'Copywriting', 'UXUI', 'Motion', 'Generalist');

-- Step 4: Add a temporary text column to store migrated values
ALTER TABLE "AuditFinding" ADD COLUMN kind_new_temp text;

-- Step 5: Migrate existing data to new enum values
UPDATE "AuditFinding" 
SET kind_new_temp = CASE 
  WHEN kind::text = 'performance' THEN 'MarketingStrategy'
  WHEN kind::text = 'a11y' THEN 'UXUI'
  WHEN kind::text = 'ux' THEN 'UXUI'
  WHEN kind::text = 'copy' THEN 'Copywriting'
  WHEN kind::text = 'design' THEN 'UXUI'
  ELSE 'Generalist'
END
WHERE kind_new_temp IS NULL;

-- Step 6: Drop the old kind column
ALTER TABLE "AuditFinding" DROP COLUMN kind;

-- Step 7: Drop the old enum (safe now that column is dropped)
DROP TYPE IF EXISTS "FindingKind";

-- Step 8: Rename the new enum to the original name
ALTER TYPE "FindingKind_new" RENAME TO "FindingKind";

-- Step 9: Add the kind column back with the new enum type
ALTER TABLE "AuditFinding" 
  ADD COLUMN kind "FindingKind" NOT NULL DEFAULT 'Generalist';

-- Step 10: Update the new column with migrated values
UPDATE "AuditFinding" 
SET kind = kind_new_temp::"FindingKind"
WHERE kind_new_temp IS NOT NULL;

-- Step 11: Remove the default constraint
ALTER TABLE "AuditFinding" 
  ALTER COLUMN kind DROP DEFAULT;
  
-- Step 12: Remove the temporary column
ALTER TABLE "AuditFinding" 
  DROP COLUMN kind_new_temp;

COMMIT;

-- Verify the migration
SELECT 
  column_name, 
  data_type, 
  udt_name 
FROM information_schema.columns 
WHERE table_name = 'AuditFinding' 
ORDER BY ordinal_position;

-- Verify enum values
SELECT enumlabel 
FROM pg_enum 
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'FindingKind')
ORDER BY enumsortorder;
