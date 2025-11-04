import { useQuery } from "@tanstack/react-query";
// Import your new API client instead of Supabase
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, Download } from "lucide-react";
import { toast } from "sonner";

// This component no longer needs props, as the backend
// identifies the user from their session cookie.
export const PayslipsTab = () => {
  const { data: payslips, isLoading } = useQuery({
    // Simplified query key
    queryKey: ["my-payslips"],
    queryFn: async () => {
      // Use the proper API method
      const data = await api.payslips.list();
      return data.payslips || [];
    },
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleDownloadPayslip = async (payslip: any) => {
    try {
      await api.payslips.downloadPDF(payslip.id);
      toast.success("Payslip downloaded successfully");
    } catch (error: any) {
      console.error("Error downloading payslip:", error);
      toast.error(error.message || "Failed to download payslip");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (!payslips || payslips.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Receipt className="mr-2 h-5 w-5 text-primary" />
            No Payslips Available
          </CardTitle>
          <CardDescription>Your payslips will appear here once payroll is processed</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Your Payslips</h3>
        <p className="text-sm text-muted-foreground">{payslips.length} payslip(s) available</p>
      </div>

      <div className="grid gap-4">
        {payslips.map((payslip: any) => {
          // This logic works perfectly because our backend creates
          // the 'payroll_cycles' object just like Supabase did.
          const monthName = new Date(2000, payslip.payroll_cycles.month - 1).toLocaleString('en-IN', { month: 'long' });
          
          return (
            <Card key={payslip.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <Receipt className="h-5 w-5 text-primary" />
                      <h4 className="font-semibold text-lg">
                        {monthName} {payslip.payroll_cycles.year}
                      </h4>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Gross Salary</p>
                        <p className="font-semibold">{formatCurrency(Number(payslip.gross_salary))}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Deductions</p>
                        <p className="font-semibold text-destructive">-{formatCurrency(Number(payslip.deductions))}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-sm text-muted-foreground">Net Salary</p>
                        <p className="text-xl font-bold text-primary">{formatCurrency(Number(payslip.net_salary))}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
                      <div className="bg-muted/50 p-2 rounded">
                        <p className="text-muted-foreground">PF Deduction</p>
                        <p className="font-medium">₹{Number(payslip.pf_deduction).toFixed(0)}</p>
                      </div>
                      <div className="bg-muted/50 p-2 rounded">
                        <p className="text-muted-foreground">ESI Deduction</p>
                        <p className="font-medium">₹{Number(payslip.esi_deduction).toFixed(0)}</p>
                      </div>
                      <div className="bg-muted/50 p-2 rounded">
                        <p className="text-muted-foreground">TDS Deduction</p>
                        {/* --- THIS IS THE FIX --- */}
                        <p className="font-medium">₹{Number(payslip.tds_deduction).toFixed(0)}</p>
                        {/* --- END OF FIX --- */}
                      </div>
                      <div className="bg-muted/50 p-2 rounded">
                        <p className="text-muted-foreground">PT Deduction</p>
                        <p className="font-medium">₹{Number(payslip.pt_deduction).toFixed(0)}</p>
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadPayslip(payslip)}
                    className="ml-4"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

