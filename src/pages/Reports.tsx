import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowLeft, FileText, Download } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

const Reports = () => {
  const navigate = useNavigate();
  const [selectedCycleId, setSelectedCycleId] = useState<string>("");

  // Fetch payroll cycles
  const { data: cyclesData, isLoading: cyclesLoading } = useQuery({
    queryKey: ["payroll-cycles"],
    queryFn: () => api.dashboard.cycles(),
  });

  const cycles = cyclesData?.cycles || [];

  const reportTypes = [
    {
      title: "Payroll Register",
      description: "Detailed payroll summary for a specific period",
      icon: FileText,
      key: "payroll-register",
    },
    {
      title: "PF Report",
      description: "Provident Fund contribution report",
      icon: FileText,
      key: "pf-report",
    },
    {
      title: "ESI Report",
      description: "Employee State Insurance contribution report",
      icon: FileText,
      key: "esi-report",
    },
    {
      title: "TDS Report",
      description: "Tax Deducted at Source summary",
      icon: FileText,
      key: "tds-report",
    },
  ];

  const handleGeneratePayrollRegister = async () => {
    if (!selectedCycleId) {
      toast.error("Please select a payroll cycle");
      return;
    }

    try {
      await api.reports.getPayrollRegister(selectedCycleId);
      toast.success("Report downloaded!");
    } catch (error: any) {
      toast.error(error.message || "Failed to download report");
    }
  };

  const formatCycleLabel = (cycle: { month: number; year: number }) => {
    const monthName = new Date(2000, cycle.month - 1).toLocaleString('en-IN', { month: 'long' });
    return `${monthName} ${cycle.year}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Reports & Analytics</h1>
            <p className="text-muted-foreground">Generate and download compliance reports</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Cycle Selector */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="space-y-2">
              <Label htmlFor="cycle-select">Select Payroll Cycle</Label>
              <Select
                value={selectedCycleId}
                onValueChange={setSelectedCycleId}
                disabled={cyclesLoading}
              >
                <SelectTrigger id="cycle-select">
                  <SelectValue placeholder={cyclesLoading ? "Loading cycles..." : "Select a payroll cycle"} />
                </SelectTrigger>
                <SelectContent>
                  {cycles.map((cycle: { id: string; month: number; year: number }) => (
                    <SelectItem key={cycle.id} value={cycle.id}>
                      {formatCycleLabel(cycle)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Report Cards */}
        <div className="grid gap-6 md:grid-cols-2">
          {reportTypes.map((report) => (
            <Card key={report.key} className="shadow-md hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <report.icon className="mr-2 h-5 w-5 text-primary" />
                  {report.title}
                </CardTitle>
                <CardDescription>{report.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  className="w-full" 
                  variant="outline"
                  onClick={() => {
                    if (report.key === "payroll-register") {
                      handleGeneratePayrollRegister();
                    } else {
                      // TODO: Implement other report generation
                      toast.info(`${report.title} generation will be implemented soon`);
                    }
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Generate Report
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
};

export default Reports;
