import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import bcrypt from 'bcryptjs';

const router = Router();

// Simple bearer token auth
function requireProvisionAuth(req: Request, res: Response, next: Function) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const expected = process.env.PAYROLL_PROVISION_TOKEN || '';
  if (!token || token !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.post('/api/provision/tenant', requireProvisionAuth, async (req: Request, res: Response) => {
  try {
    const { org_id, org_name, subdomain, admin_email } = req.body || {};
    if (!org_id || !subdomain) {
      return res.status(400).json({ error: 'org_id and subdomain required' });
    }

    // Ensure organizations table
    await query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id UUID PRIMARY KEY,
        name TEXT,
        subdomain TEXT UNIQUE,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    // Upsert tenant
    await query(
      `INSERT INTO organizations (id, name, subdomain)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, subdomain = EXCLUDED.subdomain`,
      [org_id, org_name || null, subdomain.toLowerCase()]
    );

    // Create admin user in payroll if admin_email is provided
    if (admin_email) {
      try {
        // Ensure users table exists
        await query(`
          CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email TEXT NOT NULL UNIQUE,
            hr_user_id UUID UNIQUE,
            org_id UUID,
            payroll_role TEXT NOT NULL DEFAULT 'payroll_employee',
            first_name TEXT,
            last_name TEXT,
            pin_hash TEXT,
            pin_set_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
          );
        `);

        // Check if user already exists
        const existingUser = await query(
          `SELECT id FROM users WHERE email = $1 OR org_id = $2 AND payroll_role = 'payroll_admin'`,
          [admin_email, org_id]
        );

        if (existingUser.rows.length === 0) {
          // Create admin user
          await query(
            `INSERT INTO users (email, org_id, payroll_role, first_name, last_name)
             VALUES ($1, $2, 'payroll_admin', $3, $4)
             ON CONFLICT (email) DO UPDATE SET org_id = EXCLUDED.org_id, payroll_role = 'payroll_admin'`,
            [admin_email, org_id, admin_email.split('@')[0], '']
          );
          console.log(`✅ Created payroll admin user: ${admin_email}`);
        }
      } catch (userError) {
        console.error('⚠️  Failed to create payroll admin user:', userError);
        // Continue even if user creation fails
      }
    }

    res.json({ ok: true });
  } catch (error: any) {
    console.error('Provision error:', error);
    res.status(500).json({ error: error.message || 'Provision failed' });
  }
});

// Provision/sync user from HR to Payroll
router.post('/api/provision/user', requireProvisionAuth, async (req: Request, res: Response) => {
  try {
    const { 
      hr_user_id, 
      email, 
      first_name, 
      last_name, 
      org_id, 
      payroll_role 
    } = req.body || {};
    
    if (!hr_user_id || !email || !org_id) {
      return res.status(400).json({ error: 'hr_user_id, email, and org_id required' });
    }

    // Ensure users table exists
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL UNIQUE,
        hr_user_id UUID UNIQUE,
        org_id UUID,
        payroll_role TEXT NOT NULL DEFAULT 'payroll_employee',
        first_name TEXT,
        last_name TEXT,
        pin_hash TEXT,
        pin_set_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Create indexes if they don't exist
    await query(`CREATE INDEX IF NOT EXISTS idx_users_hr_user_id ON users(hr_user_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(org_id);`);

    // Check if user exists by hr_user_id or email
    const existingUser = await query(
      `SELECT id, email, hr_user_id FROM users WHERE hr_user_id = $1 OR email = $2`,
      [hr_user_id, email]
    );

    let result;
    if (existingUser.rows.length > 0) {
      // Update existing user
      const existing = existingUser.rows[0];
      result = await query(
        `UPDATE users
         SET 
           email = $1,
           hr_user_id = COALESCE($2, hr_user_id),
           org_id = $3,
           payroll_role = $4,
           first_name = $5,
           last_name = $6,
           updated_at = now()
         WHERE id = $7
         RETURNING id, email, hr_user_id, org_id, payroll_role`,
        [
          email,
          hr_user_id,
          org_id,
          payroll_role || 'payroll_employee',
          first_name || '',
          last_name || '',
          existing.id
        ]
      );
    } else {
      // Insert new user
      result = await query(
        `INSERT INTO users (email, hr_user_id, org_id, payroll_role, first_name, last_name)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, email, hr_user_id, org_id, payroll_role`,
        [
          email,
          hr_user_id,
          org_id,
          payroll_role || 'payroll_employee',
          first_name || '',
          last_name || ''
        ]
      );
    }

    const userId = result.rows[0].id;
    console.log(`✅ Synced user to payroll: ${email} (${payroll_role || 'payroll_employee'})`);

    // Also create employee record in Payroll if it doesn't exist
    try {
      // Ensure employees table exists
      await query(`
        CREATE TABLE IF NOT EXISTS employees (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL,
          employee_code TEXT,
          full_name TEXT NOT NULL,
          email TEXT NOT NULL,
          phone TEXT,
          date_of_joining DATE,
          date_of_birth DATE,
          department TEXT,
          designation TEXT,
          status TEXT DEFAULT 'active',
          pan_number TEXT,
          aadhaar_number TEXT,
          bank_account_number TEXT,
          bank_ifsc TEXT,
          bank_name TEXT,
          created_by UUID,
          updated_by UUID,
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now(),
          UNIQUE(tenant_id, email)
        );
      `);

      // Check if employee already exists by email and tenant_id
      const existingEmployee = await query(
        `SELECT id FROM employees WHERE email = $1 AND tenant_id = $2`,
        [email, org_id]
      );

      if (existingEmployee.rows.length === 0) {
        // Create employee record
        const fullName = `${first_name || ''} ${last_name || ''}`.trim() || email;
        const employeeCode = `EMP-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
        
        await query(
          `INSERT INTO employees (
            tenant_id, employee_code, full_name, email, 
            department, designation, status, date_of_joining, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id, email, full_name`,
          [
            org_id,
            employeeCode,
            fullName,
            email,
            null, // department - can be updated later
            null, // designation - can be updated later
            'active',
            new Date().toISOString().split('T')[0], // date_of_joining - today
            userId // created_by
          ]
        );
        console.log(`✅ Created employee record in Payroll: ${email}`);
      } else {
        console.log(`ℹ️  Employee record already exists in Payroll: ${email}`);
      }
    } catch (employeeError: any) {
      // Log error but don't fail the user sync
      console.error(`⚠️  Failed to create employee record in Payroll (${email}):`, employeeError.message);
      // Continue - user is still synced
    }

    res.json({ ok: true, user: result.rows[0] });
  } catch (error: any) {
    console.error('Provision user error:', error);
    res.status(500).json({ error: error.message || 'Provision user failed' });
  }
});

export default router;



