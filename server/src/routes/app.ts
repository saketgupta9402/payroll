import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { query } from "../db.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

export const appRouter = Router();
appRouter.get("/test", (req, res) => {
  res.json({ message: "Router is working!" });
});

// --- UPDATED HELPER FUNCTION ---
// This function is defined once and used by the auth middleware
async function getUserTenant(userId: string) {
  const profile = await query<{ tenant_id: string; email: string }>(
    "SELECT tenant_id, email FROM profiles WHERE id = $1",
    [userId]
  );
  if (!profile.rows[0]) {
    throw new Error("Profile not found");
  }
  return profile.rows[0];
}

// --- UPDATED MIDDLEWARE ---
// This middleware is now async. It verifies the user AND gets their tenant info.
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = (req as any).cookies?.["session"];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    // 1. Verify the token to get userId
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    (req as any).userId = payload.userId;

    // 2. Fetch tenant_id and email
    const profile = await getUserTenant(payload.userId);
    (req as any).tenantId = profile.tenant_id;
    (req as any).userEmail = profile.email; // Add email for good measure

    next();
  } catch (e: any) {
    let error = "Unauthorized";
    if (e.message === "Profile not found") {
      error = "User profile not found. Please sign in again.";
    }
    return res.status(401).json({ error });
  }
}

// --- ALL ENDPOINTS BELOW ARE NOW CORRECT ---
// They can safely assume (req as any).userId and (req as any).tenantId exist

appRouter.get("/profile", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const result = await query(
    "SELECT tenant_id, email, full_name FROM profiles WHERE id = $1",
    [userId]
  );
  return res.json({ profile: result.rows[0] || null });
});

appRouter.get("/tenant", requireAuth, async (req, res) => {
  const tenantId = (req as any).tenantId as string;
  if (!tenantId) return res.json({ tenant: null });
  const tenant = await query(
    "SELECT id, company_name FROM tenants WHERE id = $1",
    [tenantId]
  );
  return res.json({ tenant: tenant.rows[0] || null });
});

appRouter.get("/stats", requireAuth, async (req, res) => {
  const tenantId = (req as any).tenantId as string;
  if (!tenantId) return res.json({ stats: { totalEmployees: 0, monthlyPayroll: 0, pendingApprovals: 0, activeCycles: 0 } });

  const employeeCountQ = await query<{ count: string }>(
    "SELECT count(*)::text as count FROM employees WHERE tenant_id = $1",
    [tenantId]
  );
  const cyclesQ = await query<{ total_amount: string; status: string }>(
    "SELECT total_amount::text, status FROM payroll_cycles WHERE tenant_id = $1 ORDER BY created_at DESC",
    [tenantId]
  );

  const cycles = cyclesQ.rows;
  const activeCycles = cycles.filter(c => c.status === "draft").length;
  const pendingApprovals = cycles.filter(c => c.status === "processing").length;
  const lastApproved = cycles.find(c => c.status === "approved");
  const monthlyPayroll = lastApproved ? Number(lastApproved.total_amount) : 0;
  const totalEmployees = Number(employeeCountQ.rows[0]?.count || 0);

  return res.json({ stats: { totalEmployees, monthlyPayroll, pendingApprovals, activeCycles } });
});

appRouter.get("/payroll-cycles", requireAuth, async (req, res) => {
  const tenantId = (req as any).tenantId as string;
  if (!tenantId) return res.json({ cycles: [] });
  const rows = await query(
    "SELECT id, year, month, total_amount, status, created_at FROM payroll_cycles WHERE tenant_id = $1 ORDER BY year DESC, month DESC",
    [tenantId]
  );
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
    
    const emp = await query<{ id: string }>(
      "SELECT id FROM employees WHERE tenant_id = $1 AND email = $2 LIMIT 1",
      [tenantId, email]
    );
    
    if (!emp.rows[0]) {
      return res.json({ payslips: [] });
    }
    const employeeId = emp.rows[0].id;

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

appRouter.post("/employees", requireAuth, async (req, res) => {
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

    let sqlQuery = "SELECT * FROM employees WHERE tenant_id = $1";
    const params: any[] = [tenantId];

    if (searchTerm) {
      sqlQuery += " AND (full_name ILIKE $2 OR email ILIKE $2 OR employee_code ILIKE $2)";
      params.push(`%${searchTerm}%`);
    }

    sqlQuery += " ORDER BY created_at DESC";

    const result = await query(sqlQuery, params);
    
    return res.json({ employees: result.rows });

  } catch (e: any) {
    console.error("Error fetching employees:", e);
    res.status(500).json({ error: e.message || "Failed to fetch employees" });
  }
});

appRouter.get("/employees/:employeeId/compensation", requireAuth, async (req, res) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const { employeeId } = req.params;

    const result = await query(
      "SELECT * FROM compensation_structures WHERE tenant_id = $1 AND employee_id = $2 ORDER BY effective_from DESC",
      [tenantId, employeeId]
    );

    return res.json({ compensations: result.rows });

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

appRouter.get("/employees/me/compensation", requireAuth, async (req, res) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const email = (req as any).userEmail as string;

    const emp = await query<{ id: string }>(
      "SELECT id FROM employees WHERE tenant_id = $1 AND email = $2 LIMIT 1",
      [tenantId, email]
    );
    
    if (!emp.rows[0]) {
      return res.json({ compensation: null });
    }
    const employeeId = emp.rows[0].id;

    const result = await query(
      `SELECT * FROM compensation_structures
       WHERE employee_id = $1 AND tenant_id = $2
       ORDER BY effective_from DESC
       LIMIT 1`,
      [employeeId, tenantId]
    );
    
    return res.json({ compensation: result.rows[0] || null });

  } catch (e: any) {
    console.error("Error fetching employee compensation:", e);
    res.status(500).json({ error: e.message || "Failed to fetch employee compensation" });
  }
});

// --- FIX: All endpoints below now correctly get tenantId ---

appRouter.get("/payroll/new-cycle-data", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const tenantId = (req as any).tenantId as string; // Get from middleware
  if (!tenantId) {
      return res.status(403).json({ error: "User tenant not found" });
  }

  // Get active employees count
  const { rows: countRows } = await query(
      "SELECT count(*) FROM employees WHERE tenant_id = $1 AND status = 'active'",
      [tenantId]
  );
  const employeeCount = parseInt(countRows[0].count, 10) || 0;

  // Get total monthly compensation
  const { rows: compRows } = await query(
    `SELECT SUM(cs.ctc / 12) as total
     FROM compensation_structures cs
     JOIN employees e ON e.id = cs.employee_id
     WHERE e.tenant_id = $1 AND e.status = 'active'
     AND cs.effective_from = (
         SELECT MAX(effective_from)
         FROM compensation_structures
         WHERE employee_id = e.id
     )`,
    [tenantId]
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
      return res.status(201).json({ payrollCycle: rows[0] });
  } catch (e: any) {
      if (e.code === '23505') { // unique_violation
          return res.status(409).json({ error: "A payroll cycle for this month and year already exists." });
      }
      console.error(e);
      return res.status(500).json({ error: "Failed to create payroll cycle" });
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

  if (pf_rate === undefined || basic_salary_percentage === undefined) {
    return res.status(400).json({ error: "Missing required settings fields" });
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

