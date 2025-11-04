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
import { Edit2, UserX } from "lucide-react";
// Use aliased path for dialog component
import { ManageCompensationDialog } from "@/components/employees/ManageCompensationDialog";

interface EmployeeListProps {
  searchTerm: string;
  // tenantId is no longer needed
}

interface Employee {
  id: string;
  employee_code: string;
  full_name: string;
  email: string;
  department?: string;
  designation?: string;
  status: string;
  date_of_joining: string;
  monthly_gross_salary?: number;
}

export const EmployeeList = ({ searchTerm }: EmployeeListProps) => {
  const [selectedEmployee, setSelectedEmployee] = useState<{ id: string; name: string; joiningDate?: string } | null>(null);
  
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
            {employees.map((employee: Employee) => (
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
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {employee.monthly_gross_salary !== undefined && employee.monthly_gross_salary !== null
                        ? new Intl.NumberFormat("en-IN", {
                            style: "currency",
                            currency: "INR",
                            maximumFractionDigits: 0,
                          }).format(Number(employee.monthly_gross_salary))
                        : "-"}
                    </span>
                    {employee.status === 'active' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          if (confirm(`Mark ${employee.full_name} as left?`)) {
                            try {
                              await api.employees.updateStatus(employee.id, 'terminated');
                              // refresh list
                              // We rely on query invalidation elsewhere, but just force a refetch via window event
                              // Better: use queryClient, but not imported here, so trigger reload
                              location.reload();
                            } catch (e) {
                              // no-op
                            }
                          }
                        }}
                        title="Mark as Left"
                      >
                        <UserX className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                    onClick={() =>
                      setSelectedEmployee({ id: employee.id, name: employee.full_name, joiningDate: employee.date_of_joining })
                    }
                      title="Edit Salary"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </div>
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
          joiningDate={selectedEmployee.joiningDate}
          // tenantId is no longer passed
        />
      )}
    </>
  );
};

