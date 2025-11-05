-- Migration: 20251030000000
-- Add pending_approval status to payroll approval workflow
-- Note: The enum value 'pending_approval' is added in migration 20251030000001_add_pending_approval_enum.sql

-- Add fields for tracking submission and rejection
ALTER TABLE public.payroll_cycles
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Create index for pending approval queries
-- Note: We create a regular index first; the partial index with WHERE clause can be added later if needed
-- The enum value 'pending_approval' is added in migration 20251030000001_add_pending_approval_enum.sql
CREATE INDEX IF NOT EXISTS idx_payroll_cycles_status 
  ON public.payroll_cycles(tenant_id, status);

