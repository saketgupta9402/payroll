import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { query } from "../db.js";
import PDFDocument from "pdfkit";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

export const appRouter = Router();
appRouter.get("/test", (req, res) => {
  res.json({ message: "Router is working!" });
});

// Test route without auth to verify routing works
appRouter.post("/employees-test", (req, res) => {
  console.log("[TEST ROUTE] POST /api/employees-test called");
  res.json({ message: "Test route works!", body: req.body });
});

// Debug: Log all registered routes on startup
console.log("[ROUTES] Router initialized");
console.log("[ROUTES] POST /api/employees-test registered (test route)");

// --- UPDATED HELPER FUNCTION ---
// This function is defined once and used by the auth middleware
// Payroll uses 'users' table, not 'profiles' table
async function getUserTenant(userId: string) {
  const user = await query<{ org_id: string; email: string }>(
    "SELECT org_id as tenant_id, email FROM users WHERE id = $1",
    [userId]
  );
  if (!user.rows[0]) {
    throw new Error("User not found");
  }
  return user.rows[0];
}

// Helper function to calculate LOP days and paid days for an employee in a payroll month
async function calculateLopAndPaidDays(
  tenantId: string,
  employeeId: string,
  month: number,
  year: number
): Promise<{ lopDays: number; paidDays: number; totalWorkingDays: number }> {
  // Calculate total working days in the month
  const daysInMonth = new Date(year, month, 0).getDate();
  const totalWorkingDays = daysInMonth;

  // Get approved LOP leave requests for the month
  const leaveResult = await query<{ lop_days: string }>(
    `SELECT 
      COALESCE(SUM(CASE WHEN leave_type = 'loss_of_pay' THEN days ELSE 0 END), 0)::text as lop_days
    FROM leave_requests
    WHERE tenant_id = $1 
      AND employee_id = $2
      AND status = 'approved'
      AND (
        (EXTRACT(YEAR FROM start_date) = $3 AND EXTRACT(MONTH FROM start_date) = $4) OR
        (EXTRACT(YEAR FROM end_date) = $3 AND EXTRACT(MONTH FROM end_date) = $4) OR
        (start_date <= DATE '${year}-${month}-01' AND end_date >= DATE '${year}-${month}-01')
      )`,
    [tenantId, employeeId, year, month]
  );

  // Get LOP days from attendance records
  const attendanceResult = await query<{ lop_days_from_attendance: string }>(
    `SELECT 
      COUNT(*)::text as lop_days_from_attendance
    FROM attendance_records
    WHERE tenant_id = $1 
      AND employee_id = $2
      AND is_lop = true
      AND EXTRACT(YEAR FROM attendance_date) = $3
      AND EXTRACT(MONTH FROM attendance_date) = $4`,
    [tenantId, employeeId, year, month]
  );

  const leaveLopDays = Number(leaveResult.rows[0]?.lop_days || 0);
  const attendanceLopDays = Number(attendanceResult.rows[0]?.lop_days_from_attendance || 0);
  
  // Total LOP days (from leave requests + attendance records)
  const lopDays = leaveLopDays + attendanceLopDays;
  
  // Calculate paid days (working days - LOP days)
  const paidDays = Math.max(0, totalWorkingDays - lopDays);

  return {
    lopDays,
    paidDays,
    totalWorkingDays
  };
}

// --- UPDATED MIDDLEWARE ---
// This middleware is now async. It verifies the user AND gets their tenant info.
// If user doesn't exist, it attempts to create them from JWT token data.
function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Wrap async logic to properly handle errors
  (async () => {
    try {
      const token = (req as any).cookies?.["session"];
      if (!token) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // 1. Verify the token to get userId
      const payload = jwt.verify(token, JWT_SECRET) as any;
      const userId = payload.userId;
      (req as any).userId = userId;

      // 2. Try to fetch tenant_id and email
      let profile;
      try {
        profile = await getUserTenant(userId);
      } catch (e: any) {
        // User doesn't exist - try to create from JWT token data
        if (e.message === "User not found") {
          console.log(`[AUTH] User not found in Payroll: ${userId}, attempting to create from session`);
          
          // Try to create user from JWT payload
          const email = payload.email || null;
          const orgId = payload.orgId || payload.tenantId || null;
          const payrollRole = payload.payrollRole || 'payroll_employee';
          const hrUserId = payload.hrUserId || payload.sub || null;
          
          if (!email || !orgId) {
            console.error(`[AUTH] Cannot create user: missing email (${email}) or orgId (${orgId})`);
            return res.status(403).json({ 
              error: "User profile not found",
              message: "User does not exist in Payroll system. Please access through HR system to be auto-provisioned."
            });
          }
          
          // Create user in Payroll
          const createResult = await query(
            `INSERT INTO users (id, email, org_id, payroll_role, hr_user_id)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE SET
               email = COALESCE(EXCLUDED.email, users.email),
               org_id = COALESCE(EXCLUDED.org_id, users.org_id),
               payroll_role = COALESCE(EXCLUDED.payroll_role, users.payroll_role)
             RETURNING org_id as tenant_id, email`,
            [userId, email, orgId, payrollRole, hrUserId]
          );
          
          if (!createResult.rows[0]) {
            throw new Error("Failed to create user");
          }
          
          profile = createResult.rows[0];
          console.log(`✅ Created user from session: ${userId} (${email})`);
        } else {
          throw e;
        }
      }
      
      // Validate user data
      if (!profile.tenant_id) {
        console.error("[AUTH] User found but org_id (tenant_id) is null for userId:", userId);
        return res.status(403).json({ error: "User is not associated with an organization" });
      }
      if (!profile.email) {
        console.error("[AUTH] User found but email is null for userId:", userId);
        return res.status(403).json({ error: "User email not found" });
      }

      (req as any).tenantId = profile.tenant_id;
      (req as any).userEmail = profile.email;

      next();
    } catch (e: any) {
      let error = "Unauthorized";
      if (e.message === "User not found" || e.message === "Profile not found") {
        error = "User profile not found. Please sign in again.";
      } else if (e.name === "JsonWebTokenError") {
        error = "Invalid token";
      } else if (e.name === "TokenExpiredError") {
        error = "Token expired";
      }
      console.error("[AUTH] Authentication error:", e);
      return res.status(401).json({ error });
    }
  })().catch((err) => {
    console.error("[AUTH] Unexpected error in requireAuth:", err);
    res.status(500).json({ error: "Authentication error" });
  });
}

// --- ALL ENDPOINTS BELOW ARE NOW CORRECT ---
// They can safely assume (req as any).userId and (req as any).tenantId exist

appRouter.get("/profile", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const tenantId = (req as any).tenantId as string;
  const userEmail = (req as any).userEmail as string;
  
  // Payroll uses 'users' table, not 'profiles' table
  let result = await query(
    `SELECT 
      id,
      org_id as tenant_id, 
      email, 
      COALESCE(first_name || ' ' || last_name, email) as full_name,
      first_name,
      last_name,
      payroll_role,
      hr_user_id
    FROM users WHERE id = $1`,
    [userId]
  );
  
  // If user doesn't exist, try to create from session data
  if (!result.rows[0]) {
    console.log(`[PROFILE] User not found in Payroll: ${userId}, attempting to create from session`);
    
    // Try to get user info from JWT token (might have hr_user_id)
    const token = (req as any).cookies?.["session"];
    if (token) {
      try {
        const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
        const payload = jwt.verify(token, JWT_SECRET) as any;
        
        // Try to create user with minimal info from session
        // This happens if user was created but not properly synced
        const insertResult = await query(
          `INSERT INTO users (id, email, org_id, payroll_role, hr_user_id)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET
             email = COALESCE(EXCLUDED.email, users.email),
             org_id = COALESCE(EXCLUDED.org_id, users.org_id),
             payroll_role = COALESCE(EXCLUDED.payroll_role, users.payroll_role)
           RETURNING id, org_id as tenant_id, email,
             COALESCE(first_name || ' ' || last_name, email) as full_name,
             first_name, last_name, payroll_role, hr_user_id`,
          [
            userId,
            userEmail || payload.email || null,
            tenantId || payload.orgId || null,
            payload.payrollRole || 'payroll_employee',
            payload.hrUserId || null
          ]
        );
        
        result = insertResult;
        console.log(`✅ Created user profile from session: ${userId}`);
      } catch (createError: any) {
        console.error(`[PROFILE] Failed to create user from session:`, createError);
        // Continue to return 404 below
      }
    }
    
    // If still no user, return 404
    if (!result.rows[0]) {
      console.error(`[PROFILE] User not found and could not be created: ${userId}`);
      return res.status(404).json({ 
        error: 'User profile not found',
        message: 'User does not exist in Payroll system. Please access through HR system to be auto-provisioned.'
      });
    }
  }
  
  return res.json({ profile: result.rows[0] });
});

appRouter.get("/tenant", requireAuth, async (req, res) => {
  const tenantId = (req as any).tenantId as string;
  if (!tenantId) return res.json({ tenant: null });
  
  // Payroll uses 'organizations' table, not 'tenants' table
  try {
    // Try to find organization by org_id first, then by id
    const tenant = await query(
      `SELECT id, COALESCE(company_name, org_name, 'Organization') as company_name, 
              org_id, subdomain 
       FROM organizations 
       WHERE org_id = $1 OR id = $1`,
      [tenantId]
    );
    
    // If organization found, return it
    if (tenant.rows.length > 0) {
      return res.json({ tenant: tenant.rows[0] });
    }
    
    // If no organization found, create a minimal one
    try {
      const insertResult = await query(
        `INSERT INTO organizations (org_id, company_name, id)
         VALUES ($1, 'Organization', gen_random_uuid())
         ON CONFLICT (org_id) DO UPDATE SET company_name = COALESCE(organizations.company_name, 'Organization')
         RETURNING id, COALESCE(company_name, org_name, 'Organization') as company_name, org_id, subdomain`,
        [tenantId]
      );
      if (insertResult.rows.length > 0) {
        return res.json({ tenant: insertResult.rows[0] });
      }
      
      // Fallback: query again
      const created = await query(
        `SELECT id, COALESCE(company_name, org_name, 'Organization') as company_name, org_id, subdomain 
         FROM organizations WHERE org_id = $1`,
        [tenantId]
      );
      return res.json({ tenant: created.rows[0] || { id: tenantId, company_name: 'Organization', org_id: tenantId } });
    } catch (createError: any) {
      // If creation fails, return a default tenant
      console.error('Error creating organization:', createError.message);
      return res.json({ 
        tenant: { 
          id: tenantId, 
          company_name: 'Organization',
          org_id: tenantId 
        } 
      });
    }
  } catch (error: any) {
    // If query fails (table doesn't exist), return default tenant
    console.error('Error fetching tenant:', error.message);
    return res.json({ 
      tenant: { 
        id: tenantId, 
        company_name: 'Organization',
        org_id: tenantId 
      } 
    });
  }
});

appRouter.get("/stats", requireAuth, async (req, res) => {
  const tenantId = (req as any).tenantId as string;
  if (!tenantId) {
    return res.json({ 
      stats: { 
        totalEmployees: 0, 
        monthlyPayroll: 0, 
        pendingApprovals: 0, 
        activeCycles: 0,
        totalNetPayable: 0,
        completedCycles: 0,
        totalAnnualPayroll: 0
      } 
    });
  }

  // Get employee count
  const employeeCountQ = await query<{ count: string }>(
    "SELECT count(*)::text as count FROM employees WHERE tenant_id = $1 AND status = 'active'",
    [tenantId]
  );
  const totalEmployees = Number(employeeCountQ.rows[0]?.count || 0);

  // Get payroll cycles stats
  const cyclesQ = await query<{ total_amount: string; status: string; year: number; net_total?: string }>(
    `SELECT 
      total_amount::text, 
      status,
      year,
      (
        SELECT COALESCE(SUM(net_salary), 0)::text 
        FROM payroll_items 
        WHERE payroll_cycle_id = payroll_cycles.id
      ) as net_total
    FROM payroll_cycles 
    WHERE tenant_id = $1 
    ORDER BY created_at DESC`,
    [tenantId]
  );

  const cycles = cyclesQ.rows;
  const activeCycles = cycles.filter(c => c.status === "draft").length;
  const pendingApprovals = cycles.filter(c => c.status === "pending_approval").length;
  const completedCycles = cycles.filter(c => c.status === "completed").length;
  
  // Get last approved/completed cycle for monthly payroll
  const lastCompleted = cycles.find(c => c.status === "completed" || c.status === "approved");
  const monthlyPayroll = lastCompleted ? Number(lastCompleted.total_amount) : 0;
  const totalNetPayable = lastCompleted ? Number(lastCompleted.net_total || 0) : 0;

  // Calculate total annual payroll (sum of all completed cycles this year)
  const currentYear = new Date().getFullYear();
  const annualCycles = cycles.filter(c => 
    (c.status === "completed" || c.status === "approved") && 
    c.year === currentYear
  );
  const totalAnnualPayroll = annualCycles.reduce((sum, cycle) => sum + Number(cycle.total_amount || 0), 0);

  return res.json({ 
    stats: { 
      totalEmployees, 
      monthlyPayroll, 
      pendingApprovals, 
      activeCycles,
      totalNetPayable,
      completedCycles,
      totalAnnualPayroll
    } 
  });
});

appRouter.get("/payroll-cycles", requireAuth, async (req, res) => {
  const tenantId = (req as any).tenantId as string;
  if (!tenantId) return res.json({ cycles: [] });
  
  // Get current month and year
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentYear = now.getFullYear();
  
  // Auto-update past payroll cycles to "completed" status
  await query(
    `UPDATE payroll_cycles 
     SET status = 'completed', updated_at = NOW()
     WHERE tenant_id = $1 
       AND status != 'completed' 
       AND status != 'failed'
       AND (
         year < $2 OR 
         (year = $2 AND month < $3)
       )`,
    [tenantId, currentYear, currentMonth]
  );
  
  // Get cycles with recalculated employee counts from payroll_items
  const rows = await query(
    `SELECT 
      pc.id, 
      pc.year, 
      pc.month, 
      pc.total_amount, 
      pc.status, 
      pc.created_at,
      COALESCE(
        (SELECT COUNT(DISTINCT employee_id) 
         FROM payroll_items 
         WHERE payroll_cycle_id = pc.id AND tenant_id = $1), 
        pc.total_employees
      ) as total_employees
    FROM payroll_cycles pc 
    WHERE pc.tenant_id = $1 
    ORDER BY pc.year DESC, pc.month DESC`,
    [tenantId]
  );
  
  // Update any cycles that have incorrect employee counts
  for (const cycle of rows.rows) {
    const itemCount = await query<{ count: string }>(
      "SELECT COUNT(DISTINCT employee_id)::text as count FROM payroll_items WHERE payroll_cycle_id = $1 AND tenant_id = $2",
      [cycle.id, tenantId]
    );
    const correctCount = parseInt(itemCount.rows[0]?.count || "0", 10);
    // Update if count is different (and we have items)
    if (correctCount !== Number(cycle.total_employees) && correctCount > 0) {
      await query(
        "UPDATE payroll_cycles SET total_employees = $1 WHERE id = $2 AND tenant_id = $3",
        [correctCount, cycle.id, tenantId]
      );
      (cycle as any).total_employees = correctCount; // Update in response
    }
  }
  
  return res.json({ cycles: rows.rows });
});

