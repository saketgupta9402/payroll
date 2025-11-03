
-- Migration: 20251027162450
-- Create enums
CREATE TYPE public.user_role AS ENUM ('owner', 'admin', 'hr', 'payroll', 'finance', 'manager', 'employee');
CREATE TYPE public.employment_status AS ENUM ('active', 'inactive', 'on_leave', 'terminated');
CREATE TYPE public.payroll_status AS ENUM ('draft', 'approved', 'processing', 'completed', 'failed');

-- Tenants table
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subdomain TEXT UNIQUE NOT NULL,
  company_name TEXT NOT NULL,
  logo_url TEXT,
  theme_color TEXT DEFAULT '#1E40AF',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- User roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  role public.user_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, tenant_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Employees table
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  employee_code TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  date_of_joining DATE NOT NULL,
  date_of_birth DATE,
  department TEXT,
  designation TEXT,
  status public.employment_status DEFAULT 'active',
  pan_number TEXT,
  aadhaar_number TEXT,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  bank_name TEXT,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, employee_code)
);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Compensation structures table
CREATE TABLE public.compensation_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  effective_from DATE NOT NULL,
  ctc DECIMAL(12,2) NOT NULL,
  basic_salary DECIMAL(12,2) NOT NULL,
  hra DECIMAL(12,2) DEFAULT 0,
  special_allowance DECIMAL(12,2) DEFAULT 0,
  da DECIMAL(12,2) DEFAULT 0,
  lta DECIMAL(12,2) DEFAULT 0,
  bonus DECIMAL(12,2) DEFAULT 0,
  pf_contribution DECIMAL(12,2) DEFAULT 0,
  esi_contribution DECIMAL(12,2) DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.compensation_structures ENABLE ROW LEVEL SECURITY;

-- Payroll cycles table
CREATE TABLE public.payroll_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  status public.payroll_status DEFAULT 'draft',
  total_employees INTEGER DEFAULT 0,
  total_amount DECIMAL(15,2) DEFAULT 0,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, month, year)
);

ALTER TABLE public.payroll_cycles ENABLE ROW LEVEL SECURITY;

-- Payroll items table
CREATE TABLE public.payroll_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  payroll_cycle_id UUID REFERENCES public.payroll_cycles(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  gross_salary DECIMAL(12,2) NOT NULL,
  deductions DECIMAL(12,2) DEFAULT 0,
  net_salary DECIMAL(12,2) NOT NULL,
  basic_salary DECIMAL(12,2) NOT NULL,
  hra DECIMAL(12,2) DEFAULT 0,
  special_allowance DECIMAL(12,2) DEFAULT 0,
  pf_deduction DECIMAL(12,2) DEFAULT 0,
  esi_deduction DECIMAL(12,2) DEFAULT 0,
  tds_deduction DECIMAL(12,2) DEFAULT 0,
  pt_deduction DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(payroll_cycle_id, employee_id)
);

ALTER TABLE public.payroll_items ENABLE ROW LEVEL SECURITY;

-- Audit logs table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Security definer function to check user role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _tenant_id UUID, _role user_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND tenant_id = _tenant_id
      AND role = _role
  )
$$;

