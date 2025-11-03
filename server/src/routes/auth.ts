import { Router } from "express";
import { query } from "../db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";
const TOKEN_COOKIE = "session";

export const authRouter = Router();

authRouter.post("/signup", async (req, res) => {
  const { email, password, fullName, companyName, subdomain } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });

  const passwordHash = await bcrypt.hash(password, 10);

  // Create tenant, user, profile, role in a transaction
  try {
    await query("BEGIN");

    const tenantInsert = await query<{ id: string }>(
      "INSERT INTO tenants (subdomain, company_name, theme_color) VALUES ($1, $2, $3) RETURNING id",
      [String(subdomain || "").toLowerCase(), companyName || null, "#1E40AF"]
    );
    const tenantId = tenantInsert.rows[0].id;

    const userInsert = await query<{ id: string }>(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
      [email, passwordHash]
    );
    const userId = userInsert.rows[0].id;

    await query(
      "INSERT INTO profiles (id, tenant_id, email, full_name) VALUES ($1, $2, $3, $4)",
      [userId, tenantId, email, fullName || null]
    );

    await query(
      "INSERT INTO user_roles (user_id, tenant_id, role) VALUES ($1, $2, $3)",
      [userId, tenantId, "owner"]
    );

    await query("COMMIT");

    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie(TOKEN_COOKIE, token, { httpOnly: true, sameSite: "lax" });
    return res.json({ user: { id: userId, email }, tenantId });
  } catch (e) {
    await query("ROLLBACK");
    if ((e as any)?.code === "23505") {
      return res.status(409).json({ error: "Email already exists" });
    }
    console.error(e);
    return res.status(500).json({ error: "Signup failed" });
  }
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });
  const result = await query<{ id: string; password_hash: string }>(
    "SELECT id, password_hash FROM users WHERE email = $1",
    [email]
  );
  if (result.rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });
  const user = result.rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
  res.cookie(TOKEN_COOKIE, token, { httpOnly: true, sameSite: "lax" });
  return res.json({ user: { id: user.id, email } });
});

authRouter.post("/logout", async (_req, res) => {
  res.clearCookie(TOKEN_COOKIE);
  res.json({ ok: true });
});

authRouter.get("/session", async (req, res) => {
  const token = req.cookies?.[TOKEN_COOKIE];
  if (!token) return res.json({ session: null });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    return res.json({ session: { userId: payload.userId } });
  } catch {
    return res.json({ session: null });
  }
});

authRouter.post("/employee-signup", async (req, res) => {
  const { email, password, fullName } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });
  const employee = await query<{ tenant_id: string; full_name: string }>(
    "SELECT tenant_id, full_name FROM employees WHERE email = $1 LIMIT 1",
    [email]
  );
  if (!employee.rows[0]) return res.status(404).json({ error: "No employee record found" });
  const { tenant_id, full_name } = employee.rows[0];

  try {
    await query("BEGIN");
    const passwordHash = await bcrypt.hash(password, 10);
    const userInsert = await query<{ id: string }>(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
      [email, passwordHash]
    );
    const userId = userInsert.rows[0].id;
    await query(
      "INSERT INTO profiles (id, tenant_id, email, full_name) VALUES ($1, $2, $3, $4)",
      [userId, tenant_id, email, fullName || full_name]
    );
    await query("COMMIT");
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie(TOKEN_COOKIE, token, { httpOnly: true, sameSite: "lax" });
    return res.json({ user: { id: userId, email }, tenantId: tenant_id });
  } catch (e) {
    await query("ROLLBACK");
    if ((e as any)?.code === "23505") {
      return res.status(409).json({ error: "Email already exists" });
    }
    console.error(e);
    return res.status(500).json({ error: "Signup failed" });
  }
});