appRouter.get("/employees/me", requireAuth, async (req, res) => {
  const tenantId = (req as any).tenantId as string;
  const email = (req as any).userEmail as string;

  if (!tenantId || !email) return res.json({ employee: null });
  
  const emp = await query(
    "SELECT * FROM employees WHERE tenant_id = $1 AND email = $2 LIMIT 1",
    [tenantId, email]
  );
  return res.json({ employee: emp.rows[0] || null });
});

appRouter.get("/payslips", requireAuth, async (req, res) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const email = (req as any).userEmail as string;
    
    // Get current month and year
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentYear = now.getFullYear();
    
    // First, update any past payroll cycles to "completed" status
    await query(
      `UPDATE payroll_cycles 
       SET status = 'completed', updated_at = NOW()
       WHERE tenant_id = $1 
         AND status != 'completed' 
         AND status != 'failed'
         AND (
           year < $2 OR 
           (year = $2 AND month < $3)
         )`,
      [tenantId, currentYear, currentMonth]
    );
    
    const emp = await query<{ id: string; date_of_joining: string }>(
      "SELECT id, date_of_joining FROM employees WHERE tenant_id = $1 AND email = $2 LIMIT 1",
      [tenantId, email]
    );
    
    if (!emp.rows[0]) {
      return res.json({ payslips: [] });
    }
    const employeeId = emp.rows[0].id;
    const dateOfJoining = emp.rows[0].date_of_joining ? new Date(emp.rows[0].date_of_joining) : null;

    // Backfill: Process ALL employees for all past months (excluding current month)
    // This ensures payroll cycles have correct totals for all employees
    // Fetch payroll settings once
    let settings: any = {
      pf_rate: 12.0,
      esi_rate: 3.25,
      pt_rate: 200.0,
      tds_threshold: 250000.0,
      basic_salary_percentage: 40.0,
      hra_percentage: 40.0,
      special_allowance_percentage: 20.0,
    };
    try {
      const settingsResult = await query(
        "SELECT * FROM payroll_settings WHERE tenant_id = $1",
        [tenantId]
      );
      if (settingsResult.rows[0]) settings = settingsResult.rows[0];
    } catch (err) {
      console.warn("[PAYSLIPS] payroll_settings not found, using defaults");
    }

    // Get earliest joining date across all employees (not just this one)
    const earliestJoin = await query<{ date_of_joining: string }>(
      `SELECT MIN(date_of_joining) as date_of_joining 
       FROM employees 
       WHERE tenant_id = $1 AND date_of_joining IS NOT NULL AND status != 'terminated'`,
      [tenantId]
    );

    if (earliestJoin.rows[0]?.date_of_joining) {
      const startDate = new Date(earliestJoin.rows[0].date_of_joining);
      // Process only up to last month (exclude current month)
      const start = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      // Calculate last month to process (exclude current month)
      // If current month is November (11), we process up to October (10)
      const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1;
      const lastYear = currentMonth === 1 ? currentYear - 1 : currentYear;

      const iter = new Date(start);
      while (true) {
        const y = iter.getFullYear();
        const m = iter.getMonth() + 1; // 1-12
        
        // Stop if we've reached or passed the current month
        // Strict check: if current month is November (11), lastMonth is 10, so we process up to October
        if (y > lastYear || (y === lastYear && m > lastMonth)) {
          console.log(`[PAYSLIPS] Stopping backfill - reached current month (processing up to ${lastMonth}/${lastYear}, current is ${currentMonth}/${currentYear})`);
          break;
        }
        
        // Double-check: never process the current month
        if (y === currentYear && m === currentMonth) {
          console.log(`[PAYSLIPS] Skipping current month ${m}/${y}`);
          iter.setMonth(iter.getMonth() + 1);
          continue;
        }
        
        console.log(`[PAYSLIPS] Processing month ${m}/${y}`);
        const monthEnd = new Date(y, m, 0);

        // Ensure payroll cycle exists
        let cycleId: string;
        try {
          const cycleRow = await query(
            `INSERT INTO payroll_cycles (tenant_id, month, year, status, total_employees, total_amount)
             VALUES ($1, $2, $3, 'draft', 0, 0)
             ON CONFLICT (tenant_id, month, year) DO NOTHING
             RETURNING *`,
            [tenantId, m, y]
          );
          
          if (cycleRow.rows[0]) {
            cycleId = cycleRow.rows[0].id;
          } else {
            const existing = await query<{ id: string }>(
              "SELECT id FROM payroll_cycles WHERE tenant_id = $1 AND month = $2 AND year = $3 LIMIT 1",
              [tenantId, m, y]
            );
            if (!existing.rows[0]) {
              iter.setMonth(iter.getMonth() + 1);
              continue;
            }
            cycleId = existing.rows[0].id;
          }
        } catch (err) {
          console.error("[PAYSLIPS] Failed to ensure cycle for", y, m, err);
          iter.setMonth(iter.getMonth() + 1);
          continue;
        }

        // Process ALL active employees who were employed by this month
        try {
          const allEmployees = await query<{ id: string }>(
            `SELECT id FROM employees 
             WHERE tenant_id = $1 
               AND status = 'active' 
               AND (date_of_joining IS NULL OR date_of_joining <= $2)`,
            [tenantId, monthEnd.toISOString()]
          );

          // First, get ALL existing payroll items for this cycle to count correctly
          const existingItems = await query<{ employee_id: string; gross_salary: number }>(
            "SELECT employee_id, gross_salary FROM payroll_items WHERE tenant_id = $1 AND payroll_cycle_id = $2",
            [tenantId, cycleId]
          );

          let processedCount = existingItems.rows.length; // Start with existing count
          let totalGross = existingItems.rows.reduce((sum, item) => sum + (Number(item.gross_salary) || 0), 0);

          // Track which employees already have items
          const employeesWithItems = new Set<string>(existingItems.rows.map(item => item.employee_id));

          for (const emp of allEmployees.rows) {
            // Skip if employee already has a payroll item
            if (employeesWithItems.has(emp.id)) {
              continue;
            }

            // Find compensation effective for this month
            const compResult = await query(
              `SELECT * FROM compensation_structures
               WHERE employee_id = $1 AND tenant_id = $2 AND effective_from <= $3
               ORDER BY effective_from DESC LIMIT 1`,
              [emp.id, tenantId, monthEnd.toISOString()]
            );

            if (compResult.rows.length === 0) continue;

            const c = compResult.rows[0];
            let basic = Number(c.basic_salary) || 0;
            let hra = Number(c.hra) || 0;
            let sa = Number(c.special_allowance) || 0;
            const da = Number(c.da) || 0;
            const lta = Number(c.lta) || 0;
            const bonus = Number(c.bonus) || 0;
            let gross = basic + hra + sa + da + lta + bonus;

            // Fallback from CTC if components are zero
            if (gross === 0 && c.ctc) {
              const monthlyCtc = Number(c.ctc) / 12;
              const basicPct = Number((settings as any).basic_salary_percentage || 40);
              const hraPct = Number((settings as any).hra_percentage || 40);
              const saPct = Number((settings as any).special_allowance_percentage || 20);
              basic = (monthlyCtc * basicPct) / 100;
              hra = (monthlyCtc * hraPct) / 100;
              sa = (monthlyCtc * saPct) / 100;
              gross = basic + hra + sa;
            }

            if (gross === 0) continue; // Skip if no salary

            // Calculate LOP days and paid days for this month
            const { lopDays, paidDays, totalWorkingDays } = await calculateLopAndPaidDays(
              tenantId,
              emp.id,
              m,
              y
            );

            // Adjust gross salary based on paid days (proportional deduction for LOP)
            const dailyRate = gross / totalWorkingDays;
            const adjustedGross = dailyRate * paidDays;

            // Recalculate components proportionally
            const adjustmentRatio = paidDays / totalWorkingDays;
            const adjustedBasic = basic * adjustmentRatio;
            const adjustedHra = hra * adjustmentRatio;
            const adjustedSa = sa * adjustmentRatio;

            // Calculate deductions based on adjusted gross
            const pf = (adjustedBasic * Number(settings.pf_rate)) / 100;
            const esi = adjustedGross <= 21000 ? (adjustedGross * 0.75) / 100 : 0;
            const pt = Number(settings.pt_rate) || 200;
            const annual = adjustedGross * 12;
            const tds = annual > Number(settings.tds_threshold) ? ((annual - Number(settings.tds_threshold)) * 5) / 100 / 12 : 0;
            const deductions = pf + esi + pt + tds;
            const net = adjustedGross - deductions;

            await query(
              `INSERT INTO payroll_items (
                tenant_id, payroll_cycle_id, employee_id,
                gross_salary, deductions, net_salary,
                basic_salary, hra, special_allowance,
                pf_deduction, esi_deduction, tds_deduction, pt_deduction,
                lop_days, paid_days, total_working_days
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
              ON CONFLICT (payroll_cycle_id, employee_id) DO UPDATE SET
                gross_salary = EXCLUDED.gross_salary,
                deductions = EXCLUDED.deductions,
                net_salary = EXCLUDED.net_salary,
                basic_salary = EXCLUDED.basic_salary,
                hra = EXCLUDED.hra,
                special_allowance = EXCLUDED.special_allowance,
                pf_deduction = EXCLUDED.pf_deduction,
                esi_deduction = EXCLUDED.esi_deduction,
                tds_deduction = EXCLUDED.tds_deduction,
                pt_deduction = EXCLUDED.pt_deduction,
                lop_days = EXCLUDED.lop_days,
                paid_days = EXCLUDED.paid_days,
                total_working_days = EXCLUDED.total_working_days,
                updated_at = NOW()`,
              [tenantId, cycleId, emp.id, adjustedGross, deductions, net, adjustedBasic, adjustedHra, adjustedSa, pf, esi, tds, pt, lopDays, paidDays, totalWorkingDays]
            );

            processedCount++;
            totalGross += adjustedGross;
          }

          // Update cycle totals with correct counts
          await query(
            `UPDATE payroll_cycles SET 
               status = 'completed',
               total_employees = $1,
               total_amount = $2,
               updated_at = NOW()
             WHERE id = $3 AND tenant_id = $4`,
            [processedCount, totalGross, cycleId, tenantId]
          );
        } catch (err) {
          console.error("[PAYSLIPS] Failed to process employees for cycle", cycleId, err);
        }

        iter.setMonth(iter.getMonth() + 1);
      }
    }

    // Fetch payslips - show payslips from approved, completed, or processing cycles
    // Note: 'completed' includes past-month payrolls that were processed
    const result = await query(
      `
        SELECT
          pi.*,
          pc.month,
          pc.year,
          pc.status
        FROM payroll_items AS pi
        JOIN payroll_cycles AS pc ON pi.payroll_cycle_id = pc.id
        WHERE pi.employee_id = $1
          AND pi.tenant_id = $2
          AND pc.status IN ('approved', 'completed', 'processing')
        ORDER BY pc.year DESC, pc.month DESC
      `,
      [employeeId, tenantId]
    );

    const payslips = result.rows.map(row => ({
      ...row,
      payroll_cycles: {
        month: row.month,
        year: row.year,
        status: row.status,
      }
    }));
    
    return res.json({ payslips: payslips });

  } catch (e: any) {
    console.error("Error fetching payslips:", e);
    res.status(500).json({ error: e.message || "Failed to fetch payslips" });
  }
});

