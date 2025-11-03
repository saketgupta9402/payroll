import { useState, useEffect } from "react";
// Import useLocation to read query parameters
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, PlusCircle, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
// Updated import paths to be relative
import { AddEmployeeDialog } from "../components/employees/AddEmployeeDialog";
import { EmployeeList } from "../components/employees/EmployeeList";
import { api } from "../lib/api";
import { toast } from "sonner";

const Employees = () => {
  const navigate = useNavigate();
  const location = useLocation(); // Get the current location
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [companyName, setCompanyName] = useState<string>("Loading...");
  const [isLoading, setIsLoading] = useState(true);

  // Check for ?new=true in the URL when the component loads
  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    if (queryParams.get("new") === "true") {
      setIsDialogOpen(true);
      // Optional: remove the query param from the URL
      navigate(location.pathname, { replace: true });
    }
  }, [location, navigate]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const session = await api.auth.session();
        if (!session?.session) {
          navigate("/auth");
          return;
        }

        // Fetch the tenant name for the header
        const t = await api.dashboard.tenant();
        if (t?.tenant?.company_name) {
          setCompanyName(t.tenant.company_name);
        } else {
          toast.error("No tenant found for your account");
        }
      } catch (error: any) {
        console.error("Error fetching tenant:", error);
        toast.error("Failed to load tenant information");
        if (error.message.includes("Unauthorized")) {
          navigate("/auth");
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

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
              <h1 className="text-3xl font-bold text-foreground">Employees - {companyName}</h1>
              <p className="text-muted-foreground">Manage your workforce</p>
            </div>
            <Button onClick={() => setIsDialogOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Employee
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card className="p-6 shadow-md">
          <div className="flex items-center space-x-2 mb-6">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search employees by name, email, or employee code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
          </div>

          {/* Remove tenantId prop from EmployeeList */}
          <EmployeeList searchTerm={searchTerm} />
        </Card>
      </main>

      {/* Remove tenantId prop from AddEmployeeDialog */}
      <AddEmployeeDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
    </div>
  );
};

export default Employees;

