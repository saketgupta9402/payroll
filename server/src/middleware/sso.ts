/**
 * SSO Middleware for Payroll Application
 * 
 * Verifies JWT tokens from HR system for Single Sign-On
 * 
 * Usage:
 *   import { verifyHrSsoToken } from './middleware/sso';
 *   router.get('/sso', verifyHrSsoToken, handler);
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface HrUser {
  hrUserId: string;
  orgId: string;
  email: string;
  name: string;
  roles: string[];
  payrollRole: 'payroll_admin' | 'payroll_employee';
}

declare global {
  namespace Express {
    interface Request {
      hrUser?: HrUser;
    }
  }
}

/**
 * Map HR roles to Payroll role
 */
function mapHrToPayrollRole(hrRoles: string[]): 'payroll_admin' | 'payroll_employee' {
  const adminSet = new Set(['CEO', 'Admin', 'HR', 'ceo', 'admin', 'hr']);
  return hrRoles.some(r => adminSet.has(r)) ? 'payroll_admin' : 'payroll_employee';
}

/**
 * Verify HR SSO JWT token
 * 
 * Extracts and validates JWT token from query parameter or Authorization header
 * Attaches hrUser to request object
 */
export async function verifyHrSsoToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Get token from query parameter or Authorization header
    const token = (req.query.token as string) || 
                  (req.headers.authorization?.replace('Bearer ', ''));

    if (!token) {
      return res.status(401).json({ 
        error: 'SSO token required',
        message: 'Please provide a valid SSO token from HR system'
      });
    }

    // Get JWT public key for RS256 verification (must match HR system's HR_PAYROLL_JWT_PRIVATE_KEY)
    const publicKey = (process.env.HR_PAYROLL_JWT_PUBLIC_KEY || '').replace(/\\n/g, '\n');

    if (!publicKey || publicKey.trim() === '' || !publicKey.includes('BEGIN PUBLIC KEY')) {
      console.error('⚠️  HR_PAYROLL_JWT_PUBLIC_KEY not configured. Set HR_PAYROLL_JWT_PUBLIC_KEY environment variable.');
      return res.status(500).json({ 
        error: 'SSO configuration error',
        message: 'JWT public key not configured'
      });
    }

    // Verify JWT token
    let payload: any;
    try {
             payload = jwt.verify(token, publicKey, { algorithms: ['RS256'] }) as any;
    } catch (jwtError: any) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          error: 'Token expired',
          message: 'SSO token has expired. Please try again from HR system.'
        });
      } else if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({ 
          error: 'Invalid token',
          message: 'SSO token is invalid or malformed'
        });
      }
      throw jwtError;
    }

    // Validate claims
    if (payload.iss !== 'hr-app') {
      return res.status(401).json({ 
        error: 'Invalid token issuer',
        message: `Expected issuer 'hr-app', got '${payload.iss}'`
      });
    }

    if (payload.aud !== 'payroll-app') {
      return res.status(401).json({ 
        error: 'Invalid token audience',
        message: `Expected audience 'payroll-app', got '${payload.aud}'`
      });
    }

    // Check expiry (jwt.verify already checks this, but double-check)
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return res.status(401).json({ 
        error: 'Token expired',
        message: 'SSO token has expired'
      });
    }

    // Extract required fields
    const hrUserId = payload.sub;
    const orgId = payload.org_id;
    const email = payload.email;
    const name = payload.name || email;
    const roles = payload.roles || [];
    const payrollRole = payload.payroll_role || mapHrToPayrollRole(roles);

    if (!hrUserId || !orgId || !email) {
      return res.status(401).json({ 
        error: 'Invalid token claims',
        message: 'Token missing required claims: sub, org_id, or email'
      });
    }

    // Attach to request
    req.hrUser = {
      hrUserId: hrUserId.toString(),
      orgId: orgId.toString(),
      email: email.toLowerCase().trim(),
      name: name,
      roles: roles,
      payrollRole: payrollRole
    };

    // Log successful verification (for debugging)
    console.log(`✅ SSO token verified: ${email} (${payrollRole}) from org ${orgId}`);

    next();
  } catch (error: any) {
    console.error('SSO verification error:', error);
    return res.status(500).json({ 
      error: 'SSO verification failed',
      message: error.message || 'Internal server error during SSO verification'
    });
  }
}

/**
 * Optional: Verify token from Authorization header (for API calls)
 */
export async function verifyHrSsoTokenFromHeader(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      error: 'Authorization header required',
      message: 'Please provide a Bearer token in Authorization header'
    });
  }

  // Temporarily set token in query for verifyHrSsoToken
  req.query.token = authHeader.replace('Bearer ', '');
  
  return verifyHrSsoToken(req, res, next);
}

