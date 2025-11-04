import { useQuery } from "@tanstack/react-query";
// Import our new API client
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign } from "lucide-react";

// Define the type for a single compensation record
type Compensation = {
  id: string;
  effective_from: string;
  ctc: string;
  basic_salary: string;
  hra: string;
  special_allowance: string;
  da: string;
  lta: string;
  bonus: string;
  pf_contribution: string;
  esi_contribution: string;
  // ... add other fields if necessary
};

type CompensationResponse = {
  compensation: Compensation | null;
};

export const EmployeeSalaryStructure = () => {
  const { data: compensation, isLoading } = useQuery<Compensation | null>({
    queryKey: ["employee-compensation-me"],
    queryFn: async () => {
      const data = await api.me.compensation() as CompensationResponse;
      return data.compensation;
    },
  });

  if (isLoading) {
    return <Skeleton className="h-[400px] w-full" />;
  }

  if (!compensation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <DollarSign className="mr-2 h-5 w-5 text-primary" />
            My Salary Structure
          </CardTitle>
          <CardDescription>Your compensation details are not available yet</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <DollarSign className="mr-2 h-5 w-5 text-primary" />
          My Salary Structure
        </CardTitle>
        <CardDescription>
          Effective from {new Date(compensation.effective_from).toLocaleDateString("en-IN")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="bg-primary/10 p-4 rounded-lg">
            <p className="text-sm text-muted-foreground">Cost to Company (CTC)</p>
            <p className="text-3xl font-bold text-primary">{formatCurrency(Number(compensation.ctc))}</p>
          </div>

          <div className="mb-4">
            <h3 className="text-lg font-semibold">Monthly Salary</h3>
          </div>

          <div className="grid gap-3">
            <div className="flex justify-between items-center border-b pb-2">
              <span className="font-medium">Basic Salary</span>
              <span className="font-semibold">{formatCurrency(Number(compensation.basic_salary))}</span>
            </div>
            
            <div className="flex justify-between items-center border-b pb-2">
              <span className="font-medium">House Rent Allowance (HRA)</span>
              <span className="font-semibold">{formatCurrency(Number(compensation.hra))}</span>
            </div>

            {Number(compensation.da) > 0 && (
              <div className="flex justify-between items-center border-b pb-2">
                <span className="font-medium">Dearness Allowance (DA)</span>
                <span className="font-semibold">{formatCurrency(Number(compensation.da))}</span>
              </div>
            )}

            {Number(compensation.lta) > 0 && (
              <div className="flex justify-between items-center border-b pb-2">
                <span className="font-medium">Leave Travel Allowance (LTA)</span>
                <span className="font-semibold">{formatCurrency(Number(compensation.lta))}</span>
              </div>
            )}

            <div className="flex justify-between items-center border-b pb-2">
              <span className="font-medium">Special Allowance</span>
              <span className="font-semibold">{formatCurrency(Number(compensation.special_allowance))}</span>
            </div>

            {Number(compensation.bonus) > 0 && (
              <div className="flex justify-between items-center border-b pb-2">
                <span className="font-medium">Bonus</span>
                <span className="font-semibold">{formatCurrency(Number(compensation.bonus))}</span>
              </div>
            )}
          </div>

          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            <p className="text-sm font-semibold text-muted-foreground">Employer Contributions</p>
            <div className="flex justify-between items-center">
              <span className="text-sm">PF Contribution</span>
              <span className="text-sm font-medium">{formatCurrency(Number(compensation.pf_contribution))}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">ESI Contribution</span>
              <span className="text-sm font-medium">{formatCurrency(Number(compensation.esi_contribution))}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

