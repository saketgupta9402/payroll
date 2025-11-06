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
    const loadData = async (retryCount = 0) => {
      try {
        // Wait a moment for cookies to be available (they might be set by redirect)
        // This is especially important when coming from PIN verification
        if (retryCount === 0) {
          // First attempt - wait a bit for cookies to be set
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Check for session and PIN cookies (cookie-based auth)
        // Note: httpOnly cookies won't be accessible via document.cookie
        // So we'll try to make an API call - if it succeeds, cookies are set
        // If it fails with 401, cookies are missing
        
        console.log('[Employees] Attempting to load data (retry:', retryCount, ')');
        
        // Try to fetch tenant - this will fail if cookies aren't set
        let t;
        try {
          t = await api.dashboard.tenant();
          console.log('[Employees] Successfully fetched tenant, cookies are set');
        } catch (error: any) {
          // If unauthorized, cookies might not be set yet
          if (error.message && error.message.includes("Unauthorized")) {
            if (retryCount < 3) {
              console.log('[Employees] Unauthorized, waiting for cookies... (retry:', retryCount + 1, ')');
              setTimeout(() => {
                loadData(retryCount + 1);
              }, 1000); // Wait 1 second for cookies to be available
              return;
            } else {
              // Still unauthorized after retries, redirect to pin-auth
              console.log('[Employees] Still unauthorized after retries, redirecting to pin-auth');
              navigate("/pin-auth");
              return;
            }
          } else {
            // Other error, just show message
            throw error;
          }
        }

        // Successfully fetched data, cookies are set
        console.log('[Employees] Cookies are set, data loaded successfully');
        
        // Fetch the tenant name for the header
        if (t?.tenant?.company_name) {
          setCompanyName(t.tenant.company_name);
        } else {
          toast.error("No tenant found for your account");
        }
      } catch (error: any) {
        console.error("Error fetching tenant:", error);
        // Don't redirect on API errors - just show error
        // Only redirect if it's a clear authentication error
        if (error.message && error.message.includes("Unauthorized")) {
          console.log('[Employees] Unauthorized error, redirecting to pin-auth');
          navigate("/pin-auth");
        } else {
          toast.error("Failed to load tenant information");
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

