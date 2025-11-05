import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Plus, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { format } from "date-fns";

const getStatusColor = (status: string) => {
  switch (status) {
    case "approved":
      return "bg-green-500";
    case "rejected":
      return "bg-red-500";
    case "pending":
      return "bg-yellow-500";
    case "cancelled":
      return "bg-gray-500";
    default:
      return "bg-gray-500";
  }
};

const getLeaveTypeLabel = (type: string) => {
  switch (type) {
    case "sick":
      return "Sick Leave";
    case "casual":
      return "Casual Leave";
    case "earned":
      return "Earned Leave";
    case "loss_of_pay":
      return "Loss of Pay";
    case "other":
      return "Other";
    default:
      return type;
  }
};

export const LeaveRequestsTab = () => {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    leaveType: "",
    startDate: "",
    endDate: "",
    reason: "",
  });

  const { data: leaveRequests, isLoading } = useQuery({
    queryKey: ["my-leave-requests"],
    queryFn: async () => {
      const data = await api.leaves.getMyLeaves();
      return data.leaveRequests || [];
    },
  });

  const { data: leaveSummary } = useQuery({
    queryKey: ["my-leave-summary"],
    queryFn: async () => {
      const now = new Date();
      return await api.leaves.getMyLeaveSummary(now.getMonth() + 1, now.getFullYear());
    },
  });

  const createLeaveMutation = useMutation({
    mutationFn: (data: { leaveType: string; startDate: string; endDate: string; reason?: string }) =>
      api.leaves.createMyLeave(data),
    onSuccess: () => {
      toast.success("Leave request submitted successfully");
      queryClient.invalidateQueries({ queryKey: ["my-leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["my-leave-summary"] });
      setIsDialogOpen(false);
      setFormData({ leaveType: "", startDate: "", endDate: "", reason: "" });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to submit leave request");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.leaveType || !formData.startDate || !formData.endDate) {
      toast.error("Please fill all required fields");
      return;
    }
    createLeaveMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Leave Summary Cards */}
      {leaveSummary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Sick Leave
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{leaveSummary.sickLeaveDays} days</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Casual Leave
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{leaveSummary.casualLeaveDays} days</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Loss of Pay
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{leaveSummary.lopDays} days</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Paid Days
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {leaveSummary.paidDays} / {leaveSummary.totalWorkingDays}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Leave Requests */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">My Leave Requests</h3>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Request Leave
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Request Leave</DialogTitle>
                <DialogDescription>
                  Submit a leave request. Sick and casual leaves are paid, while loss of pay will deduct from your salary.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="leaveType">Leave Type *</Label>
                  <Select
                    value={formData.leaveType}
                    onValueChange={(value) => setFormData({ ...formData, leaveType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select leave type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sick">Sick Leave (Paid)</SelectItem>
                      <SelectItem value="casual">Casual Leave (Paid)</SelectItem>
                      <SelectItem value="earned">Earned Leave (Paid)</SelectItem>
                      <SelectItem value="loss_of_pay">Loss of Pay (Unpaid)</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="startDate">Start Date *</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endDate">End Date *</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reason">Reason</Label>
                  <Textarea
                    id="reason"
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    placeholder="Optional reason for leave"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createLeaveMutation.isPending}>
                  {createLeaveMutation.isPending ? "Submitting..." : "Submit Request"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {!leaveRequests || leaveRequests.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="mr-2 h-5 w-5 text-primary" />
              No Leave Requests
            </CardTitle>
            <CardDescription>
              You haven't submitted any leave requests yet. Click "Request Leave" to create one.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4">
          {leaveRequests.map((request: any) => (
            <Card key={request.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-primary" />
                      <h4 className="font-semibold text-lg">
                        {getLeaveTypeLabel(request.leave_type)}
                      </h4>
                      <Badge
                        className={`${getStatusColor(request.status)} text-white`}
                      >
                        {request.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Start Date</p>
                        <p className="font-semibold">
                          {format(new Date(request.start_date), "MMM dd, yyyy")}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">End Date</p>
                        <p className="font-semibold">
                          {format(new Date(request.end_date), "MMM dd, yyyy")}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Days</p>
                        <p className="font-semibold">{request.days} day(s)</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Status</p>
                        <p className="font-semibold capitalize">{request.status}</p>
                      </div>
                    </div>
                    {request.reason && (
                      <div className="mt-4">
                        <p className="text-sm text-muted-foreground">Reason</p>
                        <p className="text-sm">{request.reason}</p>
                      </div>
                    )}
                    {request.rejection_reason && (
                      <div className="mt-4 flex items-start gap-2 p-3 bg-destructive/10 rounded-md">
                        <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-destructive">Rejection Reason</p>
                          <p className="text-sm">{request.rejection_reason}</p>
                        </div>
                      </div>
                    )}
                    {request.approver_name && (
                      <div className="mt-4 text-sm text-muted-foreground">
                        {request.status === "approved"
                          ? `Approved by ${request.approver_name}`
                          : request.status === "rejected"
                          ? `Rejected by ${request.approver_name}`
                          : "Pending approval"}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

