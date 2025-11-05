-- Migration: 20251030000001
-- Add pending_approval status to payroll_status enum
-- This must be in a separate migration because enum values must be committed before use

-- Add pending_approval to the payroll_status enum
DO $$
BEGIN
  -- Check if the enum value already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'pending_approval' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'payroll_status')
  ) THEN
    ALTER TYPE public.payroll_status ADD VALUE 'pending_approval';
  END IF;
END $$;