// Download payslip as PDF
// Supports both employee self-service and admin access (admin can download any payslip in their tenant)
appRouter.get("/payslips/:payslipId/pdf", requireAuth, async (req, res) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const email = (req as any).userEmail as string;
    const { payslipId } = req.params;

    // First, get the payslip to check if it exists and belongs to the tenant
    const payslipCheck = await query(
      "SELECT employee_id, tenant_id FROM payroll_items WHERE id = $1",
      [payslipId]
    );

    if (payslipCheck.rows.length === 0) {
      return res.status(404).json({ error: "Payslip not found" });
    }

    if (payslipCheck.rows[0].tenant_id !== tenantId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Check if user is an employee (self-service) or admin
    const emp = await query<{ id: string }>(
      "SELECT id FROM employees WHERE tenant_id = $1 AND email = $2 LIMIT 1",
      [tenantId, email]
    );

    const employeeId = emp.rows[0]?.id;
    const isEmployee = !!employeeId;
    
    // If user is an employee, verify they own this payslip
    if (isEmployee && payslipCheck.rows[0].employee_id !== employeeId) {
      return res.status(403).json({ error: "You can only download your own payslips" });
    }

    // If not an employee, assume admin (they can download any payslip in their tenant)

    // Get payslip with employee and cycle details including all employee fields
    const payslipResult = await query(
      `
      SELECT 
        pi.*,
        e.full_name,
        e.employee_code,
        e.email,
        e.designation,
        e.department,
        e.date_of_joining,
        e.pan_number,
        e.bank_account_number,
        e.bank_ifsc,
        e.bank_name,
        pc.month,
        pc.year,
        pc.payday,
        t.company_name as tenant_name
      FROM payroll_items pi
      JOIN employees e ON pi.employee_id = e.id
      JOIN payroll_cycles pc ON pi.payroll_cycle_id = pc.id
      LEFT JOIN tenants t ON e.tenant_id = t.id
      WHERE pi.id = $1 
        AND pi.tenant_id = $2
      `,
      [payslipId, tenantId]
    );

    if (payslipResult.rows.length === 0) {
      return res.status(404).json({ error: "Payslip not found" });
    }

    const payslip = payslipResult.rows[0];
    const monthName = new Date(2000, payslip.month - 1).toLocaleString('en-IN', { month: 'long' });
    
    // Get LOP days and paid days from payroll_items (if available, otherwise calculate)
    const totalWorkingDays = Number(payslip.total_working_days) || new Date(payslip.year, payslip.month, 0).getDate();
    const lopDays = Number(payslip.lop_days) || 0;
    const totalPaidDays = Number(payslip.paid_days) || totalWorkingDays;

    // Create PDF
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="payslip-${payslip.employee_code}-${monthName}-${payslip.year}.pdf"`
    );

    // Pipe PDF to response
    doc.pipe(res);

    // Helper function to format currency (number only, no ₹ symbol for table cells)
    const formatCurrency = (amount: number) => {
      return Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
    };

    // Helper to format date
    const formatDate = (date: string | Date) => {
      if (!date) return 'N/A';
      const d = new Date(date);
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'numeric', year: 'numeric' });
    };

    // Calculate additional allowances from gross - (basic + hra + special)
    // These can be stored in compensation_structures or calculated
    const basic = Number(payslip.basic_salary) || 0;
    const hra = Number(payslip.hra) || 0;
    const special = Number(payslip.special_allowance) || 0;
    const gross = Number(payslip.gross_salary) || 0;
    const remaining = gross - (basic + hra + special);
    
    // Distribute remaining as other allowances (can be customized)
    const conveyanceAllowance = Math.round(remaining * 0.3); // 30% of remaining
    const cca = Math.round(remaining * 0.2); // 20% of remaining
    const medicalAllowance = Math.round(remaining * 0.15); // 15% of remaining
    const lta = Math.round(remaining * 0.15); // 15% of remaining
    const bonus = Number(payslip.bonus) || 0;

    const startY = doc.y;
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 40;
    const contentWidth = pageWidth - (margin * 2);

    // ===== HEADER SECTION =====
    // Company Logo Area (left side - placeholder for logo)
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#DC2626'); // Red color
    doc.text('ZARAVYA', margin, margin);
    doc.fontSize(8).font('Helvetica').fillColor('#000000');
    doc.text('INFORMATION DESTILLED', margin, margin + 20);
    
    // Company Name and Details (right side)
    const companyName = payslip.tenant_name || 'COMPANY NAME';
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000');
    doc.text(companyName.toUpperCase(), margin + 200, margin, { width: 300, align: 'right' });
    
    // Company Address (placeholder - can be added to tenants table)
    doc.fontSize(8).font('Helvetica');
    doc.text('Mezzenine Floor, Block D, Cyber Gateway, Hitech City,', margin + 200, margin + 20, { width: 300, align: 'right' });
    doc.text('Madhapur, Hyderabad - 500081', margin + 200, margin + 32, { width: 300, align: 'right' });
    doc.text('www.zaravya.com', margin + 200, margin + 44, { width: 300, align: 'right' });

    // Title
    doc.moveDown(3);
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000');
    doc.text(`Pay Slip for the month of ${monthName} - ${payslip.year}`, { align: 'center' });
    doc.moveDown(1);

    // ===== EMPLOYEE DETAILS TABLE =====
    const tableStartY = doc.y;
    const rowHeight = 18;
    const col1Width = contentWidth / 2;
    const col2Width = contentWidth / 2;
    const numRows = 6;
    
    // Draw table borders
    doc.rect(margin, tableStartY, contentWidth, rowHeight * numRows).stroke();
    doc.moveTo(margin + col1Width, tableStartY).lineTo(margin + col1Width, tableStartY + rowHeight * numRows).stroke();
    for (let i = 1; i < numRows; i++) {
      doc.moveTo(margin, tableStartY + rowHeight * i).lineTo(margin + contentWidth, tableStartY + rowHeight * i).stroke();
    }

    // Left Column - Row 1
    doc.fontSize(9).font('Helvetica');
    doc.text('Employee No:', margin + 5, tableStartY + 3);
    doc.font('Helvetica-Bold').text(payslip.employee_code || 'N/A', margin + 80, tableStartY + 3);
    
    // Left Column - Row 2
    doc.font('Helvetica').text('Employee Name:', margin + 5, tableStartY + rowHeight + 3);
    doc.font('Helvetica-Bold').text(payslip.full_name || 'N/A', margin + 80, tableStartY + rowHeight + 3);
    
    // Left Column - Row 3
    doc.font('Helvetica').text('Designation:', margin + 5, tableStartY + rowHeight * 2 + 3);
    doc.font('Helvetica-Bold').text(payslip.designation || 'N/A', margin + 80, tableStartY + rowHeight * 2 + 3);
    
    // Left Column - Row 4
    doc.font('Helvetica').text('DOI:', margin + 5, tableStartY + rowHeight * 3 + 3);
    doc.font('Helvetica-Bold').text(formatDate(payslip.date_of_joining), margin + 80, tableStartY + rowHeight * 3 + 3);
    
    // Left Column - Row 5
    doc.font('Helvetica').text('EPF No.:', margin + 5, tableStartY + rowHeight * 4 + 3);
    doc.font('Helvetica-Bold').text('N/A', margin + 80, tableStartY + rowHeight * 4 + 3); // EPF not in schema
    
    // Left Column - Row 6
    doc.font('Helvetica').text('Total Working Days:', margin + 5, tableStartY + rowHeight * 5 + 3);
    doc.font('Helvetica-Bold').text(totalWorkingDays.toString(), margin + 80, tableStartY + rowHeight * 5 + 3);

    // Right Column - Row 1
    doc.font('Helvetica').text('PAN:', margin + col1Width + 5, tableStartY + 3);
    doc.font('Helvetica-Bold').text(payslip.pan_number || 'N/A', margin + col1Width + 60, tableStartY + 3);
    
    // Right Column - Row 2
    doc.font('Helvetica').text('Bank Name:', margin + col1Width + 5, tableStartY + rowHeight + 3);
    doc.font('Helvetica-Bold').text(payslip.bank_name || 'N/A', margin + col1Width + 60, tableStartY + rowHeight + 3);
    
    // Right Column - Row 3
    doc.font('Helvetica').text('Bank Account Number:', margin + col1Width + 5, tableStartY + rowHeight * 2 + 3);
    doc.font('Helvetica-Bold').text(payslip.bank_account_number || 'N/A', margin + col1Width + 60, tableStartY + rowHeight * 2 + 3);
    
    // Right Column - Row 4
    doc.font('Helvetica').text('Gross Salary:', margin + col1Width + 5, tableStartY + rowHeight * 3 + 3);
    doc.font('Helvetica-Bold').text(formatCurrency(gross), margin + col1Width + 60, tableStartY + rowHeight * 3 + 3);
    
    // Right Column - Row 5
    doc.font('Helvetica').text('UAN:', margin + col1Width + 5, tableStartY + rowHeight * 4 + 3);
    doc.font('Helvetica-Bold').text('N/A', margin + col1Width + 60, tableStartY + rowHeight * 4 + 3); // UAN not in schema
    
    // Right Column - Row 6
    doc.font('Helvetica').text('Total Paid Days:', margin + col1Width + 5, tableStartY + rowHeight * 5 + 3);
    doc.font('Helvetica-Bold').text(totalPaidDays.toString(), margin + col1Width + 60, tableStartY + rowHeight * 5 + 3);
    
    doc.y = tableStartY + rowHeight * numRows + 10;
    
    // "Amount in Rs." label
    doc.fontSize(9).font('Helvetica').text('Amount in Rs.', { align: 'right' });
    doc.moveDown(0.5);

    // ===== EARNINGS AND DEDUCTIONS TABLE =====
    const earningsDeductionsY = doc.y;
    const earningsColWidth = contentWidth / 2;
    const itemColWidth = earningsColWidth / 2;
    const amountColWidth = earningsColWidth / 2;
    const maxRows = Math.max(8, 8); // Max rows for earnings and deductions
    
    // Table header
    doc.rect(margin, earningsDeductionsY, earningsColWidth, 20).stroke();
    doc.rect(margin + earningsColWidth, earningsDeductionsY, earningsColWidth, 20).stroke();
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('EARNINGS', margin + earningsColWidth / 2, earningsDeductionsY + 5, { width: earningsColWidth, align: 'center' });
    doc.text('DEDUCTIONS', margin + earningsColWidth + earningsColWidth / 2, earningsDeductionsY + 5, { width: earningsColWidth, align: 'center' });
    
    // Draw vertical line in middle
    doc.moveTo(margin + earningsColWidth, earningsDeductionsY).lineTo(margin + earningsColWidth, earningsDeductionsY + 20 * (maxRows + 1)).stroke();
    
    // Earnings rows
    const earningsItems = [
      { label: 'Basic Salary', amount: basic },
      { label: 'House Rent Allowance(HRA)', amount: hra },
      { label: 'Conveyance Allowance', amount: conveyanceAllowance },
      { label: 'CCA', amount: cca },
      { label: 'Medical Allowance', amount: medicalAllowance },
      { label: 'LTA', amount: lta },
      { label: 'Special Allowance', amount: special },
      { label: 'Bonus', amount: bonus },
    ];
    
    // Deductions rows
    const deductionsItems = [
      { label: 'Provident Fund', amount: Number(payslip.pf_deduction) || 0 },
      { label: 'ESI', amount: Number(payslip.esi_deduction) || 0 },
      { label: 'Professional Tax', amount: Number(payslip.pt_deduction) || 0 },
      { label: 'Income Tax (TDS)', amount: Number(payslip.tds_deduction) || 0 },
      { label: 'Medical Insurance', amount: 0 },
      { label: 'Other', amount: 0 },
    ];
    
    // Draw earnings table
    for (let i = 0; i < maxRows; i++) {
      const rowY = earningsDeductionsY + 20 + (i * 20);
      doc.rect(margin, rowY, itemColWidth, 20).stroke();
      doc.rect(margin + itemColWidth, rowY, amountColWidth, 20).stroke();
      
      if (earningsItems[i]) {
        doc.fontSize(8).font('Helvetica');
        doc.text(earningsItems[i].label, margin + 2, rowY + 5, { width: itemColWidth - 4 });
        doc.font('Helvetica-Bold');
        doc.text(formatCurrency(earningsItems[i].amount), margin + itemColWidth + 2, rowY + 5, { width: amountColWidth - 4, align: 'right' });
      }
    }
    
    // Draw deductions table
    for (let i = 0; i < maxRows; i++) {
      const rowY = earningsDeductionsY + 20 + (i * 20);
      doc.rect(margin + earningsColWidth, rowY, itemColWidth, 20).stroke();
      doc.rect(margin + earningsColWidth + itemColWidth, rowY, amountColWidth, 20).stroke();
      
      if (deductionsItems[i]) {
        doc.fontSize(8).font('Helvetica');
        doc.text(deductionsItems[i].label, margin + earningsColWidth + 2, rowY + 5, { width: itemColWidth - 4 });
        doc.font('Helvetica-Bold');
        doc.text(formatCurrency(deductionsItems[i].amount), margin + earningsColWidth + itemColWidth + 2, rowY + 5, { width: amountColWidth - 4, align: 'right' });
      }
    }
    
    // Summary section
    const summaryY = earningsDeductionsY + 20 * (maxRows + 1) + 10;
    const summaryRowHeight = 25;
    
    // Total Earnings
    doc.rect(margin, summaryY, contentWidth / 3, summaryRowHeight).stroke();
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Total Earnings', margin + 5, summaryY + 8, { width: contentWidth / 3 - 10 });
    doc.text(formatCurrency(gross), margin + 5, summaryY + 8, { width: contentWidth / 3 - 10, align: 'right' });
    
    // Total Deductions
    doc.rect(margin + contentWidth / 3, summaryY, contentWidth / 3, summaryRowHeight).stroke();
    doc.text('Total Deductions', margin + contentWidth / 3 + 5, summaryY + 8, { width: contentWidth / 3 - 10 });
    const totalDeductions = Number(payslip.deductions) || 0;
    doc.text(formatCurrency(totalDeductions), margin + contentWidth / 3 + 5, summaryY + 8, { width: contentWidth / 3 - 10, align: 'right' });
    
    // Net Salary
    doc.rect(margin + (contentWidth / 3) * 2, summaryY, contentWidth / 3, summaryRowHeight).stroke();
    doc.fontSize(12);
    doc.text('Net Salary', margin + (contentWidth / 3) * 2 + 5, summaryY + 8, { width: contentWidth / 3 - 10 });
    const netSalary = Number(payslip.net_salary) || 0;
    doc.text(formatCurrency(netSalary), margin + (contentWidth / 3) * 2 + 5, summaryY + 8, { width: contentWidth / 3 - 10, align: 'right' });
    
    doc.y = summaryY + summaryRowHeight + 20;

    // ===== FOOTER =====
    doc.moveDown(2);
    doc.fontSize(8).font('Helvetica').fillColor('#666666');
    doc.text(
      'This is computer generated pay slip, does not require signature.',
      { align: 'center' }
    );
    doc.fillColor('#000000'); // Reset to black

    // Finalize PDF
    doc.end();

  } catch (e: any) {
    console.error("Error generating payslip PDF:", e);
    if (!res.headersSent) {
      res.status(500).json({ error: e.message || "Failed to generate payslip PDF" });
    }
  }
});

appRouter.get("/tax-declarations", requireAuth, async (req, res) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const email = (req as any).userEmail as string;

    const emp = await query<{ id: string }>(
      "SELECT id FROM employees WHERE tenant_id = $1 AND email = $2 LIMIT 1",
      [tenantId, email]
    );
    
    if (!emp.rows[0]) {
      return res.json({ declarations: [] });
    }
    const employeeId = emp.rows[0].id;

    const result = await query(
      "SELECT * FROM tax_declarations WHERE employee_id = $1 AND tenant_id = $2 ORDER BY created_at DESC",
      [employeeId, tenantId]
    );

    return res.json({ declarations: result.rows });

  } catch (e: any) {
    console.error("Error fetching tax declarations:", e);
    res.status(500).json({ error: e.message || "Failed to fetch tax declarations" });
  }
});

appRouter.post("/tax-declarations", requireAuth, async (req, res) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const email = (req as any).userEmail as string;
    const { financial_year, declaration_data } = req.body;

    if (!financial_year || !declaration_data) {
      return res.status(400).json({ error: "Missing financial_year or declaration_data" });
    }

    const emp = await query<{ id: string }>(
      "SELECT id FROM employees WHERE tenant_id = $1 AND email = $2 LIMIT 1",
      [tenantId, email]
    );
    
    if (!emp.rows[0]) {
      return res.status(404).json({ error: "Employee record not found" });
    }
    const employeeId = emp.rows[0].id;

    const result = await query(
      `INSERT INTO tax_declarations 
        (employee_id, tenant_id, financial_year, declaration_data, status, submitted_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [employeeId, tenantId, financial_year, declaration_data, 'submitted', new Date().toISOString()]
    );

    return res.status(201).json({ declaration: result.rows[0] });

  } catch (e: any) {
    console.error("Error creating tax declaration:", e);
    res.status(500).json({ error: e.message || "Failed to create tax declaration" });
  }
});

appRouter.get("/tax-documents", requireAuth, async (req, res) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const email = (req as any).userEmail as string;

    const emp = await query<{ id: string }>(
      "SELECT id FROM employees WHERE tenant_id = $1 AND email = $2 LIMIT 1",
      [tenantId, email]
    );
    
    if (!emp.rows[0]) {
      return res.json({ documents: [] });
    }
    const employeeId = emp.rows[0].id;

    const result = await query(
      "SELECT * FROM tax_documents WHERE employee_id = $1 AND tenant_id = $2 ORDER BY generated_at DESC",
      [employeeId, tenantId]
    );

    return res.json({ documents: result.rows });

  } catch (e: any) {
    console.error("Error fetching tax documents:", e);
    res.status(500).json({ error: e.message || "Failed to fetch tax documents" });
  }
});

