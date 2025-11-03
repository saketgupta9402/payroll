-- Create the table to store tenant-specific payroll settings
CREATE TABLE public.payroll_settings (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  pf_rate DECIMAL(5, 2) DEFAULT 12.00,
  esi_rate DECIMAL(5, 2) DEFAULT 3.25,
  pt_rate DECIMAL(10, 2) DEFAULT 200.00,
  tds_threshold DECIMAL(14, 2) DEFAULT 250000.00,
  hra_percentage DECIMAL(5, 2) DEFAULT 40.00,
  special_allowance_percentage DECIMAL(5, 2) DEFAULT 30.00,
  basic_salary_percentage DECIMAL(5, 2) DEFAULT 40.00,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add trigger for updated_at
-- This function was created in your "20251027162450_initial_schema.sql" migration
CREATE TRIGGER update_payroll_settings_updated_at
BEFORE UPDATE ON public.payroll_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

