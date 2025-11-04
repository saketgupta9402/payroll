import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Play, Receipt } from "lucide-react";
import { PayrollReviewDialog } from "./PayrollReviewDialog";
import { PayrollCyclePayslipsDialog } from "./PayrollCyclePayslipsDialog";

interface PayrollCycle {
  id: string;
  month: number;
  year: number;
  status: string;
  total_employees: number;
  total_amount: number;
  created_at: string;
  approved_at?: string;
  payday?: string;
}

interface PayrollCycleListProps {
  cycles: PayrollCycle[];
  onRefresh?: () => void;
}

export const PayrollCycleList = ({ cycles, onRefresh }: PayrollCycleListProps) => {
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [payslipsDialogOpen, setPayslipsDialogOpen] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState<PayrollCycle | null>(null);

  const handleProcess = (cycle: PayrollCycle) => {
    setSelectedCycle(cycle);
    setReviewDialogOpen(true);
  };

  const handleViewPayslips = (cycle: PayrollCycle) => {
    setSelectedCycle(cycle);
    setPayslipsDialogOpen(true);
  };

  const handleProcessed = () => {
    if (onRefresh) {
      onRefresh();
    }
  };
  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft": return "secondary";
      case "processing": return "default";
      case "pending_approval": return "outline";
      case "approved": return "default";
      case "completed": return "default";
      case "paid": return "default";
      case "failed": return "destructive";
      default: return "secondary";
    }
  };

  const getMonthName = (month: number) => {
    return new Date(2000, month - 1).toLocaleString('default', { month: 'long' });
  };

  const getPayday = (cycle: PayrollCycle) => {
    // If payday is set in database, use it
    if (cycle.payday) {
      if (cycle.status === 'paid') {
        return <span className="text-green-600 font-medium">Paid on {new Date(cycle.payday).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>;
      }
      return new Date(cycle.payday).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    
    // Otherwise calculate default payday
    const lastDay = new Date(cycle.year, cycle.month, 0);
    const dayOfWeek = lastDay.getDay();
    
    if (dayOfWeek === 0) { // Sunday
      lastDay.setDate(lastDay.getDate() - 2);
    } else if (dayOfWeek === 6) { // Saturday
      lastDay.setDate(lastDay.getDate() - 1);
    }
    
    if (cycle.status === 'paid') {
      return <span className="text-green-600 font-medium">Paid</span>;
    } else if (cycle.status === 'approved' || cycle.status === 'processing' || cycle.status === 'completed') {
      return lastDay.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } else {
      return <span className="text-muted-foreground">-</span>;
    }
  };

  return (
    <>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Period</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Employees</TableHead>
          <TableHead className="text-right">Total Amount</TableHead>
          <TableHead>Payday</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cycles.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
              No payroll cycles found. Create your first payroll cycle to get started.
            </TableCell>
          </TableRow>
        ) : (
          cycles.map((cycle) => (
            <TableRow key={cycle.id}>
              <TableCell className="font-medium">
                {getMonthName(cycle.month)} {cycle.year}
              </TableCell>
              <TableCell>
                <Badge variant={getStatusColor(cycle.status)}>
                  {cycle.status.replace('_', ' ')}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-medium">
                {cycle.total_employees || 0}
              </TableCell>
              <TableCell className="text-right font-medium">
                ₹{(cycle.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </TableCell>
              <TableCell>
                {getPayday(cycle)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(cycle.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  {cycle.status === 'draft' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleProcess(cycle)}
                    >
                      <Play className="mr-2 h-4 w-4" />
                      Process
                    </Button>
                  )}
                  {(cycle.status === 'completed' || cycle.status === 'approved' || cycle.status === 'processing') && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleViewPayslips(cycle)}
                    >
                      <Receipt className="mr-2 h-4 w-4" />
                      View Payslips
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>

    {selectedCycle && (
      <>
        <PayrollReviewDialog
          open={reviewDialogOpen}
          onOpenChange={setReviewDialogOpen}
          cycleId={selectedCycle.id}
          cycleMonth={selectedCycle.month}
          cycleYear={selectedCycle.year}
          onProcessed={handleProcessed}
        />
        <PayrollCyclePayslipsDialog
          open={payslipsDialogOpen}
          onOpenChange={setPayslipsDialogOpen}
          cycleId={selectedCycle.id}
          cycleMonth={selectedCycle.month}
          cycleYear={selectedCycle.year}
        />
      </>
    )}
  </>
  );
};
