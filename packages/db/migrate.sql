-- Remove owner column from AuditFinding
ALTER TABLE "AuditFinding" DROP COLUMN IF EXISTS "owner";

-- Drop the FindingOwner enum if it exists
DROP TYPE IF EXISTS "FindingOwner";

-- Update FindingKind enum values
-- First, add new enum values if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FindingKind') THEN
        CREATE TYPE "FindingKind" AS ENUM ('MarketingStrategy', 'Copywriting', 'UXUI', 'Motion', 'Generalist');
    ELSE
        -- Check if we need to update existing values
        -- This is complex, so we'll handle it step by step
        -- First, let's see what values exist
        IF EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'performance' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'FindingKind')) THEN
            -- Old enum exists, we need to migrate
            -- For safety, we'll create a new enum and migrate data
            ALTER TYPE "FindingKind" ADD VALUE IF NOT EXISTS 'MarketingStrategy';
            ALTER TYPE "FindingKind" ADD VALUE IF NOT EXISTS 'Copywriting';
            ALTER TYPE "FindingKind" ADD VALUE IF NOT EXISTS 'UXUI';
            ALTER TYPE "FindingKind" ADD VALUE IF NOT EXISTS 'Motion';
            ALTER TYPE "FindingKind" ADD VALUE IF NOT EXISTS 'Generalist';
            
            -- Update existing data: map old values to new ones
            UPDATE "AuditFinding" SET kind = 'UXUI'::"FindingKind" WHERE kind::text IN ('ux', 'a11y');
            UPDATE "AuditFinding" SET kind = 'MarketingStrategy'::"FindingKind" WHERE kind::text = 'performance';
            UPDATE "AuditFinding" SET kind = 'Copywriting'::"FindingKind" WHERE kind::text = 'copy';
            UPDATE "AuditFinding" SET kind = 'UXUI'::"FindingKind" WHERE kind::text = 'design';
            
            -- Drop old enum values (this requires recreating the enum, which is complex)
            -- For now, we'll leave them and they'll just be unused
        END IF;
    END IF;
END $$;

-- Actually, a simpler approach: drop and recreate the enum
-- But we need to handle existing data first
