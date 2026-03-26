-- Migration: Remove Motion and Generalist from FindingKind enum
-- This migration:
-- 1. Updates existing findings with Motion or Generalist to UXUI
-- 2. Removes Motion and Generalist from the FindingKind enum

BEGIN;

-- Step 1: Update existing findings - map Motion and Generalist to UXUI
UPDATE "AuditFinding"
SET kind = 'UXUI'::"FindingKind"
WHERE kind::text IN ('Motion', 'Generalist');

-- Step 2: Create new enum type without Motion and Generalist
CREATE TYPE "FindingKind_new" AS ENUM ('MarketingStrategy', 'Copywriting', 'UXUI');

-- Step 3: Add temporary column with new enum type
ALTER TABLE "AuditFinding" ADD COLUMN kind_new_temp "FindingKind_new";

-- Step 4: Copy existing values to new column
UPDATE "AuditFinding"
SET kind_new_temp = CASE
  WHEN kind::text = 'MarketingStrategy' THEN 'MarketingStrategy'::"FindingKind_new"
  WHEN kind::text = 'Copywriting' THEN 'Copywriting'::"FindingKind_new"
  WHEN kind::text = 'UXUI' THEN 'UXUI'::"FindingKind_new"
  ELSE 'UXUI'::"FindingKind_new"  -- Fallback for any unexpected values
END;

-- Step 5: Drop old column and constraints
ALTER TABLE "AuditFinding" DROP COLUMN kind;
DROP INDEX IF EXISTS "AuditFinding_kind_idx";

-- Step 6: Rename new column
ALTER TABLE "AuditFinding" RENAME COLUMN kind_new_temp TO kind;
ALTER TABLE "AuditFinding" ALTER COLUMN kind SET NOT NULL;

-- Step 7: Recreate index
CREATE INDEX "AuditFinding_kind_idx" ON "AuditFinding"("kind");

-- Step 8: Drop old enum type
DROP TYPE IF EXISTS "FindingKind";

-- Step 9: Rename new enum type
ALTER TYPE "FindingKind_new" RENAME TO "FindingKind";

COMMIT;
