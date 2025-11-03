import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
// Import our new API client
import { api } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { DollarSign } from "lucide-react";
// Use aliased path for dialog component
import { ManageCompensationDialog } from "@/components/employees/ManageCompensationDialog";

interface EmployeeListProps {
  searchTerm: string;
  // tenantId is no longer needed
}

export const EmployeeList = ({ searchTerm }: EmployeeListProps) => {
  const [selectedEmployee, setSelectedEmployee] = useState<{ id: string; name: string } | null>(null);
  
  const { data: employees, isLoading } = useQuery({
    // Updated query key, tenantId is not needed
    queryKey: ["employees", searchTerm],
    queryFn: async () => {
      const response = await api.employees.list(searchTerm);
      return response.employees;
    },
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      active: "default",
      inactive: "secondary",
      on_leave: "outline",
      terminated: "destructive",
    };

    return (
      <Badge variant={variants[status] || "default"}>
        {status.replace("_", " ").toUpperCase()}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!employees || employees.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          {searchTerm ? "No employees found matching your search" : "No employees found"}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Designation</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joining Date</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((employee) => (
              <TableRow key={employee.id}>
                <TableCell className="font-medium">{employee.employee_code}</TableCell>
                <TableCell>{employee.full_name}</TableCell>
                <TableCell>{employee.email}</TableCell>
                <TableCell>{employee.department || "-"}</TableCell>
                <TableCell>{employee.designation || "-"}</TableCell>
                <TableCell>{getStatusBadge(employee.status)}</TableCell>
                <TableCell>
                  {new Date(employee.date_of_joining).toLocaleDateString("en-IN")}
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setSelectedEmployee({ id: employee.id, name: employee.full_name })
                    }
                  >
                    <DollarSign className="h-4 w-4 mr-1" />
                    Salary
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {selectedEmployee && (
        <ManageCompensationDialog
          open={!!selectedEmployee}
          onOpenChange={(open) => !open && setSelectedEmployee(null)}
          employeeId={selectedEmployee.id}
          employeeName={selectedEmployee.name}
          // tenantId is no longer passed
        />
      )}
    </>
  );
};