// Register POST /employees route
console.log("[ROUTES] Registering POST /employees route");
appRouter.post("/employees", requireAuth, async (req, res) => {
  console.log("[ROUTE HANDLER] POST /api/employees called"); // Debug log
  try {
    const userId = (req as any).userId as string;
    const tenantId = (req as any).tenantId as string;
    
    const {
      employee_code,
      full_name,
      email,
      phone,
      date_of_joining,
      date_of_birth,
      department,
      designation,
      status,
      pan_number,
      aadhaar_number,
      bank_account_number,
      bank_ifsc,
      bank_name,
    } = req.body;

    if (!employee_code || !full_name || !email || !date_of_joining) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const created_by = userId;
    const updated_by = userId;

    const result = await query(
      `INSERT INTO employees (
        tenant_id, employee_code, full_name, email, phone, date_of_joining, 
        date_of_birth, department, designation, status, pan_number, aadhaar_number, 
        bank_account_number, bank_ifsc, bank_name, created_by, updated_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
      ) RETURNING *`,
      [
        tenantId, 
        employee_code, 
        full_name, 
        email, 
        phone || null, 
        date_of_joining,
        date_of_birth || null, 
        department || null, 
        designation || null, 
        status || 'active', 
        pan_number || null, 
        aadhaar_number || null, 
        bank_account_number || null, 
        bank_ifsc || null, 
        bank_name || null, 
        created_by, 
        updated_by
      ]
    );

    return res.status(201).json({ employee: result.rows[0] });

  } catch (e: any) {
    console.error("Error creating employee:", e);
    if (e?.code === '23505') {
        if (e.constraint?.includes('employee_code')) {
            return res.status(409).json({ error: "An employee with this code already exists." });
        }
        if (e.constraint?.includes('email')) { // This will likely conflict with users table, but good to have
            return res.status(409).json({ error: "An employee with this email already exists." });
        }
        return res.status(409).json({ error: "A record with this value already exists." });
    }
    res.status(500).json({ error: e.message || "Failed to create employee" });
  }
});

appRouter.get("/employees", requireAuth, async (req, res) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const searchTerm = req.query.q as string | undefined;

    // Get current date for filtering latest compensation
    const now = new Date();
    const currentDate = now.toISOString();

    let sqlQuery = `
      SELECT 
        e.*,
        COALESCE(
          (cs.basic_salary + cs.hra + cs.special_allowance + COALESCE(cs.da, 0) + COALESCE(cs.lta, 0) + COALESCE(cs.bonus, 0)),
          0
        ) as monthly_gross_salary
      FROM employees e
      LEFT JOIN LATERAL (
        SELECT 
          basic_salary, hra, special_allowance, da, lta, bonus
        FROM compensation_structures
        WHERE employee_id = e.id
          AND tenant_id = e.tenant_id
          AND effective_from <= $2
        ORDER BY effective_from DESC
        LIMIT 1
      ) cs ON true
      WHERE e.tenant_id = $1 AND e.status != 'terminated'
    `;
    const params: any[] = [tenantId, currentDate];

    if (searchTerm) {
      sqlQuery += " AND (e.full_name ILIKE $3 OR e.email ILIKE $3 OR e.employee_code ILIKE $3)";
      params.push(`%${searchTerm}%`);
    }

    sqlQuery += " ORDER BY e.created_at DESC";

    const result = await query(sqlQuery, params);
    
    return res.json({ employees: result.rows });

  } catch (e: any) {
    console.error("Error fetching employees:", e);
    res.status(500).json({ error: e.message || "Failed to fetch employees" });
  }
});

