-- Migration: 20251028053240
-- Add payday column to payroll_cycles table
ALTER TABLE public.payroll_cycles
ADD COLUMN payday DATE;
