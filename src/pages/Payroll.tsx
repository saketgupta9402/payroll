import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Calendar, Settings } from "lucide-react";
// Use relative paths assuming /pages is not in /src
import { api } from "../lib/api";
import { CreatePayrollDialog } from "@/components/payroll/CreatePayrollDialog";
import { PayrollCycleList } from "@/components/payroll/PayrollCycleList";
import { toast } from "sonner";

const Payroll = () => {
  const navigate = useNavigate();
  const [cycles, setCycles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // We still need to check if the user is an admin, so we fetch the profile
  const [isAdmin, setIsAdmin] = useState(false);

  const fetchCycles = async () => {
    setLoading(true);
    try {
      const res = await api.dashboard.cycles();
      setCycles(res.cycles || []);
    } catch (error: any) {
      toast.error(`Failed to fetch cycles: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Check for session and PIN cookies (cookie-based auth)
        const cookies = document.cookie || "";
        const hasSession = /(?:^|; )session=/.test(cookies);
        const hasPinOk = /(?:^|; )pin_ok=/.test(cookies);
        
        if (!hasSession || !hasPinOk) {
          navigate("/pin-auth");
          return;
        }

        const profile = await api.me.profile();
        if (profile?.profile?.tenant_id) {
          // User is an admin/owner, they can be here
          setIsAdmin(true);
          fetchCycles();
        } else {
          // User is not an admin, check if they are an employee
          const me = await api.me.employee();
          if (me?.employee) {
            navigate("/employee-portal"); // Redirect to employee portal
          } else {
            navigate("/pin-auth"); // No valid role found
          }
        }
      } catch (error) {
        navigate("/pin-auth");
      }
    };

    fetchData();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Payroll Cycles</h1>
              <p className="text-muted-foreground">Manage monthly payroll runs</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate("/payroll/settings")}>
                <Settings className="mr-2 h-4 w-4" />
                Configure Payroll
              </Button>
              {/* Remove tenantId and userId props */}
              {isAdmin && (
                <CreatePayrollDialog
                  onSuccess={() => fetchCycles()}
                />
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="mr-2 h-5 w-5 text-primary" />
              Payroll History
            </CardTitle>
            <CardDescription>View and manage past and current payroll cycles</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="text-muted-foreground mt-4">Loading payroll cycles...</p>
              </div>
            ) : (
              <PayrollCycleList cycles={cycles} onRefresh={fetchCycles} />
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Payroll;

