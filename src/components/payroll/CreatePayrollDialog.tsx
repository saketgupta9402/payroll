import { useState, useEffect } from "react";
// Import the API client
import { api } from "../../lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// Removed useToast, using sonnerToast for consistency
import { PlusCircle } from "lucide-react";
import { toast as sonnerToast } from "sonner";

interface CreatePayrollDialogProps {
  // tenantId and userId are no longer needed, backend gets them from session
  onSuccess: () => void;
}

export const CreatePayrollDialog = ({ onSuccess }: CreatePayrollDialogProps) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState("");
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [payday, setPayday] = useState("");
  
  // These are now fetched from the API
  const [employeeCount, setEmployeeCount] = useState(0);
  const [totalCompensation, setTotalCompensation] = useState(0);

  useEffect(() => {
    if (month && year) {
      // Calculate default payday (last working day of the month)
      const lastDay = new Date(parseInt(year), parseInt(month), 0);
      const dayOfWeek = lastDay.getDay();
      
      if (dayOfWeek === 0) { // Sunday
        lastDay.setDate(lastDay.getDate() - 2);
      } else if (dayOfWeek === 6) { // Saturday
        lastDay.setDate(lastDay.getDate() - 1);
      }
      
      setPayday(lastDay.toISOString().split('T')[0]);
    }
  }, [month, year]);

  useEffect(() => {
    // Fetch employee data when month/year changes or dialog opens
    const fetchEmployeeData = async () => {
      if (!month || !year) return;
      
      try {
        const params = new URLSearchParams({
          month: month,
          year: year,
        });
        const data = await api.get<{ employeeCount: number, totalCompensation: number }>(`payroll/new-cycle-data?${params.toString()}`);
        setEmployeeCount(data.employeeCount || 0);
        setTotalCompensation(data.totalCompensation || 0);
      } catch (error: any) {
        sonnerToast.error(`Failed to fetch payroll data: ${error.message}`);
      }
    };

    if (open && month && year) {
      fetchEmployeeData();
    }
  }, [open, month, year]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const body = {
        month: parseInt(month),
        year: parseInt(year),
        payday: payday,
        employeeCount: employeeCount,
        totalCompensation: totalCompensation,
      };

      // Use the API client to create the payroll cycle
      await api.post("payroll-cycles", body);

      sonnerToast.success("Payroll cycle created successfully");
      
      // Invalidate the query for payroll cycles to refetch
      queryClient.invalidateQueries({ queryKey: ["payroll-cycles"] });
      
      setOpen(false);
      setMonth("");
      setPayday("");
      onSuccess();
    } catch (error: any) {
      sonnerToast.error(error.message || "Failed to create payroll cycle");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          New Payroll Cycle
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Payroll Cycle</DialogTitle>
            <DialogDescription>
              Create a new monthly payroll cycle for {employeeCount} employee{employeeCount !== 1 ? 's' : ''}
              {totalCompensation > 0 && ` - Estimated: ${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(totalCompensation)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="month">Month</Label>
              <Select value={month} onValueChange={setMonth} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i + 1} value={(i + 1).toString()}>
                      {new Date(2000, i).toLocaleString('default', { month: 'long' })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                min="2020"
                max="2100"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="payday">Payday</Label>
              <Input
                id="payday"
                type="date"
                value={payday}
                onChange={(e) => setPayday(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Expected payment date (defaults to last working day of the month)
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Cycle"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

