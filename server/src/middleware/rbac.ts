/**
 * RBAC Guards for Payroll Application
 * 
 * Role-based access control middleware for Payroll routes
 * 
 * Usage:
 *   import { requirePayrollAdmin, requirePayrollEmployee, requireOrgContext } from './middleware/rbac';
 *   router.get('/admin/dashboard', requirePayrollAdmin, requireOrgContext, handler);
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Require payroll_admin role
 * 
 * Only allows users with payroll_admin role to access the route
 */
export function requirePayrollAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Get role from session or request
  const payrollRole = (req.session as any)?.payrollRole || 
                      (req as any)?.user?.payroll_role ||
                      (req as any)?.payrollRole;

  if (payrollRole !== 'payroll_admin') {
    return res.status(403).json({ 
      error: 'Admin access required',
      message: 'This endpoint requires payroll_admin role',
      required: 'payroll_admin',
      current: payrollRole || 'none'
    });
  }

  next();
}

/**
 * Require payroll_employee role (or higher)
 * 
 * Allows both payroll_admin and payroll_employee roles
 */
export function requirePayrollEmployee(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Get role from session or request
  const payrollRole = (req.session as any)?.payrollRole || 
                      (req as any)?.user?.payroll_role ||
                      (req as any)?.payrollRole;

  if (!['payroll_admin', 'payroll_employee'].includes(payrollRole)) {
    return res.status(403).json({ 
      error: 'Access denied',
      message: 'This endpoint requires payroll_admin or payroll_employee role',
      required: ['payroll_admin', 'payroll_employee'],
      current: payrollRole || 'none'
    });
  }

  next();
}

/**
 * Require organization context
 * 
 * Ensures org_id is set in session/request for multi-tenant isolation
 */
export function requireOrgContext(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Get org_id from session, request, or hrUser
  const orgId = (req.session as any)?.orgId || 
                (req as any)?.user?.org_id ||
                (req as any)?.orgId ||
                req.hrUser?.orgId;

  if (!orgId) {
    return res.status(403).json({ 
      error: 'Organization context required',
      message: 'This endpoint requires an organization context (org_id)'
    });
  }

  // Attach to request for use in handlers
  (req as any).orgId = orgId;

  next();
}

/**
 * Combined middleware: Require admin + org context
 */
export function requirePayrollAdminWithOrg(
  req: Request,
  res: Response,
  next: NextFunction
) {
  requirePayrollAdmin(req, res, () => {
    requireOrgContext(req, res, next);
  });
}

/**
 * Combined middleware: Require employee + org context
 */
export function requirePayrollEmployeeWithOrg(
  req: Request,
  res: Response,
  next: NextFunction
) {
  requirePayrollEmployee(req, res, () => {
    requireOrgContext(req, res, next);
  });
}

/**
 * Optional: Get user's payroll role from request
 */
export function getPayrollRole(req: Request): 'payroll_admin' | 'payroll_employee' | null {
  return (req.session as any)?.payrollRole || 
         (req as any)?.user?.payroll_role ||
         (req as any)?.payrollRole ||
         req.hrUser?.payrollRole ||
         null;
}

/**
 * Optional: Get user's org_id from request
 */
export function getOrgId(req: Request): string | null {
  return (req.session as any)?.orgId || 
         (req as any)?.user?.org_id ||
         (req as any)?.orgId ||
         req.hrUser?.orgId ||
         null;
}


