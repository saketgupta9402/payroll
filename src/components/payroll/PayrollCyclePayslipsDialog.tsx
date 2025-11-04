import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, Download, Receipt } from "lucide-react";

interface PayrollCyclePayslipsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleId: string;
  cycleMonth: number;
  cycleYear: number;
}

export const PayrollCyclePayslipsDialog = ({
  open,
  onOpenChange,
  cycleId,
  cycleMonth,
  cycleYear,
}: PayrollCyclePayslipsDialogProps) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["payroll-cycle-payslips", cycleId],
    queryFn: async () => {
      const res = await api.payroll.getCyclePayslips(cycleId);
      return res.payslips || [];
    },
    enabled: open && !!cycleId,
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleDownloadPayslip = async (payslipId: string, employeeCode: string) => {
    try {
      await api.payslips.downloadPDF(payslipId);
      toast.success("Payslip downloaded successfully");
    } catch (error: any) {
      console.error("Error downloading payslip:", error);
      toast.error(error.message || "Failed to download payslip");
    }
  };

  const getMonthName = (month: number) => {
    return new Date(2000, month - 1).toLocaleString("default", { month: "long" });
  };

  const payslips = data || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Receipt className="mr-2 h-5 w-5" />
            Payslips - {getMonthName(cycleMonth)} {cycleYear}
          </DialogTitle>
          <DialogDescription>
            View and download payslips for all employees in this payroll cycle
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">Loading payslips...</span>
          </div>
        ) : error ? (
          <div className="text-center py-12 text-destructive">
            Failed to load payslips. Please try again.
          </div>
        ) : payslips.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No payslips found for this payroll cycle
          </div>
        ) : (
          <>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead className="text-right">Gross Salary</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right">Net Salary</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payslips.map((payslip: any) => (
                    <TableRow key={payslip.id}>
                      <TableCell className="font-medium">
                        {payslip.full_name || "N/A"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {payslip.employee_code || "N/A"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(Number(payslip.gross_salary) || 0)}
                      </TableCell>
                      <TableCell className="text-right text-destructive">
                        {formatCurrency(Number(payslip.deductions) || 0)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-primary">
                        {formatCurrency(Number(payslip.net_salary) || 0)}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownloadPayslip(payslip.id, payslip.employee_code)}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Download
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-muted-foreground text-sm">Total Employees</p>
                    <p className="text-2xl font-bold">{payslips.length}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-sm">Total Gross</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(
                        payslips.reduce((sum: number, p: any) => sum + (Number(p.gross_salary) || 0), 0)
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-sm">Total Net Payable</p>
                    <p className="text-2xl font-bold text-primary">
                      {formatCurrency(
                        payslips.reduce((sum: number, p: any) => sum + (Number(p.net_salary) || 0), 0)
                      )}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