// Update employee status (e.g., mark as left/terminated)
appRouter.patch("/employees/:employeeId/status", requireAuth, async (req, res) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const { employeeId } = req.params;
    const { status } = req.body as { status: string };

    const allowed = new Set(["active", "inactive", "on_leave", "terminated"]);
    if (!status || !allowed.has(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const result = await query(
      `UPDATE employees SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [status, employeeId, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Employee not found" });
    }

    return res.json({ employee: result.rows[0] });
  } catch (e: any) {
    console.error("Error updating employee status:", e);
    res.status(500).json({ error: e.message || "Failed to update employee status" });
  }
});

// IMPORTANT: This route must come BEFORE /employees/:employeeId/compensation
// to prevent "me" from being treated as an employeeId parameter
appRouter.get("/employees/me/compensation", requireAuth, async (req, res) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const email = (req as any).userEmail as string;

    // Validate required values
    if (!tenantId) {
      console.error("[COMPENSATION] Missing tenantId in request");
      return res.status(400).json({ error: "Tenant ID not found" });
    }
    if (!email) {
      console.error("[COMPENSATION] Missing userEmail in request");
      return res.status(400).json({ error: "User email not found" });
    }

    console.log(`[COMPENSATION] Looking up employee with tenant_id: ${tenantId}, email: ${email}`);

    const emp = await query<{ id: string }>(
      "SELECT id FROM employees WHERE tenant_id = $1 AND email = $2 LIMIT 1",
      [tenantId, email]
    );
    
    if (!emp.rows[0]) {
      console.log(`[COMPENSATION] No employee found for email: ${email}, tenant: ${tenantId}`);
      return res.json({ compensation: null });
    }
    const employeeId = emp.rows[0].id;
    console.log(`[COMPENSATION] Found employee_id: ${employeeId}`);

    const result = await query(
      `SELECT * FROM compensation_structures
       WHERE employee_id = $1 AND tenant_id = $2
       ORDER BY effective_from DESC
       LIMIT 1`,
      [employeeId, tenantId]
    );
    
    console.log(`[COMPENSATION] Found ${result.rows.length} compensation record(s) for employee ${employeeId}`);
    return res.json({ compensation: result.rows[0] || null });

  } catch (e: any) {
    console.error("[COMPENSATION] Error fetching employee compensation:", e);
    console.error("[COMPENSATION] Error stack:", e.stack);
    return res.status(500).json({ error: e.message || "Failed to fetch employee compensation" });
  }
});

appRouter.get("/employees/:employeeId/compensation", requireAuth, async (req, res) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const { employeeId } = req.params;

    const result = await query(
      `SELECT * FROM compensation_structures 
       WHERE tenant_id = $1 AND employee_id = $2 
       ORDER BY effective_from DESC 
       LIMIT 1`,
      [tenantId, employeeId]
    );

    return res.json({ compensation: result.rows[0] || null });

  } catch (e: any) {
    console.error("Error fetching compensation:", e);
    res.status(500).json({ error: e.message || "Failed to fetch compensation" });
  }
});

appRouter.post("/employees/:employeeId/compensation", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const tenantId = (req as any).tenantId as string;
    const { employeeId } = req.params;
    
    // Check if user has payroll_admin role (HR/CEO/Admin can add salary)
    const userResult = await query(
      `SELECT payroll_role FROM users WHERE id = $1 AND org_id = $2`,
      [userId, tenantId]
    );
    
    if (!userResult.rows[0] || userResult.rows[0].payroll_role !== 'payroll_admin') {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: 'Only HR/Admin/CEO can add salary information'
      });
    }
    
    const {
      effective_from,
      ctc,
      basic_salary,
      hra,
      special_allowance,
      da,
      lta,
      bonus,
      pf_contribution,
      esi_contribution
    } = req.body;

    if (!effective_from || !ctc || !basic_salary) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const result = await query(
      `INSERT INTO compensation_structures (
        tenant_id, employee_id, effective_from, ctc, basic_salary, 
        hra, special_allowance, da, lta, bonus, pf_contribution, esi_contribution,
        created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
      ) RETURNING *`,
      [
        tenantId,
        employeeId,
        effective_from,
        ctc,
        basic_salary,
        hra || 0,
        special_allowance || 0,
        da || 0,
        lta || 0,
        bonus || 0,
        pf_contribution || 0,
        esi_contribution || 0,
        userId // created_by
      ]
    );
    
    return res.status(201).json({ compensation: result.rows[0] });

  } catch (e: any) {
    console.error("Error adding compensation:", e);
    res.status(500).json({ error: e.message || "Failed to add compensation" });
  }
});

// --- FIX: All endpoints below now correctly get tenantId ---

appRouter.get("/payroll/new-cycle-data", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const tenantId = (req as any).tenantId as string;
  if (!tenantId) {
      return res.status(403).json({ error: "User tenant not found" });
  }

  // Get month and year from query params (optional - defaults to current month)
  const month = req.query.month ? parseInt(req.query.month as string) : null;
  const year = req.query.year ? parseInt(req.query.year as string) : null;

  if (!month || !year) {
      // Default behavior: return current month data
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      
      // Get active employees who were employed by current month
      const { rows: countRows } = await query(
          `SELECT count(*) 
           FROM employees 
           WHERE tenant_id = $1 
             AND status = 'active'
             AND (date_of_joining IS NULL OR 
                  (EXTRACT(YEAR FROM date_of_joining) < $2 OR 
                   (EXTRACT(YEAR FROM date_of_joining) = $2 AND EXTRACT(MONTH FROM date_of_joining) <= $3)))`,
          [tenantId, currentYear, currentMonth]
      );
      const employeeCount = parseInt(countRows[0].count, 10) || 0;

      // Get total monthly compensation for employees active in current month
      const { rows: compRows } = await query(
        `SELECT SUM(cs.ctc / 12) as total
         FROM compensation_structures cs
         JOIN employees e ON e.id = cs.employee_id
         WHERE e.tenant_id = $1 
           AND e.status = 'active'
           AND (e.date_of_joining IS NULL OR 
                (EXTRACT(YEAR FROM e.date_of_joining) < $2 OR 
                 (EXTRACT(YEAR FROM e.date_of_joining) = $2 AND EXTRACT(MONTH FROM e.date_of_joining) <= $3)))
         AND cs.effective_from = (
             SELECT MAX(effective_from)
             FROM compensation_structures
             WHERE employee_id = e.id
               AND (EXTRACT(YEAR FROM effective_from) < $2 OR 
                    (EXTRACT(YEAR FROM effective_from) = $2 AND EXTRACT(MONTH FROM effective_from) <= $3))
         )`,
        [tenantId, currentYear, currentMonth]
      );
      const totalCompensation = parseFloat(compRows[0].total) || 0;

      return res.json({
          employeeCount,
          totalCompensation
      });
  }

  // Calculate the payroll month end date for filtering
  const payrollMonthEnd = new Date(year, month, 0); // Last day of the payroll month
  
  // Get active employees who were employed by the payroll month
  const { rows: countRows } = await query(
      `SELECT count(*) 
       FROM employees 
       WHERE tenant_id = $1 
         AND status = 'active'
         AND (date_of_joining IS NULL OR date_of_joining <= $2)`,
      [tenantId, payrollMonthEnd.toISOString()]
  );
  const employeeCount = parseInt(countRows[0].count, 10) || 0;

  // Get total monthly compensation for employees active in the payroll month
  const { rows: compRows } = await query(
    `SELECT SUM(cs.ctc / 12) as total
     FROM compensation_structures cs
     JOIN employees e ON e.id = cs.employee_id
     WHERE e.tenant_id = $1 
       AND e.status = 'active'
       AND (e.date_of_joining IS NULL OR e.date_of_joining <= $2)
     AND cs.effective_from = (
         SELECT MAX(effective_from)
         FROM compensation_structures
         WHERE employee_id = e.id
           AND effective_from <= $2
     )`,
    [tenantId, payrollMonthEnd.toISOString()]
  );
  const totalCompensation = parseFloat(compRows[0].total) || 0;

  res.json({
      employeeCount,
      totalCompensation
  });
});

appRouter.post("/payroll-cycles", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const tenantId = (req as any).tenantId as string; // Get from middleware
  if (!tenantId) {
      return res.status(403).json({ error: "User tenant not found" });
  }

  const { month, year, payday, employeeCount, totalCompensation } = req.body;
  if (!month || !year || !payday) {
      return res.status(400).json({ error: "Month, year, and payday are required" });
  }

  try {
      const { rows } = await query(
          `INSERT INTO payroll_cycles
           (tenant_id, created_by, month, year, payday, status, total_employees, total_amount)
           VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7)
           RETURNING *`,
          [
              tenantId,
              userId,
              parseInt(month, 10),
              parseInt(year, 10),
              payday,
              employeeCount || 0,
              totalCompensation || 0
          ]
      );
      const cycle = rows[0];

      // Auto-process if the cycle is for a past month so payslips are immediately available
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      const isPastCycle = (cycle.year < currentYear) || (cycle.year === currentYear && cycle.month < currentMonth);

      if (!isPastCycle) {
        return res.status(201).json({ payrollCycle: cycle });
      }

      // PROCESS IMMEDIATELY: generate payroll items for eligible employees and mark cycle completed
      const payrollMonthEnd = new Date(cycle.year, cycle.month, 0);

      // Fetch payroll settings
      const settingsResult = await query(
        "SELECT * FROM payroll_settings WHERE tenant_id = $1",
        [tenantId]
      );
      const settings = settingsResult.rows[0] || {
        pf_rate: 12.0,
        esi_rate: 3.25,
        pt_rate: 200.0,
        tds_threshold: 250000.0,
      };

      // Get all active employees who were employed by the payroll month
      const employeesResult = await query(
        `SELECT e.id
         FROM employees e
         WHERE e.tenant_id = $1
           AND e.status = 'active'
           AND (e.date_of_joining IS NULL OR e.date_of_joining <= $2)`,
        [tenantId, payrollMonthEnd.toISOString()]
      );

      let processedCount = 0;
      let totalGrossSalary = 0;
      let totalDeductions = 0;

      for (const emp of employeesResult.rows) {
        const compResult = await query(
          `SELECT * FROM compensation_structures
           WHERE employee_id = $1 AND tenant_id = $2 AND effective_from <= $3
           ORDER BY effective_from DESC LIMIT 1`,
          [emp.id, tenantId, payrollMonthEnd.toISOString()]
        );
        if (compResult.rows.length === 0) continue;

        const c = compResult.rows[0];
        let basic = Number(c.basic_salary) || 0;
        let hra = Number(c.hra) || 0;
        let sa = Number(c.special_allowance) || 0;
        const da = Number(c.da) || 0;
        const lta = Number(c.lta) || 0;
        const bonus = Number(c.bonus) || 0;
        let gross = basic + hra + sa + da + lta + bonus;

        // Fallback: if monthly components are zero but CTC exists, derive from CTC using settings
        if (gross === 0 && c.ctc) {
          const monthlyCtc = Number(c.ctc) / 12;
          const basicPct = Number((settings as any).basic_salary_percentage || 40);
          const hraPct = Number((settings as any).hra_percentage || 40);
          const saPct = Number((settings as any).special_allowance_percentage || 20);
          basic = (monthlyCtc * basicPct) / 100;
          hra = (monthlyCtc * hraPct) / 100;
          sa = (monthlyCtc * saPct) / 100;
          gross = basic + hra + sa; // DA/LTA/Bonus remain 0 in fallback
        }

        // Calculate LOP days and paid days for this month
        const { lopDays, paidDays, totalWorkingDays } = await calculateLopAndPaidDays(
          tenantId,
          emp.id,
          cycle.month,
          cycle.year
        );

        // Adjust gross salary based on paid days (proportional deduction for LOP)
        const dailyRate = gross / totalWorkingDays;
        const adjustedGross = dailyRate * paidDays;

        // Recalculate components proportionally
        const adjustmentRatio = paidDays / totalWorkingDays;
        const adjustedBasic = basic * adjustmentRatio;
        const adjustedHra = hra * adjustmentRatio;
        const adjustedSa = sa * adjustmentRatio;

        // Calculate deductions based on adjusted gross
        const pf = (adjustedBasic * Number(settings.pf_rate)) / 100;
        const esi = adjustedGross <= 21000 ? (adjustedGross * 0.75) / 100 : 0;
        const pt = Number(settings.pt_rate) || 200;
        const annual = adjustedGross * 12;
        const tds = annual > Number(settings.tds_threshold) ? ((annual - Number(settings.tds_threshold)) * 5) / 100 / 12 : 0;
        const deductions = pf + esi + pt + tds;
        const net = adjustedGross - deductions;

        await query(
          `INSERT INTO payroll_items (
            tenant_id, payroll_cycle_id, employee_id,
            gross_salary, deductions, net_salary,
            basic_salary, hra, special_allowance,
            pf_deduction, esi_deduction, tds_deduction, pt_deduction,
            lop_days, paid_days, total_working_days
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (payroll_cycle_id, employee_id) DO UPDATE SET
            gross_salary = EXCLUDED.gross_salary,
            deductions = EXCLUDED.deductions,
            net_salary = EXCLUDED.net_salary,
            basic_salary = EXCLUDED.basic_salary,
            hra = EXCLUDED.hra,
            special_allowance = EXCLUDED.special_allowance,
            pf_deduction = EXCLUDED.pf_deduction,
            esi_deduction = EXCLUDED.esi_deduction,
            tds_deduction = EXCLUDED.tds_deduction,
            pt_deduction = EXCLUDED.pt_deduction,
            lop_days = EXCLUDED.lop_days,
            paid_days = EXCLUDED.paid_days,
            total_working_days = EXCLUDED.total_working_days,
            updated_at = NOW()`,
          [
            tenantId,
            cycle.id,
            emp.id,
            adjustedGross,
            deductions,
            net,
            adjustedBasic,
            adjustedHra,
            adjustedSa,
            pf,
            esi,
            tds,
            pt,
            lopDays,
            paidDays,
            totalWorkingDays,
          ]
        );

        processedCount += 1;
        totalGrossSalary += adjustedGross;
        totalDeductions += deductions;
      }

      // Mark cycle as completed (past month) with totals (gross)
      await query(
        `UPDATE payroll_cycles
         SET status = 'completed',
             total_employees = $1,
             total_amount = $2,
             updated_at = NOW()
         WHERE id = $3 AND tenant_id = $4`,
        [processedCount, totalGrossSalary, cycle.id, tenantId]
      );

      return res.status(201).json({ payrollCycle: { ...cycle, status: 'completed', total_employees: processedCount, total_amount: totalGrossSalary } });
  } catch (e: any) {
      if (e.code === '23505') { // unique_violation
          return res.status(409).json({ error: "A payroll cycle for this month and year already exists." });
      }
      console.error(e);
      return res.status(500).json({ error: "Failed to create payroll cycle" });
  }
});

// Get all payslips for a payroll cycle (for administrators)
appRouter.get("/payroll-cycles/:cycleId/payslips", requireAuth, async (req, res) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const { cycleId } = req.params;

    if (!tenantId) {
      return res.status(403).json({ error: "User tenant not found" });
    }

    // Get payroll cycle to verify it belongs to tenant
    const cycleResult = await query(
      "SELECT * FROM payroll_cycles WHERE id = $1 AND tenant_id = $2",
      [cycleId, tenantId]
    );

    if (cycleResult.rows.length === 0) {
      return res.status(404).json({ error: "Payroll cycle not found" });
    }

    // Get all payslips for this cycle
    const payslipsResult = await query(
      `
      SELECT 
        pi.*,
        e.full_name,
        e.employee_code,
        e.email,
        e.designation,
        e.department,
        pc.month,
        pc.year,
        pc.status as cycle_status
      FROM payroll_items pi
      JOIN employees e ON pi.employee_id = e.id
      JOIN payroll_cycles pc ON pi.payroll_cycle_id = pc.id
      WHERE pi.payroll_cycle_id = $1 
        AND pi.tenant_id = $2
      ORDER BY e.full_name ASC
      `,
      [cycleId, tenantId]
    );

    const payslips = payslipsResult.rows.map(row => ({
      ...row,
      payroll_cycles: {
        month: row.month,
        year: row.year,
        status: row.cycle_status,
      }
    }));

    return res.json({ payslips });
  } catch (e: any) {
    console.error("Error fetching payslips for cycle:", e);
    res.status(500).json({ error: e.message || "Failed to fetch payslips" });
  }
});

// Preview payroll - calculate salaries for all eligible employees (before processing)
appRouter.get("/payroll-cycles/:cycleId/preview", requireAuth, async (req, res) => {
  const tenantId = (req as any).tenantId as string;
  const { cycleId } = req.params;

  if (!tenantId) {
    return res.status(403).json({ error: "User tenant not found" });
  }

  try {
    // Get payroll cycle
    const cycleResult = await query(
      "SELECT * FROM payroll_cycles WHERE id = $1 AND tenant_id = $2",
      [cycleId, tenantId]
    );

    if (cycleResult.rows.length === 0) {
      return res.status(404).json({ error: "Payroll cycle not found" });
    }

    const cycle = cycleResult.rows[0];

    // Allow preview for draft, pending_approval, approved, processing, and completed cycles
    if (!['draft', 'pending_approval', 'approved', 'processing', 'completed'].includes(cycle.status)) {
      return res.status(400).json({ 
        error: `Cannot preview payroll. Current status is '${cycle.status}'.` 
      });
    }

    const payrollMonth = cycle.month;
    const payrollYear = cycle.year;
    const payrollMonthEnd = new Date(payrollYear, payrollMonth, 0);

    // Get payroll settings
    const settingsResult = await query(
      "SELECT * FROM payroll_settings WHERE tenant_id = $1",
      [tenantId]
    );
    
    const settings = settingsResult.rows[0] || {
      pf_rate: 12.00,
      esi_rate: 3.25,
      pt_rate: 200.00,
      tds_threshold: 250000.00,
    };

    // Get all active employees who were employed by the payroll month
    const employeesResult = await query(
      `SELECT e.id, e.full_name, e.email, e.employee_code
       FROM employees e
       WHERE e.tenant_id = $1 
         AND e.status = 'active'
         AND (e.date_of_joining IS NULL OR e.date_of_joining <= $2)
       ORDER BY e.date_of_joining ASC`,
      [tenantId, payrollMonthEnd.toISOString()]
    );

    const employees = employeesResult.rows;
    const payrollItems: any[] = [];

    // Calculate salary for each employee
    for (const employee of employees) {
      // Get the latest compensation structure effective for the payroll month
      const compResult = await query(
        `SELECT * FROM compensation_structures
         WHERE employee_id = $1 
           AND tenant_id = $2
           AND effective_from <= $3
         ORDER BY effective_from DESC
         LIMIT 1`,
        [employee.id, tenantId, payrollMonthEnd.toISOString()]
      );

      if (compResult.rows.length === 0) {
        continue;
      }

      const compensation = compResult.rows[0];
      
      // All amounts are monthly
      const monthlyBasic = Number(compensation.basic_salary) || 0;
      const monthlyHRA = Number(compensation.hra) || 0;
      const monthlySpecialAllowance = Number(compensation.special_allowance) || 0;
      const monthlyDA = Number(compensation.da) || 0;
      const monthlyLTA = Number(compensation.lta) || 0;
      const monthlyBonus = Number(compensation.bonus) || 0;

      // Gross salary = sum of all monthly earnings
      const grossSalary = monthlyBasic + monthlyHRA + monthlySpecialAllowance + monthlyDA + monthlyLTA + monthlyBonus;

      // Calculate LOP days and paid days for this month
      const { lopDays, paidDays, totalWorkingDays } = await calculateLopAndPaidDays(
        tenantId,
        employee.id,
        payrollMonth,
        payrollYear
      );

      // Adjust gross salary based on paid days (proportional deduction for LOP)
      const dailyRate = grossSalary / totalWorkingDays;
      const adjustedGrossSalary = dailyRate * paidDays;

      // Recalculate components proportionally
      const adjustmentRatio = paidDays / totalWorkingDays;
      const adjustedBasic = monthlyBasic * adjustmentRatio;
      const adjustedHRA = monthlyHRA * adjustmentRatio;
      const adjustedSpecialAllowance = monthlySpecialAllowance * adjustmentRatio;
      const adjustedDA = monthlyDA * adjustmentRatio;
      const adjustedLTA = monthlyLTA * adjustmentRatio;
      const adjustedBonus = monthlyBonus * adjustmentRatio;

      // Calculate deductions based on adjusted gross
      const pfDeduction = (adjustedBasic * Number(settings.pf_rate)) / 100;
      const esiDeduction = adjustedGrossSalary <= 21000 ? (adjustedGrossSalary * 0.75) / 100 : 0;
      const ptDeduction = Number(settings.pt_rate) || 200;
      
      const annualIncome = adjustedGrossSalary * 12;
      let tdsDeduction = 0;
      if (annualIncome > Number(settings.tds_threshold)) {
        const excessAmount = annualIncome - Number(settings.tds_threshold);
        tdsDeduction = (excessAmount * 5) / 100 / 12;
      }

      const totalDeductions = pfDeduction + esiDeduction + ptDeduction + tdsDeduction;
      const netSalary = adjustedGrossSalary - totalDeductions;

      payrollItems.push({
        employee_id: employee.id,
        employee_code: employee.employee_code,
        employee_name: employee.full_name,
        employee_email: employee.email,
        basic_salary: adjustedBasic,
        hra: adjustedHRA,
        special_allowance: adjustedSpecialAllowance,
        da: adjustedDA,
        lta: adjustedLTA,
        bonus: adjustedBonus,
        gross_salary: adjustedGrossSalary,
        pf_deduction: pfDeduction,
        esi_deduction: esiDeduction,
        pt_deduction: ptDeduction,
        tds_deduction: tdsDeduction,
        deductions: totalDeductions,
        net_salary: netSalary,
        lop_days: lopDays,
        paid_days: paidDays,
        total_working_days: totalWorkingDays,
      });
    }

    return res.json({ payrollItems });

  } catch (e: any) {
    console.error("Error previewing payroll:", e);
    return res.status(500).json({ error: e.message || "Failed to preview payroll" });
  }
});

// Submit payroll for approval (draft -> pending_approval)
appRouter.post("/payroll-cycles/:cycleId/submit", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const tenantId = (req as any).tenantId as string;
  const { cycleId } = req.params;

  if (!tenantId) {
    return res.status(403).json({ error: "User tenant not found" });
  }

  try {
    // Get payroll cycle
    const cycleResult = await query(
      "SELECT * FROM payroll_cycles WHERE id = $1 AND tenant_id = $2",
      [cycleId, tenantId]
    );

    if (cycleResult.rows.length === 0) {
      return res.status(404).json({ error: "Payroll cycle not found" });
    }

    const cycle = cycleResult.rows[0];

    // Only allow submission from draft status
    if (cycle.status !== 'draft') {
      return res.status(400).json({ 
        error: `Cannot submit payroll. Current status is '${cycle.status}'. Only 'draft' payroll can be submitted for approval.` 
      });
    }

    // Check if payroll items exist
    const itemsResult = await query(
      "SELECT COUNT(*)::text as count FROM payroll_items WHERE payroll_cycle_id = $1 AND tenant_id = $2",
      [cycleId, tenantId]
    );

    const itemsCount = parseInt(itemsResult.rows[0]?.count || '0', 10);
    if (itemsCount === 0) {
      return res.status(400).json({ 
        error: "Cannot submit payroll. No payroll items found. Please process the payroll first." 
      });
    }

    // Update cycle status to pending_approval
    const updateResult = await query(
      `UPDATE payroll_cycles
       SET status = 'pending_approval',
           submitted_by = $1,
           submitted_at = NOW(),
           updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [userId, cycleId, tenantId]
    );

    return res.status(200).json({ 
      message: "Payroll submitted for approval successfully",
      payrollCycle: updateResult.rows[0]
    });
  } catch (e: any) {
    console.error("Error submitting payroll for approval:", e);
    return res.status(500).json({ error: e.message || "Failed to submit payroll for approval" });
  }
});

