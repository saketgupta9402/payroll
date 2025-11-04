import { useState, useEffect } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
// Import our new API client
import { api } from "../../lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
// Import Loader2 for the loading state
import { DollarSign, Loader2 } from "lucide-react";

interface ManageCompensationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  joiningDate?: string;
  // tenantId is no longer needed, it's handled by the backend
}

export const ManageCompensationDialog = ({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  joiningDate,
}: ManageCompensationDialogProps) => {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  
  // Fetch existing compensation data when dialog opens
  const { data: existingCompensation, isLoading: isLoadingCompensation } = useQuery<{
    ctc?: number;
    basic_salary?: number;
    hra?: number;
    da?: number;
    lta?: number;
    special_allowance?: number;
    bonus?: number;
    pf_contribution?: number;
    esi_contribution?: number;
    effective_from?: string;
  } | null>({
    queryKey: ["employee-compensation", employeeId],
    queryFn: async () => {
      try {
        const result = await api.employees.getCompensation(employeeId) as { 
          compensation: {
            ctc?: number;
            basic_salary?: number;
            hra?: number;
            da?: number;
            lta?: number;
            special_allowance?: number;
            bonus?: number;
            pf_contribution?: number;
            esi_contribution?: number;
            effective_from?: string;
          } | null;
        };
        return result.compensation || null;
      } catch (error) {
        console.error("Error fetching compensation:", error);
        return null;
      }
    },
    enabled: open && !!employeeId,
  });

  const [formData, setFormData] = useState({
    ctc: "",
    basic_salary: "",
    hra: "",
    da: "0",
    lta: "0",
    special_allowance: "",
    bonus: "0",
    pf_contribution: "0",
    esi_contribution: "0",
    effective_from: (joiningDate ? new Date(joiningDate) : new Date()).toISOString().split('T')[0],
  });

  // Pre-populate form when existing compensation is loaded or dialog opens/closes
  useEffect(() => {
    if (open) {
      if (existingCompensation) {
        // Populate with existing data
        setFormData({
          ctc: existingCompensation.ctc?.toString() || "",
          basic_salary: existingCompensation.basic_salary?.toString() || "",
          hra: existingCompensation.hra?.toString() || "",
          da: existingCompensation.da?.toString() || "0",
          lta: existingCompensation.lta?.toString() || "0",
          special_allowance: existingCompensation.special_allowance?.toString() || "",
          bonus: existingCompensation.bonus?.toString() || "0",
          pf_contribution: existingCompensation.pf_contribution?.toString() || "0",
          esi_contribution: existingCompensation.esi_contribution?.toString() || "0",
          effective_from: existingCompensation.effective_from 
            ? new Date(existingCompensation.effective_from).toISOString().split('T')[0]
            : (joiningDate ? new Date(joiningDate) : new Date()).toISOString().split('T')[0],
        });
      } else if (!isLoadingCompensation) {
        // No existing compensation found, reset to defaults
        setFormData({
          ctc: "",
          basic_salary: "",
          hra: "",
          da: "0",
          lta: "0",
          special_allowance: "",
          bonus: "0",
          pf_contribution: "0",
          esi_contribution: "0",
          effective_from: (joiningDate ? new Date(joiningDate) : new Date()).toISOString().split('T')[0],
        });
      }
    }
  }, [existingCompensation, open, isLoadingCompensation, joiningDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // All form data fields are sent. The backend will handle them.
      const body = {
        ...formData,
        // Convert string fields to numbers where appropriate
        ctc: Number(formData.ctc),
        basic_salary: Number(formData.basic_salary),
        hra: Number(formData.hra),
        da: Number(formData.da),
        lta: Number(formData.lta),
        special_allowance: Number(formData.special_allowance),
        bonus: Number(formData.bonus),
        pf_contribution: Number(formData.pf_contribution),
        esi_contribution: Number(formData.esi_contribution),
      };

      // Call our new API endpoint using the proper method
      await api.employees.createCompensation(employeeId, body);

      toast.success("Compensation structure added successfully");
      
      // Invalidate the employees query to refresh the list (if needed)
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      
      // Invalidate the specific compensation query for this employee
      queryClient.invalidateQueries({ queryKey: ["employee-compensation", employeeId] });
      
      // Also invalidate the "me" compensation query in case the employee views their own
      queryClient.invalidateQueries({ queryKey: ["employee-compensation-me"] });

      onOpenChange(false);
      
      // Reset form
      setFormData({
        ctc: "",
        basic_salary: "",
        hra: "",
        da: "0",
        lta: "0",
        special_allowance: "",
        bonus: "0",
        pf_contribution: "0",
        esi_contribution: "0",
        effective_from: (joiningDate ? new Date(joiningDate) : new Date()).toISOString().split('T')[0],
      });

    } catch (error: unknown) {
      console.error("Error adding compensation:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to add compensation structure";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <DollarSign className="mr-2 h-5 w-5" />
            Manage Salary Structure - {employeeName}
          </DialogTitle>
          <DialogDescription>
            Add or update compensation details for this employee
          </DialogDescription>
        </DialogHeader>

        {isLoadingCompensation ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">Loading existing salary data...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="effective_from">Effective From *</Label>
              <Input
                id="effective_from"
                type="date"
                value={formData.effective_from}
                onChange={(e) => setFormData({ ...formData, effective_from: e.target.value })}
                required
              />
            </div>

            <div className="col-span-2">
              <Label htmlFor="ctc">Cost to Company (CTC) *</Label>
              <Input
                id="ctc"
                type="number"
                placeholder="Annual CTC"
                value={formData.ctc}
                onChange={(e) => setFormData({ ...formData, ctc: e.target.value })}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">Annual amount (12 months)</p>
            </div>

            <div>
              <Label htmlFor="basic_salary">Basic Salary *</Label>
              <Input
                id="basic_salary"
                type="number"
                placeholder="Monthly basic"
                value={formData.basic_salary}
                onChange={(e) => setFormData({ ...formData, basic_salary: e.target.value })}
                required
              />
                <p className="text-xs text-muted-foreground mt-1">Monthly amount</p>
              </div>

              <div>
                <Label htmlFor="hra">House Rent Allowance (HRA) *</Label>
                <Input
                  id="hra"
                  type="number"
                  placeholder="Monthly HRA"
                  value={formData.hra}
                  onChange={(e) => setFormData({ ...formData, hra: e.target.value })}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">Monthly amount</p>
              </div>

              <div>
                <Label htmlFor="da">Dearness Allowance (DA)</Label>
                <Input
                  id="da"
                  type="number"
                  placeholder="Monthly DA"
                  value={formData.da}
                  onChange={(e) => setFormData({ ...formData, da: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">Monthly amount</p>
              </div>

              <div>
                <Label htmlFor="lta">Leave Travel Allowance (LTA)</Label>
                <Input
                  id="lta"
                  type="number"
                  placeholder="Monthly LTA"
                  value={formData.lta}
                  onChange={(e) => setFormData({ ...formData, lta: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">Monthly amount</p>
              </div>

              <div>
                <Label htmlFor="special_allowance">Special Allowance *</Label>
                <Input
                  id="special_allowance"
                  type="number"
                  placeholder="Monthly special allowance"
                  value={formData.special_allowance}
                  onChange={(e) => setFormData({ ...formData, special_allowance: e.target.value })}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">Monthly amount</p>
              </div>

              <div>
                <Label htmlFor="bonus">Bonus</Label>
                <Input
                  id="bonus"
                  type="number"
                  placeholder="Monthly bonus"
                  value={formData.bonus}
                  onChange={(e) => setFormData({ ...formData, bonus: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">Monthly amount</p>
              </div>

              <div>
                <Label htmlFor="pf_contribution">PF Contribution (Employer)</Label>
                <Input
                  id="pf_contribution"
                  type="number"
                  placeholder="Monthly PF"
                  value={formData.pf_contribution}
                  onChange={(e) => setFormData({ ...formData, pf_contribution: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">Monthly amount</p>
              </div>

              <div>
                <Label htmlFor="esi_contribution">ESI Contribution (Employer)</Label>
                <Input
                  id="esi_contribution"
                  type="number"
                  placeholder="Monthly ESI"
                  value={formData.esi_contribution}
                  onChange={(e) => setFormData({ ...formData, esi_contribution: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">Monthly amount</p>
              </div>
            </div>

            <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Compensation"
              )}
            </Button>
          </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

