import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  // tenantId is no longer needed, it's handled by the backend
}

export const ManageCompensationDialog = ({
  open,
  onOpenChange,
  employeeId,
  employeeName,
}: ManageCompensationDialogProps) => {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
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
    effective_from: new Date().toISOString().split('T')[0],
  });

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

      // Call our new API endpoint
      await api.post(
        `employees/${employeeId}/compensation`,
        body
      );

      toast.success("Compensation structure added successfully");
      
      // Invalidate the employees query to refresh the list (if needed)
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      
      // Also invalidate the specific compensation query for this employee
      queryClient.invalidateQueries({ queryKey: ["employee-compensation", employeeId] });

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
        effective_from: new Date().toISOString().split('T')[0],
      });

    } catch (error: any) {
      console.error("Error adding compensation:", error);
      toast.error(error.message || "Failed to add compensation structure");
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
            </div>

            <div>
              <Label htmlFor="lta">Leave Travel Allowance (LTA)</Label>
              <Input
                id="lta"
                type="number"
                placeholder="Annual LTA"
                value={formData.lta}
                onChange={(e) => setFormData({ ...formData, lta: e.target.value })}
              />
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
            </div>

            <div>
              <Label htmlFor="bonus">Bonus</Label>
              <Input
                id="bonus"
                type="number"
                placeholder="Annual bonus"
                value={formData.bonus}
                onChange={(e) => setFormData({ ...formData, bonus: e.target.value })}
              />
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
      </DialogContent>
    </Dialog>
  );
};