-- Function to get user's tenant
CREATE OR REPLACE FUNCTION public.get_user_tenant(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id
  FROM public.profiles
  WHERE id = _user_id
  LIMIT 1
$$;

-- RLS Policies for tenants
CREATE POLICY "Users can view their tenant"
  ON public.tenants FOR SELECT
  USING (id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Users can update their tenant if admin/owner"
  ON public.tenants FOR UPDATE
  USING (
    id = public.get_user_tenant(auth.uid()) AND
    (public.has_role(auth.uid(), id, 'owner') OR public.has_role(auth.uid(), id, 'admin'))
  );

-- RLS Policies for profiles
CREATE POLICY "Users can view profiles in their tenant"
  ON public.profiles FOR SELECT
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- RLS Policies for user_roles
CREATE POLICY "Users can view roles in their tenant"
  ON public.user_roles FOR SELECT
  USING (tenant_id = public.get_user_tenant(auth.uid()));

-- RLS Policies for employees
CREATE POLICY "Users can view employees in their tenant"
  ON public.employees FOR SELECT
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "HR/Admin can insert employees"
  ON public.employees FOR INSERT
  WITH CHECK (
    tenant_id = public.get_user_tenant(auth.uid()) AND
    (public.has_role(auth.uid(), tenant_id, 'owner') OR 
     public.has_role(auth.uid(), tenant_id, 'admin') OR 
     public.has_role(auth.uid(), tenant_id, 'hr'))
  );

CREATE POLICY "HR/Admin can update employees"
  ON public.employees FOR UPDATE
  USING (
    tenant_id = public.get_user_tenant(auth.uid()) AND
    (public.has_role(auth.uid(), tenant_id, 'owner') OR 
     public.has_role(auth.uid(), tenant_id, 'admin') OR 
     public.has_role(auth.uid(), tenant_id, 'hr'))
  );

-- RLS Policies for compensation
CREATE POLICY "Users can view compensation in their tenant"
  ON public.compensation_structures FOR SELECT
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Payroll/Finance can manage compensation"
  ON public.compensation_structures FOR ALL
  USING (
    tenant_id = public.get_user_tenant(auth.uid()) AND
    (public.has_role(auth.uid(), tenant_id, 'owner') OR 
     public.has_role(auth.uid(), tenant_id, 'admin') OR 
     public.has_role(auth.uid(), tenant_id, 'payroll') OR
     public.has_role(auth.uid(), tenant_id, 'finance'))
  );

-- RLS Policies for payroll cycles
CREATE POLICY "Users can view payroll cycles in their tenant"
  ON public.payroll_cycles FOR SELECT
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Payroll/Finance can manage payroll cycles"
  ON public.payroll_cycles FOR ALL
  USING (
    tenant_id = public.get_user_tenant(auth.uid()) AND
    (public.has_role(auth.uid(), tenant_id, 'owner') OR 
     public.has_role(auth.uid(), tenant_id, 'admin') OR 
     public.has_role(auth.uid(), tenant_id, 'payroll') OR
     public.has_role(auth.uid(), tenant_id, 'finance'))
  );

-- RLS Policies for payroll items
CREATE POLICY "Users can view payroll items in their tenant"
  ON public.payroll_items FOR SELECT
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Payroll can manage payroll items"
  ON public.payroll_items FOR ALL
  USING (
    tenant_id = public.get_user_tenant(auth.uid()) AND
    (public.has_role(auth.uid(), tenant_id, 'owner') OR 
     public.has_role(auth.uid(), tenant_id, 'admin') OR 
     public.has_role(auth.uid(), tenant_id, 'payroll'))
  );

-- RLS Policies for audit logs
CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (
    tenant_id = public.get_user_tenant(auth.uid()) AND
    (public.has_role(auth.uid(), tenant_id, 'owner') OR public.has_role(auth.uid(), tenant_id, 'admin'))
  );

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_compensation_updated_at BEFORE UPDATE ON public.compensation_structures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payroll_cycles_updated_at BEFORE UPDATE ON public.payroll_cycles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payroll_items_updated_at BEFORE UPDATE ON public.payroll_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Migration: 20251028044119
-- Create tax_declarations table
CREATE TABLE public.tax_declarations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  financial_year TEXT NOT NULL,
  declaration_data JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMP WITH TIME ZONE,
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create tax_documents table for Form 16, etc.
CREATE TABLE public.tax_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  financial_year TEXT NOT NULL,
  document_type TEXT NOT NULL,
  document_url TEXT NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tax_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tax_declarations
CREATE POLICY "Employees can view their own declarations"
ON public.tax_declarations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = tax_declarations.employee_id
    AND e.tenant_id = tax_declarations.tenant_id
    AND e.email = auth.jwt()->>'email'
  )
);

CREATE POLICY "Employees can insert their own declarations"
ON public.tax_declarations
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = tax_declarations.employee_id
    AND e.tenant_id = tax_declarations.tenant_id
    AND e.email = auth.jwt()->>'email'
  )
);

CREATE POLICY "Employees can update their own draft declarations"
ON public.tax_declarations
FOR UPDATE
USING (
  status = 'draft' AND
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = tax_declarations.employee_id
    AND e.tenant_id = tax_declarations.tenant_id
    AND e.email = auth.jwt()->>'email'
  )
);

CREATE POLICY "HR can manage all declarations"
ON public.tax_declarations
FOR ALL
USING (
  tenant_id = get_user_tenant(auth.uid()) AND
  (has_role(auth.uid(), tenant_id, 'owner'::user_role) OR 
   has_role(auth.uid(), tenant_id, 'admin'::user_role) OR 
   has_role(auth.uid(), tenant_id, 'hr'::user_role))
);

-- RLS Policies for tax_documents
CREATE POLICY "Employees can view their own documents"
ON public.tax_documents
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = tax_documents.employee_id
    AND e.tenant_id = tax_documents.tenant_id
    AND e.email = auth.jwt()->>'email'
  )
);

CREATE POLICY "HR can manage all tax documents"
ON public.tax_documents
FOR ALL
USING (
  tenant_id = get_user_tenant(auth.uid()) AND
  (has_role(auth.uid(), tenant_id, 'owner'::user_role) OR 
   has_role(auth.uid(), tenant_id, 'admin'::user_role) OR 
   has_role(auth.uid(), tenant_id, 'hr'::user_role) OR
   has_role(auth.uid(), tenant_id, 'finance'::user_role))
);

-- Add trigger for updated_at
CREATE TRIGGER update_tax_declarations_updated_at
BEFORE UPDATE ON public.tax_declarations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Migration: 20251028053240
-- Add payday column to payroll_cycles table
ALTER TABLE public.payroll_cycles
ADD COLUMN payday DATE;