// Approve payroll (pending_approval -> approved)
appRouter.post("/payroll-cycles/:cycleId/approve", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const tenantId = (req as any).tenantId as string;
  const { cycleId } = req.params;

  if (!tenantId) {
    return res.status(403).json({ error: "User tenant not found" });
  }

  try {
    // Get payroll cycle
    const cycleResult = await query(
      "SELECT * FROM payroll_cycles WHERE id = $1 AND tenant_id = $2",
      [cycleId, tenantId]
    );

    if (cycleResult.rows.length === 0) {
      return res.status(404).json({ error: "Payroll cycle not found" });
    }

    const cycle = cycleResult.rows[0];

    // Only allow approval from pending_approval status
    if (cycle.status !== 'pending_approval') {
      return res.status(400).json({ 
        error: `Cannot approve payroll. Current status is '${cycle.status}'. Only 'pending_approval' payroll can be approved.` 
      });
    }

    // Update cycle status to approved
    const updateResult = await query(
      `UPDATE payroll_cycles
       SET status = 'approved',
           approved_by = $1,
           approved_at = NOW(),
           updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [userId, cycleId, tenantId]
    );

    return res.status(200).json({ 
      message: "Payroll approved successfully",
      payrollCycle: updateResult.rows[0]
    });
  } catch (e: any) {
    console.error("Error approving payroll:", e);
    return res.status(500).json({ error: e.message || "Failed to approve payroll" });
  }
});

// Reject/Return payroll (pending_approval -> draft)
appRouter.post("/payroll-cycles/:cycleId/reject", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const tenantId = (req as any).tenantId as string;
  const { cycleId } = req.params;
  const { rejectionReason } = req.body;

  if (!tenantId) {
    return res.status(403).json({ error: "User tenant not found" });
  }

  try {
    // Get payroll cycle
    const cycleResult = await query(
      "SELECT * FROM payroll_cycles WHERE id = $1 AND tenant_id = $2",
      [cycleId, tenantId]
    );

    if (cycleResult.rows.length === 0) {
      return res.status(404).json({ error: "Payroll cycle not found" });
    }

    const cycle = cycleResult.rows[0];

    // Only allow rejection from pending_approval status
    if (cycle.status !== 'pending_approval') {
      return res.status(400).json({ 
        error: `Cannot reject payroll. Current status is '${cycle.status}'. Only 'pending_approval' payroll can be rejected.` 
      });
    }

    // Update cycle status back to draft
    const updateResult = await query(
      `UPDATE payroll_cycles
       SET status = 'draft',
           rejected_by = $1,
           rejected_at = NOW(),
           rejection_reason = $2,
           updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4
       RETURNING *`,
      [userId, rejectionReason || null, cycleId, tenantId]
    );

    return res.status(200).json({ 
      message: "Payroll rejected and returned to draft",
      payrollCycle: updateResult.rows[0]
    });
  } catch (e: any) {
    console.error("Error rejecting payroll:", e);
    return res.status(500).json({ error: e.message || "Failed to reject payroll" });
  }
});

// Process payroll - generate payslips for all eligible employees (accepts edited items)
// Now only works with approved cycles
appRouter.post("/payroll-cycles/:cycleId/process", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const tenantId = (req as any).tenantId as string;
  const { cycleId } = req.params;

  if (!tenantId) {
    return res.status(403).json({ error: "User tenant not found" });
  }

  try {
    // Get payroll cycle
    const cycleResult = await query(
      "SELECT * FROM payroll_cycles WHERE id = $1 AND tenant_id = $2",
      [cycleId, tenantId]
    );

    if (cycleResult.rows.length === 0) {
      return res.status(404).json({ error: "Payroll cycle not found" });
    }

    const cycle = cycleResult.rows[0];

    // Only allow processing of approved cycles
    if (cycle.status !== 'approved') {
      return res.status(400).json({ 
        error: `Cannot process payroll. Current status is '${cycle.status}'. Only 'approved' payroll can be processed. Please approve the payroll first.` 
      });
    }
    const payrollMonth = cycle.month;
    const payrollYear = cycle.year;
    const payrollMonthEnd = new Date(payrollYear, payrollMonth, 0); // Last day of the payroll month

    // Get payroll settings
    const settingsResult = await query(
      "SELECT * FROM payroll_settings WHERE tenant_id = $1",
      [tenantId]
    );
    
    const settings = settingsResult.rows[0] || {
      pf_rate: 12.00,
      esi_rate: 3.25,
      pt_rate: 200.00,
      tds_threshold: 250000.00,
    };

    // Get all active employees who were employed by the payroll month
    const employeesResult = await query(
      `SELECT e.id, e.full_name, e.email
       FROM employees e
       WHERE e.tenant_id = $1 
         AND e.status = 'active'
         AND (e.date_of_joining IS NULL OR e.date_of_joining <= $2)
       ORDER BY e.date_of_joining ASC`,
      [tenantId, payrollMonthEnd.toISOString()]
    );

      // Check if edited payroll items are provided in request body
      const { payrollItems: editedItems } = req.body;

      // If edited items are provided, use them; otherwise calculate fresh
      if (editedItems && Array.isArray(editedItems) && editedItems.length > 0) {
        // For approved cycles, prevent modifications to payroll items
        // Once approved, payroll items should not be changed
        if (cycle.status === 'approved') {
          // Check if any items have changed
          const existingItemsResult = await query(
            "SELECT employee_id, gross_salary, basic_salary, hra, special_allowance FROM payroll_items WHERE payroll_cycle_id = $1 AND tenant_id = $2",
            [cycleId, tenantId]
          );
          
          // If items exist and are approved, don't allow edits - just process as-is
          if (existingItemsResult.rows.length > 0) {
            // Calculate totals from existing items
            let processedCount = 0;
            let totalGrossSalary = 0;
            let totalDeductions = 0;
            
            for (const existingItem of existingItemsResult.rows) {
              processedCount++;
              totalGrossSalary += Number(existingItem.gross_salary || 0);
              // Get deductions from existing item
              const itemDeductions = await query(
                "SELECT deductions FROM payroll_items WHERE payroll_cycle_id = $1 AND employee_id = $2 AND tenant_id = $3",
                [cycleId, existingItem.employee_id, tenantId]
              );
              totalDeductions += Number(itemDeductions.rows[0]?.deductions || 0);
            }

            // Update cycle status to processing
            await query(
              `UPDATE payroll_cycles
               SET status = 'processing',
                   total_employees = $1,
                   total_amount = $2,
                   updated_at = NOW()
               WHERE id = $3 AND tenant_id = $4`,
              [processedCount, totalGrossSalary, cycleId, tenantId]
            );

            return res.status(200).json({
              message: `Payroll processed successfully for ${processedCount} employees (approved payroll - no changes allowed)`,
              processedCount,
              totalGrossSalary,
              totalDeductions,
              totalNetSalary: totalGrossSalary - totalDeductions,
            });
          }
        }

        // Use the edited items provided (for draft cycles only)
        let processedCount = 0;
        let totalGrossSalary = 0;
        let totalDeductions = 0;

        for (const item of editedItems) {
        const {
          employee_id,
          basic_salary,
          hra,
          special_allowance,
          da = 0,
          lta = 0,
          bonus = 0,
          lop_days,
          paid_days,
          total_working_days,
        } = item;

        // If LOP days are provided, use them; otherwise calculate
        let finalLopDays: number;
        let finalPaidDays: number;
        let finalTotalWorkingDays: number;

        if (lop_days !== undefined && paid_days !== undefined && total_working_days !== undefined) {
          // Use provided values
          finalLopDays = Number(lop_days);
          finalPaidDays = Number(paid_days);
          finalTotalWorkingDays = Number(total_working_days);
        } else {
          // Calculate from database
          const calculated = await calculateLopAndPaidDays(tenantId, employee_id, payrollMonth, payrollYear);
          finalLopDays = calculated.lopDays;
          finalPaidDays = calculated.paidDays;
          finalTotalWorkingDays = calculated.totalWorkingDays;
        }

        // Recalculate gross salary from edited components
        const editedGrossSalary = Number(basic_salary) + Number(hra) + Number(special_allowance) + Number(da) + Number(lta) + Number(bonus);

        // Recalculate deductions based on edited values
        const editedPfDeduction = (Number(basic_salary) * Number(settings.pf_rate)) / 100;
        const editedEsiDeduction = editedGrossSalary <= 21000 ? (editedGrossSalary * 0.75) / 100 : 0;
        const editedPtDeduction = Number(settings.pt_rate) || 200;
        
        const annualIncome = editedGrossSalary * 12;
        let editedTdsDeduction = 0;
        if (annualIncome > Number(settings.tds_threshold)) {
          const excessAmount = annualIncome - Number(settings.tds_threshold);
          editedTdsDeduction = (excessAmount * 5) / 100 / 12;
        }

        const calculatedDeductions = editedPfDeduction + editedEsiDeduction + editedPtDeduction + editedTdsDeduction;
        const netSalary = editedGrossSalary - calculatedDeductions;

        // Insert or update payroll item with edited values
        // Only allow updates for draft cycles - approved/processing cycles are locked
        const cycleStatusCheck = await query(
          "SELECT status FROM payroll_cycles WHERE id = $1 AND tenant_id = $2",
          [cycleId, tenantId]
        );
        
        if (cycleStatusCheck.rows.length > 0) {
          const currentStatus = cycleStatusCheck.rows[0].status;
          if (['approved', 'processing', 'completed'].includes(currentStatus)) {
            return res.status(400).json({ 
              error: `Cannot modify payroll items. Current status is '${currentStatus}'. Only 'draft' or 'pending_approval' payroll can be modified.` 
            });
          }
        }

        await query(
          `INSERT INTO payroll_items (
            tenant_id, payroll_cycle_id, employee_id,
            gross_salary, deductions, net_salary,
            basic_salary, hra, special_allowance,
            pf_deduction, esi_deduction, tds_deduction, pt_deduction,
            lop_days, paid_days, total_working_days
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (payroll_cycle_id, employee_id) DO UPDATE SET
            gross_salary = EXCLUDED.gross_salary,
            deductions = EXCLUDED.deductions,
            net_salary = EXCLUDED.net_salary,
            basic_salary = EXCLUDED.basic_salary,
            hra = EXCLUDED.hra,
            special_allowance = EXCLUDED.special_allowance,
            pf_deduction = EXCLUDED.pf_deduction,
            esi_deduction = EXCLUDED.esi_deduction,
            tds_deduction = EXCLUDED.tds_deduction,
            pt_deduction = EXCLUDED.pt_deduction,
            lop_days = EXCLUDED.lop_days,
            paid_days = EXCLUDED.paid_days,
            total_working_days = EXCLUDED.total_working_days,
            updated_at = NOW()`,
          [
            tenantId,
            cycleId,
            employee_id,
            editedGrossSalary,
            calculatedDeductions,
            netSalary,
            Number(basic_salary),
            Number(hra),
            Number(special_allowance),
            editedPfDeduction,
            editedEsiDeduction,
            editedTdsDeduction,
            editedPtDeduction,
            finalLopDays,
            finalPaidDays,
            finalTotalWorkingDays,
          ]
        );

        processedCount++;
        totalGrossSalary += editedGrossSalary;
        totalDeductions += calculatedDeductions;
      }

      // Update payroll cycle with processed data
      await query(
        `UPDATE payroll_cycles
         SET status = 'processing',
             total_employees = $1,
             total_amount = $2,
             updated_at = NOW()
         WHERE id = $3 AND tenant_id = $4`,
        [processedCount, totalGrossSalary, cycleId, tenantId]
      );

      return res.status(200).json({
        message: `Payroll processed successfully for ${processedCount} employees`,
        processedCount,
        totalGrossSalary,
        totalDeductions,
        totalNetSalary: totalGrossSalary - totalDeductions,
      });
    }

    // Original logic: calculate fresh (for backward compatibility)
    // For approved cycles, items should already exist - skip processing
    if (cycle.status === 'approved') {
      const existingItemsResult = await query(
        "SELECT COUNT(*)::text as count, SUM(gross_salary)::text as total_gross, SUM(deductions)::text as total_deductions FROM payroll_items WHERE payroll_cycle_id = $1 AND tenant_id = $2",
        [cycleId, tenantId]
      );
      
      if (existingItemsResult.rows.length > 0 && parseInt(existingItemsResult.rows[0]?.count || '0', 10) > 0) {
        const processedCount = parseInt(existingItemsResult.rows[0]?.count || '0', 10);
        const totalGrossSalary = parseFloat(existingItemsResult.rows[0]?.total_gross || '0');
        const totalDeductions = parseFloat(existingItemsResult.rows[0]?.total_deductions || '0');

        await query(
          `UPDATE payroll_cycles
           SET status = 'processing',
               total_employees = $1,
               total_amount = $2,
               updated_at = NOW()
           WHERE id = $3 AND tenant_id = $4`,
          [processedCount, totalGrossSalary, cycleId, tenantId]
        );

        return res.status(200).json({
          message: `Payroll processed successfully for ${processedCount} employees (approved payroll - using existing items)`,
          processedCount,
          totalGrossSalary,
          totalDeductions,
          totalNetSalary: totalGrossSalary - totalDeductions,
        });
      }
    }

    const employees = employeesResult.rows;
    let processedCount = 0;
    let totalGrossSalary = 0;
    let totalDeductions = 0;

    // Process each employee
    for (const employee of employees) {
      // Get the latest compensation structure effective for the payroll month
      const compResult = await query(
        `SELECT * FROM compensation_structures
         WHERE employee_id = $1 
           AND tenant_id = $2
           AND effective_from <= $3
         ORDER BY effective_from DESC
         LIMIT 1`,
        [employee.id, tenantId, payrollMonthEnd.toISOString()]
      );

      if (compResult.rows.length === 0) {
        console.warn(`No compensation found for employee ${employee.id}`);
        continue;
      }

      const compensation = compResult.rows[0];
      
      // All amounts are monthly (except CTC which is annual but not used in payroll calculation)
      const monthlyBasic = Number(compensation.basic_salary) || 0;
      const monthlyHRA = Number(compensation.hra) || 0;
      const monthlySpecialAllowance = Number(compensation.special_allowance) || 0;
      const monthlyDA = Number(compensation.da) || 0;
      const monthlyLTA = Number(compensation.lta) || 0; // Already monthly
      const monthlyBonus = Number(compensation.bonus) || 0; // Already monthly

      // Gross salary = sum of all monthly earnings
      const grossSalary = monthlyBasic + monthlyHRA + monthlySpecialAllowance + monthlyDA + monthlyLTA + monthlyBonus;

      // Calculate LOP days and paid days for this month
      const { lopDays, paidDays, totalWorkingDays } = await calculateLopAndPaidDays(
        tenantId,
        employee.id,
        payrollMonth,
        payrollYear
      );

      // Adjust gross salary based on paid days (proportional deduction for LOP)
      const dailyRate = grossSalary / totalWorkingDays;
      const adjustedGrossSalary = dailyRate * paidDays;

      // Recalculate components proportionally
      const adjustmentRatio = paidDays / totalWorkingDays;
      const adjustedBasic = monthlyBasic * adjustmentRatio;
      const adjustedHRA = monthlyHRA * adjustmentRatio;
      const adjustedSpecialAllowance = monthlySpecialAllowance * adjustmentRatio;

      // Calculate deductions based on adjusted gross
      // PF: 12% of basic (employee contribution)
      const pfDeduction = (adjustedBasic * Number(settings.pf_rate)) / 100;
      
      // ESI: 0.75% of gross if gross <= 21000 (employee contribution)
      const esiDeduction = adjustedGrossSalary <= 21000 ? (adjustedGrossSalary * 0.75) / 100 : 0;
      
      // Professional Tax: Fixed amount from settings
      const ptDeduction = Number(settings.pt_rate) || 200;
      
      // TDS: Calculate based on annual income (simplified - 5% if annual > threshold)
      const annualIncome = adjustedGrossSalary * 12;
      let tdsDeduction = 0;
      if (annualIncome > Number(settings.tds_threshold)) {
        // Simplified TDS calculation - 5% of excess over threshold
        const excessAmount = annualIncome - Number(settings.tds_threshold);
        tdsDeduction = (excessAmount * 5) / 100 / 12; // Monthly TDS
      }

      const totalDeductionsForEmployee = pfDeduction + esiDeduction + ptDeduction + tdsDeduction;
      const netSalary = adjustedGrossSalary - totalDeductionsForEmployee;

      // Insert payroll item
      // Only allow inserts/updates for draft and pending_approval cycles
      // Approved/processing/completed cycles are locked
      if (['approved', 'processing', 'completed'].includes(cycle.status)) {
        // Skip this employee - cannot modify approved payroll
        continue;
      }

      await query(
        `INSERT INTO payroll_items (
          tenant_id, payroll_cycle_id, employee_id,
          gross_salary, deductions, net_salary,
          basic_salary, hra, special_allowance,
          pf_deduction, esi_deduction, tds_deduction, pt_deduction,
          lop_days, paid_days, total_working_days
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (payroll_cycle_id, employee_id) DO UPDATE SET
          gross_salary = EXCLUDED.gross_salary,
          deductions = EXCLUDED.deductions,
          net_salary = EXCLUDED.net_salary,
          basic_salary = EXCLUDED.basic_salary,
          hra = EXCLUDED.hra,
          special_allowance = EXCLUDED.special_allowance,
          pf_deduction = EXCLUDED.pf_deduction,
          esi_deduction = EXCLUDED.esi_deduction,
          tds_deduction = EXCLUDED.tds_deduction,
          pt_deduction = EXCLUDED.pt_deduction,
          lop_days = EXCLUDED.lop_days,
          paid_days = EXCLUDED.paid_days,
          total_working_days = EXCLUDED.total_working_days,
          updated_at = NOW()`,
        [
          tenantId,
          cycleId,
          employee.id,
          adjustedGrossSalary,
          totalDeductionsForEmployee,
          netSalary,
          adjustedBasic,
          adjustedHRA,
          adjustedSpecialAllowance,
          pfDeduction,
          esiDeduction,
          tdsDeduction,
          ptDeduction,
          lopDays,
          paidDays,
          totalWorkingDays,
        ]
      );

      processedCount++;
      totalGrossSalary += adjustedGrossSalary;
      totalDeductions += totalDeductionsForEmployee;
    }

    // Update payroll cycle with processed data
    await query(
      `UPDATE payroll_cycles
       SET status = 'processing',
           total_employees = $1,
           total_amount = $2,
           updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4`,
      [processedCount, totalGrossSalary, cycleId, tenantId]
    );

    return res.status(200).json({
      message: `Payroll processed successfully for ${processedCount} employees`,
      processedCount,
      totalGrossSalary,
      totalDeductions,
      totalNetSalary: totalGrossSalary - totalDeductions,
    });

  } catch (e: any) {
    console.error("Error processing payroll:", e);
    return res.status(500).json({ error: e.message || "Failed to process payroll" });
  }
});

appRouter.get("/payroll-settings", requireAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId as string; // Get from middleware

  if (!tenantId) {
    return res.status(403).json({ error: "You are not part of a tenant." });
  }

  try {
    const { rows } = await query(
      "SELECT * FROM payroll_settings WHERE tenant_id = $1",
      [tenantId]
    );

    if (rows.length === 0) {
      // This is not an error, just means settings aren't created yet.
      // Return a default structure or an empty object.
      return res.json({ settings: null }); // Send null to indicate not found
    }

    return res.json({ settings: rows[0] });
  } catch (error) {
    console.error("Error fetching payroll settings:", error);
    return res.status(500).json({ error: "Failed to fetch settings" });
  }
});

appRouter.post("/payroll-settings", requireAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId as string; // Get from middleware

  if (!tenantId) {
    return res.status(403).json({ error: "You are not part of a tenant." });
  }

  const {
    pf_rate,
    esi_rate,
    pt_rate,
    tds_threshold,
    hra_percentage,
    special_allowance_percentage,
    basic_salary_percentage
  } = req.body;

  // Validate required fields
  if (pf_rate === undefined || basic_salary_percentage === undefined) {
    return res.status(400).json({ error: "Missing required settings fields" });
  }

  // Validate percentage fields sum to 100 (with tolerance for rounding)
  const totalPercentage = (parseFloat(basic_salary_percentage) || 0) + 
                          (parseFloat(hra_percentage) || 0) + 
                          (parseFloat(special_allowance_percentage) || 0);
  
  if (Math.abs(totalPercentage - 100) > 0.01) {
    return res.status(400).json({ 
      error: `Salary component percentages must sum to 100%. Current sum: ${totalPercentage.toFixed(2)}%` 
    });
  }

  try {
    const { rows } = await query(
      `
      INSERT INTO payroll_settings (
        tenant_id, pf_rate, esi_rate, pt_rate, tds_threshold, 
        hra_percentage, special_allowance_percentage, basic_salary_percentage,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (tenant_id) 
      DO UPDATE SET
        pf_rate = EXCLUDED.pf_rate,
        esi_rate = EXCLUDED.esi_rate,
        pt_rate = EXCLUDED.pt_rate,
        tds_threshold = EXCLUDED.tds_threshold,
        hra_percentage = EXCLUDED.hra_percentage,
        special_allowance_percentage = EXCLUDED.special_allowance_percentage,
        basic_salary_percentage = EXCLUDED.basic_salary_percentage,
        updated_at = NOW()
      RETURNING *
    `,
      [
        tenantId,
        pf_rate,
        esi_rate,
        pt_rate,
        tds_threshold,
        hra_percentage,
        special_allowance_percentage,
        basic_salary_percentage
      ]
    );

    return res.status(200).json({ settings: rows[0] });
  } catch (error) {
    console.error("Error saving payroll settings:", error);
    return res.status(500).json({ error: "Failed to save settings" });
  }
});

// ========== LEAVE MANAGEMENT ENDPOINTS ==========

// Get my leave requests (employee self-service)
appRouter.get("/leave-requests/me", requireAuth, async (req, res) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const email = (req as any).userEmail as string;
    const status = req.query.status as string | undefined;
    const month = req.query.month ? parseInt(req.query.month as string) : undefined;
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;

    // Get employee ID from email
    const empResult = await query<{ id: string }>(
      "SELECT id FROM employees WHERE tenant_id = $1 AND email = $2 LIMIT 1",
      [tenantId, email]
    );

    if (!empResult.rows[0]) {
      return res.status(404).json({ error: "Employee not found" });
    }

    const employeeId = empResult.rows[0].id;

    let sqlQuery = `
      SELECT 
        lr.*,
        e.full_name as employee_name,
        e.employee_code,
        approver.full_name as approver_name,
        creator.full_name as creator_name
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      LEFT JOIN profiles approver ON lr.approved_by = approver.id OR lr.rejected_by = approver.id
      LEFT JOIN profiles creator ON lr.created_by = creator.id
      WHERE lr.tenant_id = $1 AND lr.employee_id = $2
    `;
    const params: any[] = [tenantId, employeeId];
    let paramIndex = 3;

    if (status) {
      sqlQuery += ` AND lr.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (month && year) {
      sqlQuery += ` AND (
        (EXTRACT(YEAR FROM lr.start_date) = $${paramIndex} AND EXTRACT(MONTH FROM lr.start_date) = $${paramIndex + 1}) OR
        (EXTRACT(YEAR FROM lr.end_date) = $${paramIndex} AND EXTRACT(MONTH FROM lr.end_date) = $${paramIndex + 1}) OR
        (lr.start_date <= DATE '${year}-${month}-01' AND lr.end_date >= DATE '${year}-${month}-01')
      )`;
      params.push(year, month);
      paramIndex += 2;
    }

    sqlQuery += " ORDER BY lr.created_at DESC";

    const result = await query(sqlQuery, params);
    return res.json({ leaveRequests: result.rows });
  } catch (e: any) {
    console.error("Error fetching my leave requests:", e);
    res.status(500).json({ error: e.message || "Failed to fetch leave requests" });
  }
});

// Create leave request (employee self-service)
appRouter.post("/leave-requests/me", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const tenantId = (req as any).tenantId as string;
    const email = (req as any).userEmail as string;
    const { leaveType, startDate, endDate, reason } = req.body;

    if (!leaveType || !startDate || !endDate) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Get employee ID from email
    const empResult = await query<{ id: string }>(
      "SELECT id FROM employees WHERE tenant_id = $1 AND email = $2 LIMIT 1",
      [tenantId, email]
    );

    if (!empResult.rows[0]) {
      return res.status(404).json({ error: "Employee not found" });
    }

    const employeeId = empResult.rows[0].id;

    // Calculate days (including fractional days for half-days)
    const start = new Date(startDate);
    const end = new Date(endDate);
    const timeDiff = end.getTime() - start.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end dates

    const result = await query(
      `INSERT INTO leave_requests (
        tenant_id, employee_id, leave_type, start_date, end_date, days, reason, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [tenantId, employeeId, leaveType, startDate, endDate, daysDiff, reason || null, 'pending', userId]
    );

    return res.status(201).json({ leaveRequest: result.rows[0] });
  } catch (e: any) {
    console.error("Error creating leave request:", e);
    res.status(500).json({ error: e.message || "Failed to create leave request" });
  }
});

// Get all leave requests (with optional filters) - Admin/HR view
appRouter.get("/leave-requests", requireAuth, async (req, res) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const employeeId = req.query.employeeId as string | undefined;
    const status = req.query.status as string | undefined;
    const month = req.query.month ? parseInt(req.query.month as string) : undefined;
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;

    let sqlQuery = `
      SELECT 
        lr.*,
        e.full_name as employee_name,
        e.employee_code,
        approver.full_name as approver_name,
        creator.full_name as creator_name
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      LEFT JOIN profiles approver ON lr.approved_by = approver.id OR lr.rejected_by = approver.id
      LEFT JOIN profiles creator ON lr.created_by = creator.id
      WHERE lr.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (employeeId) {
      sqlQuery += ` AND lr.employee_id = $${paramIndex}`;
      params.push(employeeId);
      paramIndex++;
    }

    if (status) {
      sqlQuery += ` AND lr.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (month && year) {
      sqlQuery += ` AND (
        (EXTRACT(YEAR FROM lr.start_date) = $${paramIndex} AND EXTRACT(MONTH FROM lr.start_date) = $${paramIndex + 1}) OR
        (EXTRACT(YEAR FROM lr.end_date) = $${paramIndex} AND EXTRACT(MONTH FROM lr.end_date) = $${paramIndex + 1}) OR
        (lr.start_date <= DATE '${year}-${month}-01' AND lr.end_date >= DATE '${year}-${month}-01')
      )`;
      params.push(year, month);
      paramIndex += 2;
    }

    sqlQuery += " ORDER BY lr.created_at DESC";

    const result = await query(sqlQuery, params);
    return res.json({ leaveRequests: result.rows });
  } catch (e: any) {
    console.error("Error fetching leave requests:", e);
    res.status(500).json({ error: e.message || "Failed to fetch leave requests" });
  }
});

// Get leave request by ID
appRouter.get("/leave-requests/:leaveRequestId", requireAuth, async (req, res) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const { leaveRequestId } = req.params;

    const result = await query(
      `SELECT 
        lr.*,
        e.full_name as employee_name,
        e.employee_code,
        approver.full_name as approver_name,
        creator.full_name as creator_name
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      LEFT JOIN profiles approver ON lr.approved_by = approver.id OR lr.rejected_by = approver.id
      LEFT JOIN profiles creator ON lr.created_by = creator.id
      WHERE lr.id = $1 AND lr.tenant_id = $2`,
      [leaveRequestId, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Leave request not found" });
    }

    return res.json({ leaveRequest: result.rows[0] });
  } catch (e: any) {
    console.error("Error fetching leave request:", e);
    res.status(500).json({ error: e.message || "Failed to fetch leave request" });
  }
});

// Create leave request
appRouter.post("/leave-requests", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const tenantId = (req as any).tenantId as string;
    const { employeeId, leaveType, startDate, endDate, reason } = req.body;

    if (!employeeId || !leaveType || !startDate || !endDate) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Calculate days (including fractional days for half-days)
    const start = new Date(startDate);
    const end = new Date(endDate);
    const timeDiff = end.getTime() - start.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end dates

    const result = await query(
      `INSERT INTO leave_requests (
        tenant_id, employee_id, leave_type, start_date, end_date, days, reason, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [tenantId, employeeId, leaveType, startDate, endDate, daysDiff, reason || null, 'pending', userId]
    );

    return res.status(201).json({ leaveRequest: result.rows[0] });
  } catch (e: any) {
    console.error("Error creating leave request:", e);
    res.status(500).json({ error: e.message || "Failed to create leave request" });
  }
});

// Update leave request status (approve/reject)
appRouter.patch("/leave-requests/:leaveRequestId/status", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const tenantId = (req as any).tenantId as string;
    const { leaveRequestId } = req.params;
    const { status, rejectionReason } = req.body;

    if (!status || !['approved', 'rejected', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    let updateQuery = '';
    const params: any[] = [tenantId, leaveRequestId, status];

    if (status === 'approved') {
      updateQuery = `
        UPDATE leave_requests 
        SET status = $3, approved_by = $4, approved_at = NOW(), updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2
        RETURNING *
      `;
      params.push(userId);
    } else if (status === 'rejected') {
      updateQuery = `
        UPDATE leave_requests 
        SET status = $3, rejected_by = $4, rejected_at = NOW(), rejection_reason = $5, updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2
        RETURNING *
      `;
      params.push(userId, rejectionReason || null);
    } else {
      updateQuery = `
        UPDATE leave_requests 
        SET status = $3, updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2
        RETURNING *
      `;
    }

    const result = await query(updateQuery, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Leave request not found" });
    }

    return res.json({ leaveRequest: result.rows[0] });
  } catch (e: any) {
    console.error("Error updating leave request status:", e);
    res.status(500).json({ error: e.message || "Failed to update leave request status" });
  }
});

// Get my leave summary (employee self-service)
appRouter.get("/leave-summary/me", requireAuth, async (req, res) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const email = (req as any).userEmail as string;
    const month = req.query.month ? parseInt(req.query.month as string) : new Date().getMonth() + 1;
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();

    // Get employee ID from email
    const empResult = await query<{ id: string }>(
      "SELECT id FROM employees WHERE tenant_id = $1 AND email = $2 LIMIT 1",
      [tenantId, email]
    );

    if (!empResult.rows[0]) {
      return res.status(404).json({ error: "Employee not found" });
    }

    const employeeId = empResult.rows[0].id;

    // Get approved leave requests for the month
    const leaveResult = await query(
      `SELECT 
        SUM(CASE WHEN leave_type = 'loss_of_pay' THEN days ELSE 0 END) as lop_days,
        SUM(CASE WHEN leave_type = 'sick' THEN days ELSE 0 END) as sick_leave_days,
        SUM(CASE WHEN leave_type = 'casual' THEN days ELSE 0 END) as casual_leave_days,
        SUM(CASE WHEN leave_type != 'loss_of_pay' THEN days ELSE 0 END) as paid_leave_days,
        SUM(days) as total_leave_days
      FROM leave_requests
      WHERE tenant_id = $1 
        AND employee_id = $2
        AND status = 'approved'
        AND (
          (EXTRACT(YEAR FROM start_date) = $3 AND EXTRACT(MONTH FROM start_date) = $4) OR
          (EXTRACT(YEAR FROM end_date) = $3 AND EXTRACT(MONTH FROM end_date) = $4) OR
          (start_date <= DATE '${year}-${month}-01' AND end_date >= DATE '${year}-${month}-01')
        )`,
      [tenantId, employeeId, year, month]
    );

    // Get LOP days from attendance records
    const attendanceResult = await query(
      `SELECT 
        COUNT(*) as lop_days_from_attendance
      FROM attendance_records
      WHERE tenant_id = $1 
        AND employee_id = $2
        AND is_lop = true
        AND EXTRACT(YEAR FROM attendance_date) = $3
        AND EXTRACT(MONTH FROM attendance_date) = $4`,
      [tenantId, employeeId, year, month]
    );

    const leaveData = leaveResult.rows[0] || { 
      lop_days: 0, 
      sick_leave_days: 0,
      casual_leave_days: 0,
      paid_leave_days: 0, 
      total_leave_days: 0 
    };
    const attendanceLop = parseInt(attendanceResult.rows[0]?.lop_days_from_attendance || '0', 10);

    // Calculate total LOP days (from leave requests + attendance records)
    const totalLopDays = Number(leaveData.lop_days || 0) + attendanceLop;

    // Calculate working days in the month
    const daysInMonth = new Date(year, month, 0).getDate();
    
    // Calculate paid days (working days - LOP days)
    const paidDays = daysInMonth - totalLopDays;

    return res.json({
      month,
      year,
      totalWorkingDays: daysInMonth,
      lopDays: totalLopDays,
      paidDays: Math.max(0, paidDays),
      sickLeaveDays: Number(leaveData.sick_leave_days || 0),
      casualLeaveDays: Number(leaveData.casual_leave_days || 0),
      paidLeaveDays: Number(leaveData.paid_leave_days || 0),
      totalLeaveDays: Number(leaveData.total_leave_days || 0)
    });
  } catch (e: any) {
    console.error("Error fetching leave summary:", e);
    res.status(500).json({ error: e.message || "Failed to fetch leave summary" });
  }
});

// Get leave summary for an employee for a specific month/year (Admin/HR view)
appRouter.get("/employees/:employeeId/leave-summary", requireAuth, async (req, res) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const { employeeId } = req.params;
    const month = req.query.month ? parseInt(req.query.month as string) : new Date().getMonth() + 1;
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();

    // Get approved leave requests for the month
    const leaveResult = await query(
      `SELECT 
        SUM(CASE WHEN leave_type = 'loss_of_pay' THEN days ELSE 0 END) as lop_days,
        SUM(CASE WHEN leave_type != 'loss_of_pay' THEN days ELSE 0 END) as paid_leave_days,
        SUM(days) as total_leave_days
      FROM leave_requests
      WHERE tenant_id = $1 
        AND employee_id = $2
        AND status = 'approved'
        AND (
          (EXTRACT(YEAR FROM start_date) = $3 AND EXTRACT(MONTH FROM start_date) = $4) OR
          (EXTRACT(YEAR FROM end_date) = $3 AND EXTRACT(MONTH FROM end_date) = $4) OR
          (start_date <= DATE '${year}-${month}-01' AND end_date >= DATE '${year}-${month}-01')
        )`,
      [tenantId, employeeId, year, month]
    );

    // Get LOP days from attendance records
    const attendanceResult = await query(
      `SELECT 
        COUNT(*) as lop_days_from_attendance
      FROM attendance_records
      WHERE tenant_id = $1 
        AND employee_id = $2
        AND is_lop = true
        AND EXTRACT(YEAR FROM attendance_date) = $3
        AND EXTRACT(MONTH FROM attendance_date) = $4`,
      [tenantId, employeeId, year, month]
    );

    const leaveData = leaveResult.rows[0] || { lop_days: 0, paid_leave_days: 0, total_leave_days: 0 };
    const attendanceLop = parseInt(attendanceResult.rows[0]?.lop_days_from_attendance || '0', 10);

    // Calculate total LOP days (from leave requests + attendance records)
    const totalLopDays = Number(leaveData.lop_days || 0) + attendanceLop;

    // Calculate working days in the month
    const daysInMonth = new Date(year, month, 0).getDate();
    
    // Calculate paid days (working days - LOP days)
    const paidDays = daysInMonth - totalLopDays;

    return res.json({
      month,
      year,
      totalWorkingDays: daysInMonth,
      lopDays: totalLopDays,
      paidDays: Math.max(0, paidDays),
      paidLeaveDays: Number(leaveData.paid_leave_days || 0),
      totalLeaveDays: Number(leaveData.total_leave_days || 0)
    });
  } catch (e: any) {
    console.error("Error fetching leave summary:", e);
    res.status(500).json({ error: e.message || "Failed to fetch leave summary" });
  }
});

