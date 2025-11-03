import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
// Import our new API client using a relative path
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { FileText, Plus } from "lucide-react";
import { toast } from "sonner";

// This component no longer needs props, as the backend
// identifies the user from their session cookie.
export const TaxDeclarationsTab = () => {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    financial_year: "2024-25",
    section80C: "",
    section80D: "",
    hra: "",
    homeLoanInterest: "",
    otherDeductions: "",
  });

  const { data: declarations, isLoading } = useQuery({
    // Simplified query key
    queryKey: ["my-tax-declarations"],
    queryFn: async () => {
      // Define the expected response shape from our new backend endpoint
      type DeclarationsResponse = {
        declarations: any[];
      };

      // Call the new API endpoint
      const data = await api.get<DeclarationsResponse>("tax-declarations");
      
      // The backend returns { declarations: [...] }, so we return data.declarations
      return data.declarations;
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // This is the JSON object we will store in the DB
      const declarationData = {
        section80C: Number(formData.section80C) || 0,
        section80D: Number(formData.section80D) || 0,
        hra: Number(formData.hra) || 0,
        homeLoanInterest: Number(formData.homeLoanInterest) || 0,
        otherDeductions: Number(formData.otherDeductions) || 0,
      };

      // This is the payload we send to the API
      const payload = {
        financial_year: formData.financial_year,
        declaration_data: declarationData,
      };
      
      // Call our new POST endpoint
      await api.post("tax-declarations", payload);

      toast.success("Tax declaration submitted successfully");
      // Invalidate the query to refetch the list
      queryClient.invalidateQueries({ queryKey: ["my-tax-declarations"] });
      setShowForm(false);
      // Reset the form
      setFormData({
        financial_year: "2024-25",
        section80C: "",
        section80D: "",
        hra: "",
        homeLoanInterest: "",
        otherDeductions: "",
      });
    } catch (error: any) {
      console.error("Error submitting declaration:", error);
      toast.error(error.message || "Failed to submit declaration");
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return <Skeleton className="h-[400px] w-full" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Tax Declarations</h3>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Declaration
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Submit Tax Declaration</CardTitle>
            <CardDescription>Enter your investment and deduction details</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="financial_year">Financial Year</Label>
                <Input
                  id="financial_year"
                  value={formData.financial_year}
                  onChange={(e) => setFormData({ ...formData, financial_year: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="section80C">Section 80C (LIC, PPF, EPF, etc.)</Label>
                  <Input
                    id="section80C"
                    type="number"
                    placeholder="Amount"
                    value={formData.section80C}
                    onChange={(e) => setFormData({ ...formData, section80C: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="section80D">Section 80D (Medical Insurance)</Label>
                  <Input
                    id="section80D"
                    type="number"
                    placeholder="Amount"
                    value={formData.section80D}
                    onChange={(e) => setFormData({ ...formData, section80D: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="hra">HRA Exemption</Label>
                  <Input
                    id="hra"
                    type="number"
                    placeholder="Amount"
                    value={formData.hra}
                    onChange={(e) => setFormData({ ...formData, hra: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="homeLoanInterest">Home Loan Interest (24b)</Label>
                  <Input
                    id="homeLoanInterest"
                    type="number"
                    placeholder="Amount"
                    value={formData.homeLoanInterest}
                    onChange={(e) => setFormData({ ...formData, homeLoanInterest: e.target.value })}
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="otherDeductions">Other Deductions</Label>
                  <Input
                    id="otherDeductions"
                    type="number"
                    placeholder="Amount"
                    value={formData.otherDeductions}
                    onChange={(e) => setFormData({ ...formData, otherDeductions: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={loading}>
                  {loading ? "Submitting..." : "Submit Declaration"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {declarations && declarations.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-medium">Previous Declarations</h4>
          {declarations.map((declaration: any) => (
            <Card key={declaration.id}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      <h5 className="font-semibold">FY {declaration.financial_year}</h5>
                      <Badge variant={declaration.status === "approved" ? "default" : "secondary"}>
                        {declaration.status.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {/* Use submitted_at, as the original component did */}
                      Submitted on {new Date(declaration.submitted_at).toLocaleDateString("en-IN")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!showForm && (!declarations || declarations.length === 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <FileText className="mr-2 h-5 w-5 text-primary" />
              No Declarations Yet
            </CardTitle>
            <CardDescription>Submit your tax-saving investment declarations here</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
};

