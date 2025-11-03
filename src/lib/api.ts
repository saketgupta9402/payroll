const API_URL = "http://localhost:4000";

const ABSOLUTE_URL_REGEX = /^https?:\/\//i;
const NO_PREFIX_PATHS = ["/auth", "/health"];

const resolveEndpoint = (endpoint: string) => {
  if (ABSOLUTE_URL_REGEX.test(endpoint)) {
    return endpoint;
  }

  const withLeadingSlash = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const needsApiPrefix =
    !withLeadingSlash.startsWith("/api") &&
    !NO_PREFIX_PATHS.some((prefix) => withLeadingSlash.startsWith(prefix));

  const finalPath = needsApiPrefix ? `/api${withLeadingSlash}` : withLeadingSlash;
  return `${API_URL}${finalPath}`;
};

// --- CORE API CLIENT ---

/**
 * A simple API client to make authenticated requests to your backend.
 * `credentials: "include"` is the most important part, as it sends
 * the 'session' cookie to your backend for authentication.
 */
const client = {
  get: async <T>(endpoint: string): Promise<T> => {
    const response = await fetch(resolveEndpoint(endpoint), {
      method: "GET",
      credentials: "include", // <-- This sends the auth cookie
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "API error" }));
      throw new Error(errorData.error || `API error: ${response.statusText}`);
    }
    return response.json();
  },

  post: async <T>(endpoint: string, body: any): Promise<T> => {
    const response = await fetch(resolveEndpoint(endpoint), {
      method: "POST",
      credentials: "include", // <-- This sends the auth cookie
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "API error" }));
      throw new Error(errorData.error || `API error: ${response.statusText}`);
    }
    return response.json();
  },
};

// --- API METHODS ---

/**
 * This is a structured API client that uses the core `client`
 * to interact with your specific backend endpoints.
 */
export const api = {
  // Simple .get() and .post() for general use
  get: client.get,
  post: client.post,

  // --- Authentication ---
  auth: {
    login: (email, password) =>
      client.post("/auth/login", { email, password }),

    signup: (data) =>
      client.post("/auth/signup", data),

    employeeSignup: (data) =>
      client.post("/auth/employee-signup", data),

    logout: () =>
      client.post("/auth/logout", {}),

    session: () =>
      client.get("/auth/session"),
  },

  // --- Current User ("Me") ---
  me: {
    profile: () =>
      client.get("/api/profile"),

    employee: () =>
      client.get("/api/employees/me"),

    compensation: () =>
      client.get("/api/employees/me/compensation"),
  },

  // --- NEW: Dashboard ---
  dashboard: {
    tenant: () =>
      client.get("/api/tenant"),
    
    stats: () =>
      client.get("/api/stats"),
  },
  
  // --- Data Endpoints ---
  employees: {
    list: (searchTerm?: string) => {
      const params = new URLSearchParams();
      if (searchTerm) {
        params.set("q", searchTerm);
      }
      const queryString = params.toString();
      const endpoint = `/api/employees${queryString ? `?${queryString}` : ""}`;
      return client.get<{ employees: any[] }>(endpoint);
    },

    create: (data) => client.post("/api/employees", data),

    getCompensation: (employeeId) =>
      client.get(`/api/employees/${employeeId}/compensation`),

    createCompensation: (employeeId, data) =>
      client.post(`/api/employees/${employeeId}/compensation`, data),
  },

  payroll: {
    getNewCycleData: () =>
      client.get("/api/payroll/new-cycle-data"),
    
    createCycle: (data) =>
      client.post("/api/payroll-cycles", data),
  },
  
  payslips: {
    list: () =>
      client.get("/api/payslips"),
  },

  tax: {
    getDeclarations: () =>
      client.get("/api/tax-declarations"),
    
    createDeclaration: (data) =>
      client.post("/api/tax-declarations", data),

    getDocuments: () =>
      client.get("/api/tax-documents"),
  }
};