// ========== ATTENDANCE MANAGEMENT ENDPOINTS ==========

// Get my attendance records (employee self-service)
appRouter.get("/attendance/me", requireAuth, async (req, res) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const email = (req as any).userEmail as string;
    const month = req.query.month ? parseInt(req.query.month as string) : undefined;
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    // Get employee ID from email
    const empResult = await query<{ id: string }>(
      "SELECT id FROM employees WHERE tenant_id = $1 AND email = $2 LIMIT 1",
      [tenantId, email]
    );

    if (!empResult.rows[0]) {
      return res.status(404).json({ error: "Employee not found" });
    }

    const employeeId = empResult.rows[0].id;

    let sqlQuery = `
      SELECT 
        ar.*,
        e.full_name as employee_name,
        e.employee_code
      FROM attendance_records ar
      JOIN employees e ON ar.employee_id = e.id
      WHERE ar.tenant_id = $1 AND ar.employee_id = $2
    `;
    const params: any[] = [tenantId, employeeId];
    let paramIndex = 3;

    if (month && year) {
      sqlQuery += ` AND EXTRACT(YEAR FROM ar.attendance_date) = $${paramIndex} AND EXTRACT(MONTH FROM ar.attendance_date) = $${paramIndex + 1}`;
      params.push(year, month);
      paramIndex += 2;
    } else if (startDate && endDate) {
      sqlQuery += ` AND ar.attendance_date >= $${paramIndex} AND ar.attendance_date <= $${paramIndex + 1}`;
      params.push(startDate, endDate);
      paramIndex += 2;
    }

    sqlQuery += " ORDER BY ar.attendance_date DESC";

    const result = await query(sqlQuery, params);
    return res.json({ attendanceRecords: result.rows });
  } catch (e: any) {
    console.error("Error fetching my attendance records:", e);
    res.status(500).json({ error: e.message || "Failed to fetch attendance records" });
  }
});

