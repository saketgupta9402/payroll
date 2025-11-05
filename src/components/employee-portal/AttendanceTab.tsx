import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar as CalendarIcon, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

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
      return "Other Leave";
    default:
      return type;
  }
};

const getLeaveTypeColor = (type: string) => {
  switch (type) {
    case "sick":
      return "bg-blue-500";
    case "casual":
      return "bg-purple-500";
    case "earned":
      return "bg-indigo-500";
    case "loss_of_pay":
      return "bg-red-500";
    case "other":
      return "bg-gray-500";
    default:
      return "bg-gray-500";
  }
};

const getAttendanceColor = (status: string, isLop: boolean) => {
  if (isLop) {
    return "bg-red-600";
  }
  switch (status) {
    case "present":
      return "bg-green-500";
    case "absent":
      return "bg-red-500";
    case "half_day":
      return "bg-yellow-500";
    case "holiday":
      return "bg-blue-400";
    case "weekend":
      return "bg-gray-300";
    default:
      return "bg-gray-400";
  }
};

export const AttendanceTab = () => {
  const now = new Date();
  const [selectedDate, setSelectedDate] = useState(now);
  const selectedMonth = selectedDate.getMonth() + 1;
  const selectedYear = selectedDate.getFullYear();

  // Fetch attendance records
  const { data: attendance, isLoading: attendanceLoading } = useQuery({
    queryKey: ["my-attendance", selectedMonth, selectedYear],
    queryFn: async () => {
      const data = await api.attendance.getMyAttendance({
        month: selectedMonth,
        year: selectedYear,
      });
      return data.attendanceRecords || [];
    },
  });

  // Fetch leave requests
  const { data: leaves, isLoading: leavesLoading } = useQuery({
    queryKey: ["my-leave-requests", selectedMonth, selectedYear],
    queryFn: async () => {
      const data = await api.leaves.getMyLeaves({
        month: selectedMonth,
        year: selectedYear,
      });
      return data.leaveRequests || [];
    },
  });

  const isLoading = attendanceLoading || leavesLoading;

  // Create a map of dates to their data
  const dateDataMap = useMemo(() => {
    const map = new Map<string, any>();
    
    // Add attendance records
    if (attendance) {
      attendance.forEach((record: any) => {
        const dateKey = format(parseISO(record.attendance_date), "yyyy-MM-dd");
        map.set(dateKey, {
          type: "attendance",
          data: record,
        });
      });
    }

    // Add leave requests (approved ones)
    if (leaves) {
      leaves
        .filter((leave: any) => leave.status === "approved" || leave.status === "pending")
        .forEach((leave: any) => {
          const startDate = parseISO(leave.start_date);
          const endDate = parseISO(leave.end_date);
          const daysInRange = eachDayOfInterval({ start: startDate, end: endDate });
          
          daysInRange.forEach((day) => {
            const dateKey = format(day, "yyyy-MM-dd");
            const existing = map.get(dateKey);
            if (!existing || existing.type === "leave") {
              map.set(dateKey, {
                type: "leave",
                data: leave,
                leaveType: leave.leave_type,
              });
            }
          });
        });
    }

    return map;
  }, [attendance, leaves]);

  // Calculate statistics
  const stats = useMemo(() => {
    if (!attendance && !leaves) {
      return { present: 0, absent: 0, halfDay: 0, lop: 0, leaves: 0 };
    }

    let present = 0;
    let absent = 0;
    let halfDay = 0;
    let lop = 0;
    let leavesCount = 0;

    if (attendance) {
      attendance.forEach((record: any) => {
        if (record.status === "present") present++;
        if (record.status === "absent" || record.is_lop) absent++;
        if (record.status === "half_day") halfDay++;
        if (record.is_lop) lop++;
      });
    }

    if (leaves) {
      leaves
        .filter((leave: any) => leave.status === "approved")
        .forEach((leave: any) => {
          leavesCount += Number(leave.days || 0);
          if (leave.leave_type === "loss_of_pay") {
            lop += Number(leave.days || 0);
          }
        });
    }

    return { present, absent, halfDay, lop, leaves: leavesCount };
  }, [attendance, leaves]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Present Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.present}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Absent Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.absent}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Half Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.halfDay}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Loss of Pay Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.lop}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Approved Leaves
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.leaves}</div>
          </CardContent>
        </Card>
      </div>

      {/* Calendar */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Attendance & Leave Calendar
          </CardTitle>
          <CardDescription>
            Click on any day to see details. Leaves are shown in colored backgrounds.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-6">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              month={selectedDate}
              onMonthChange={setSelectedDate}
              className="rounded-md border"
              modifiersClassNames={{
                today: "ring-2 ring-primary",
              }}
              classNames={{
                months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                month: "space-y-4",
                caption: "flex justify-center pt-1 relative items-center",
                caption_label: "text-sm font-medium",
                nav: "space-x-1 flex items-center",
                table: "w-full border-collapse space-y-1",
                head_row: "flex",
                head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
                row: "flex w-full mt-2",
                cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                day: cn(
                  "h-9 w-9 p-0 font-normal aria-selected:opacity-100 rounded-md flex items-center justify-center text-sm cursor-pointer transition-colors hover:bg-accent relative"
                ),
                day_outside: "text-muted-foreground opacity-50",
              }}
              modifiers={{
                hasLeave: (date) => {
                  const dateKey = format(date, "yyyy-MM-dd");
                  const dayData = dateDataMap.get(dateKey);
                  return dayData?.type === "leave";
                },
                hasAttendance: (date) => {
                  const dateKey = format(date, "yyyy-MM-dd");
                  const dayData = dateDataMap.get(dateKey);
                  return dayData?.type === "attendance";
                },
                weekend: (date) => {
                  const dayOfWeek = date.getDay();
                  return dayOfWeek === 0 || dayOfWeek === 6;
                },
              }}
              modifiersClassNames={{
                hasLeave: "bg-blue-400",
                hasAttendance: "bg-green-400",
                weekend: "bg-gray-100",
              }}
              components={{
                Day: ({ date, displayMonth }) => {
                  const dateKey = format(date, "yyyy-MM-dd");
                  const dayData = dateDataMap.get(dateKey);
                  const isToday = isSameDay(date, new Date());
                  const isCurrentMonth = date.getMonth() === selectedDate.getMonth();
                  const dayOfWeek = date.getDay();
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                  let bgColor = "";
                  if (dayData) {
                    if (dayData.type === "leave") {
                      bgColor = getLeaveTypeColor(dayData.leaveType);
                    } else if (dayData.type === "attendance") {
                      bgColor = getAttendanceColor(dayData.data.status, dayData.data.is_lop);
                    }
                  } else if (isWeekend) {
                    bgColor = "bg-gray-100";
                  }

                  return (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "h-9 w-9 rounded-md flex items-center justify-center text-sm font-medium cursor-pointer transition-colors relative",
                            isToday && "ring-2 ring-primary ring-offset-2",
                            !isCurrentMonth && "text-muted-foreground opacity-50",
                            bgColor && `${bgColor} text-white hover:opacity-80`,
                            !bgColor && !isWeekend && "hover:bg-accent"
                          )}
                        >
                          {date.getDate()}
                          {dayData && (
                            <div className="absolute bottom-0.5 left-1/2 transform -translate-x-1/2 w-1 h-1 rounded-full bg-white" />
                          )}
                        </button>
                      </PopoverTrigger>
                      {dayData && (
                        <PopoverContent className="w-80">
                          <div className="space-y-2">
                            <div className="font-semibold">
                              {format(date, "EEEE, MMMM dd, yyyy")}
                            </div>
                            {dayData.type === "leave" && (
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <Badge className={getLeaveTypeColor(dayData.leaveType)}>
                                    {getLeaveTypeLabel(dayData.leaveType)}
                                  </Badge>
                                  <Badge variant="outline">{dayData.data.status}</Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {dayData.data.reason || "No reason provided"}
                                </p>
                                {dayData.data.status === "approved" && dayData.leaveType !== "loss_of_pay" && (
                                  <p className="text-xs text-green-600">Paid leave - No salary deduction</p>
                                )}
                                {dayData.leaveType === "loss_of_pay" && (
                                  <p className="text-xs text-destructive">Unpaid leave - Salary will be deducted</p>
                                )}
                              </div>
                            )}
                            {dayData.type === "attendance" && (
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <Badge className={getAttendanceColor(dayData.data.status, dayData.data.is_lop)}>
                                    {dayData.data.status === "present" && "Present"}
                                    {dayData.data.status === "absent" && "Absent"}
                                    {dayData.data.status === "half_day" && "Half Day"}
                                    {dayData.data.status === "holiday" && "Holiday"}
                                    {dayData.data.status === "weekend" && "Weekend"}
                                    {dayData.data.is_lop && " - Loss of Pay"}
                                  </Badge>
                                </div>
                                {dayData.data.remarks && (
                                  <p className="text-sm text-muted-foreground">{dayData.data.remarks}</p>
                                )}
                                {dayData.data.is_lop && (
                                  <p className="text-xs text-destructive">This day will result in salary deduction</p>
                                )}
                              </div>
                            )}
                          </div>
                        </PopoverContent>
                      )}
                    </Popover>
                  );
                },
              }}
            />

            {/* Legend */}
            <div className="w-full max-w-md space-y-3">
              <h4 className="text-sm font-semibold">Legend</h4>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-green-500"></div>
                  <span>Present</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-red-500"></div>
                  <span>Absent / LOP</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-yellow-500"></div>
                  <span>Half Day</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-blue-500"></div>
                  <span>Sick Leave</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-purple-500"></div>
                  <span>Casual Leave</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-red-600"></div>
                  <span>Loss of Pay</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-gray-300"></div>
                  <span>Weekend</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-blue-400"></div>
                  <span>Holiday</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

