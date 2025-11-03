import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
// Updated import path
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, IndianRupee, FileText, LogOut, PlusCircle } from "lucide-react";
import { toast } from "sonner";

// Define a type for the profile state
interface UserProfile {
  email: string;
  full_name: string;
  tenant_id: string;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ id: string } | null>(null);
  // Add state for the user's profile
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState<string>("Loading...");
  const [stats, setStats] = useState({
    totalEmployees: 0,
    monthlyPayroll: 0,
    pendingApprovals: 0,
    activeCycles: 0
  });

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const session = await api.auth.session();
        if (!session?.session) {
          navigate("/auth");
          return;
        }
        setUser({ id: session.session.userId });
      } catch (error) {
        navigate("/auth");
      }
    };

    checkAuth();
  }, [navigate]);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      
      try {
        // Fetch profile, tenant, and stats
        const [profileRes, tenantRes, statsRes] = await Promise.all([
          api.me.profile(),
          api.dashboard.tenant(),
          api.dashboard.stats(),
        ]);

        if (profileRes?.profile) setProfile(profileRes.profile);
        if (tenantRes?.tenant?.company_name) setCompanyName(tenantRes.tenant.company_name);
        if (statsRes?.stats) setStats(statsRes.stats);

      } catch (error: any) {
        toast.error(`Failed to load dashboard: ${error.message}`);
        if (error.message.includes("Unauthorized")) {
          navigate("/auth");
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user, navigate]);

  const handleSignOut = async () => {
    await api.auth.logout();
    navigate("/auth");
    toast.success("Signed out successfully");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Building2 className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{companyName}</h1>
              {/* Use the email from the fetched profile */}
              <p className="text-xs text-muted-foreground">{profile?.email || user?.id}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-foreground mb-2">Dashboard</h2>
          <p className="text-muted-foreground">Manage your payroll operations efficiently</p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card className="shadow-md hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalEmployees}</div>
              <p className="text-xs text-muted-foreground">Active employees</p>
            </CardContent>
          </Card>

          <Card className="shadow-md hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monthly Payroll</CardTitle>
              <IndianRupee className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{stats.monthlyPayroll.toLocaleString('en-IN')}</div>
              <p className="text-xs text-muted-foreground">Last approved cycle</p>
            </CardContent>
          </Card>

          <Card className="shadow-md hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pendingApprovals}</div>
              <p className="text-xs text-muted-foreground">Awaiting approval</p>
            </CardContent>
          </Card>

          <Card className="shadow-md hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Cycles</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeCycles}</div>
              <p className="text-xs text-muted-foreground">Draft cycles</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card className="shadow-md hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate("/employees")}>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="mr-2 h-5 w-5 text-primary" />
                Manage Employees
              </CardTitle>
              <CardDescription>Add, edit, or remove employee records</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={(e) => { e.stopPropagation(); navigate("/employees?new=true"); }}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Employee
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-md hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate("/payroll")}>
            <CardHeader>
              <CardTitle className="flex items-center">
                <IndianRupee className="mr-2 h-5 w-5 text-green-500" />
                Payroll Cycles
              </CardTitle>
              <CardDescription>Create and manage payroll runs</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="secondary" onClick={(e) => { e.stopPropagation(); navigate("/payroll?new=true"); }}>
                <PlusCircle className="mr-2 h-4 w-4" />
                New Payroll Cycle
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-md hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate("/reports")}>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="mr-2 h-5 w-5 text-blue-500" />
                Reports
              </CardTitle>
              <CardDescription>View payroll and compliance reports</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="outline">
                View Reports
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Getting Started */}
        <Card className="mt-8 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
            <CardDescription>Complete these steps to set up your payroll system</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                1
              </div>
              <p className="text-sm">Add your first employee</p>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-bold">
                2
              </div>
              <p className="text-sm text-muted-foreground">Configure salary structures</p>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-bold">
                3
              </div>
              <p className="text-sm text-muted-foreground">Run your first payroll cycle</p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Dashboard;