// Get attendance records (Admin/HR view)
appRouter.get("/attendance", requireAuth, async (req, res) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const employeeId = req.query.employeeId as string | undefined;
    const month = req.query.month ? parseInt(req.query.month as string) : undefined;
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    let sqlQuery = `
      SELECT 
        ar.*,
        e.full_name as employee_name,
        e.employee_code
      FROM attendance_records ar
      JOIN employees e ON ar.employee_id = e.id
      WHERE ar.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (employeeId) {
      sqlQuery += ` AND ar.employee_id = $${paramIndex}`;
      params.push(employeeId);
      paramIndex++;
    }

    if (month && year) {
      sqlQuery += ` AND EXTRACT(YEAR FROM ar.attendance_date) = $${paramIndex} AND EXTRACT(MONTH FROM ar.attendance_date) = $${paramIndex + 1}`;
      params.push(year, month);
      paramIndex += 2;
    } else if (startDate && endDate) {
      sqlQuery += ` AND ar.attendance_date >= $${paramIndex} AND ar.attendance_date <= $${paramIndex + 1}`;
      params.push(startDate, endDate);
      paramIndex += 2;
    }

    sqlQuery += " ORDER BY ar.attendance_date DESC, e.full_name ASC";

    const result = await query(sqlQuery, params);
    return res.json({ attendanceRecords: result.rows });
  } catch (e: any) {
    console.error("Error fetching attendance records:", e);
    res.status(500).json({ error: e.message || "Failed to fetch attendance records" });
  }
});

// Create or update attendance record
appRouter.post("/attendance", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const tenantId = (req as any).tenantId as string;
    const { employeeId, attendanceDate, status, isLop, remarks } = req.body;

    if (!employeeId || !attendanceDate || !status) {
      return res.status(400).json({ error: "Missing required fields: employeeId, attendanceDate, status" });
    }

    const result = await query(
      `INSERT INTO attendance_records (
        tenant_id, employee_id, attendance_date, status, is_lop, remarks, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (tenant_id, employee_id, attendance_date) 
      DO UPDATE SET
        status = EXCLUDED.status,
        is_lop = EXCLUDED.is_lop,
        remarks = EXCLUDED.remarks,
        updated_at = NOW()
      RETURNING *`,
      [tenantId, employeeId, attendanceDate, status, isLop || false, remarks || null, userId]
    );

    return res.status(201).json({ attendanceRecord: result.rows[0] });
  } catch (e: any) {
    console.error("Error creating/updating attendance record:", e);
    res.status(500).json({ error: e.message || "Failed to create/update attendance record" });
  }
});

// Bulk create attendance records
appRouter.post("/attendance/bulk", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const tenantId = (req as any).tenantId as string;
    const { records } = req.body; // Array of { employeeId, attendanceDate, status, isLop, remarks }

    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: "records must be a non-empty array" });
    }

    const results = [];
    for (const record of records) {
      const { employeeId, attendanceDate, status, isLop, remarks } = record;
      
      if (!employeeId || !attendanceDate || !status) {
        continue; // Skip invalid records
      }

      const result = await query(
        `INSERT INTO attendance_records (
          tenant_id, employee_id, attendance_date, status, is_lop, remarks, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tenant_id, employee_id, attendance_date) 
        DO UPDATE SET
          status = EXCLUDED.status,
          is_lop = EXCLUDED.is_lop,
          remarks = EXCLUDED.remarks,
          updated_at = NOW()
        RETURNING *`,
        [tenantId, employeeId, attendanceDate, status, isLop || false, remarks || null, userId]
      );

      results.push(result.rows[0]);
    }

    return res.status(201).json({ attendanceRecords: results, count: results.length });
  } catch (e: any) {
    console.error("Error bulk creating attendance records:", e);
    res.status(500).json({ error: e.message || "Failed to bulk create attendance records" });
  }
});

// Payroll Register CSV Report
appRouter.get("/reports/payroll-register", requireAuth, async (req, res) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const { cycleId } = req.query;

    if (!cycleId || typeof cycleId !== "string") {
      return res.status(400).json({ error: "cycleId query parameter is required" });
    }

    // Verify cycle belongs to tenant
    const cycleCheck = await query<{ month: number; year: number }>(
      "SELECT month, year FROM payroll_cycles WHERE id = $1 AND tenant_id = $2",
      [cycleId, tenantId]
    );

    if (cycleCheck.rows.length === 0) {
      return res.status(404).json({ error: "Payroll cycle not found" });
    }

    const cycle = cycleCheck.rows[0];
    const monthName = new Date(2000, cycle.month - 1).toLocaleString('en-IN', { month: 'long' });

    // Fetch payroll items with employee details
    const payrollItems = await query(
      `
      SELECT 
        e.employee_code,
        e.full_name,
        e.pan_number,
        e.bank_account_number,
        pi.basic_salary,
        pi.hra,
        pi.special_allowance,
        pi.gross_salary,
        pi.pf_deduction,
        pi.esi_deduction,
        pi.tds_deduction,
        pi.pt_deduction,
        pi.deductions,
        pi.net_salary,
        pi.lop_days,
        pi.paid_days,
        pi.total_working_days
      FROM payroll_items pi
      JOIN employees e ON pi.employee_id = e.id
      WHERE pi.payroll_cycle_id = $1
        AND pi.tenant_id = $2
      ORDER BY e.employee_code ASC
      `,
      [cycleId, tenantId]
    );

    if (payrollItems.rows.length === 0) {
      return res.status(404).json({ error: "No payroll data found for this cycle" });
    }

    // Generate CSV
    const headers = [
      "Employee Code",
      "Employee Name",
      "PAN Number",
      "Bank Account Number",
      "Basic Salary",
      "HRA",
      "Special Allowance",
      "Gross Salary",
      "PF Deduction",
      "ESI Deduction",
      "TDS Deduction",
      "PT Deduction",
      "Total Deductions",
      "Net Salary",
      "LOP Days",
      "Paid Days",
      "Total Working Days"
    ];

    // Helper function to escape CSV values
    const escapeCSV = (value: any): string => {
      if (value === null || value === undefined) {
        return "";
      }
      const str = String(value);
      // If contains comma, newline, or quote, wrap in quotes and escape quotes
      if (str.includes(",") || str.includes("\n") || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Helper function to format currency (as number without currency symbol)
    const formatCurrency = (amount: number | null | undefined): string => {
      if (amount === null || amount === undefined) {
        return "0.00";
      }
      return Number(amount).toFixed(2);
    };

    // Build CSV rows
    const csvRows = [headers.map(escapeCSV).join(",")];

    for (const row of payrollItems.rows) {
      const csvRow = [
        escapeCSV(row.employee_code || ""),
        escapeCSV(row.full_name || ""),
        escapeCSV(row.pan_number || ""),
        escapeCSV(row.bank_account_number || ""),
        formatCurrency(row.basic_salary),
        formatCurrency(row.hra),
        formatCurrency(row.special_allowance),
        formatCurrency(row.gross_salary),
        formatCurrency(row.pf_deduction),
        formatCurrency(row.esi_deduction),
        formatCurrency(row.tds_deduction),
        formatCurrency(row.pt_deduction),
        formatCurrency(row.deductions),
        formatCurrency(row.net_salary),
        escapeCSV(row.lop_days || 0),
        escapeCSV(row.paid_days || 0),
        escapeCSV(row.total_working_days || 0)
      ];
      csvRows.push(csvRow.join(","));
    }

    const csvContent = csvRows.join("\n");

    // Set response headers for CSV download
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="payroll-register-${monthName}-${cycle.year}.csv"`
    );

    // Send CSV content
    res.send(csvContent);

  } catch (e: any) {
    console.error("Error generating payroll register report:", e);
    res.status(500).json({ error: e.message || "Failed to generate payroll register report" });
  }
});

