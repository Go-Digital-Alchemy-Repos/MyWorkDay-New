import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { 
  Users, 
  AlertTriangle, 
  Calendar, 
  Clock,
  CheckCircle2,
  Circle,
  Loader2,
  ChevronRight,
  Flag,
  FolderKanban,
  User,
  ListTodo
} from "lucide-react";
import { TaskDetailDrawer } from "@/components/task-detail-drawer";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";
import { format } from "date-fns";
import type { TaskWithRelations, User as UserType } from "@shared/schema";

interface EmployeeWorkload {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  avatarUrl: string | null;
  totalTasks: number;
  openTasks: number;
  completedTasks: number;
  overdueTasks: number;
  dueTodayTasks: number;
  next7DaysTasks: number;
  highPriorityTasks: number;
  completionRate: number;
}

interface WorkloadSummary {
  totalEmployees: number;
  totalProjects: number;
  totalOpenTasks: number;
  totalCompletedTasks: number;
  totalOverdueTasks: number;
  avgTasksPerEmployee: number;
}

interface StatusSummary {
  summary: { status: string; count: number }[];
  total: number;
}

interface PrioritySummary {
  summary: { priority: string; count: number }[];
  total: number;
}

interface EmployeeTasksResponse {
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    avatarUrl: string | null;
  };
  tasks: (TaskWithRelations & { projectName: string | null })[];
  totalCount: number;
}

interface UnassignedTasksResponse {
  tasks: (TaskWithRelations & { projectName: string; projectId: string })[];
  totalCount: number;
}

const STATUS_COLORS: Record<string, string> = {
  todo: "#6B7280",
  in_progress: "#3B82F6",
  blocked: "#EF4444",
  done: "#10B981",
};

const PRIORITY_COLORS: Record<string, string> = {
  none: "#9CA3AF",
  low: "#10B981",
  medium: "#F59E0B",
  high: "#EF4444",
  urgent: "#7C3AED",
};

const STATUS_LABELS: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
};

const PRIORITY_LABELS: Record<string, string> = {
  none: "No Priority",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export function WorkloadTab() {
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeWorkload | null>(null);
  const [employeeDrawerOpen, setEmployeeDrawerOpen] = useState(false);
  const [taskFilter, setTaskFilter] = useState<string>("open");
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);

  const { data: workloadData, isLoading: workloadLoading } = useQuery<EmployeeWorkload[]>({
    queryKey: ["/api/v1/workload/tasks-by-employee"],
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<WorkloadSummary>({
    queryKey: ["/api/v1/workload/summary"],
  });

  const { data: statusSummary } = useQuery<StatusSummary>({
    queryKey: ["/api/v1/workload/by-status"],
  });

  const { data: prioritySummary } = useQuery<PrioritySummary>({
    queryKey: ["/api/v1/workload/by-priority"],
  });

  const { data: unassignedData } = useQuery<UnassignedTasksResponse>({
    queryKey: ["/api/v1/workload/unassigned"],
  });

  const { data: employeeTasks, isLoading: employeeTasksLoading } = useQuery<EmployeeTasksResponse>({
    queryKey: ["/api/v1/workload/employee", selectedEmployee?.userId, "tasks", taskFilter],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/workload/employee/${selectedEmployee?.userId}/tasks?filter=${taskFilter}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch employee tasks");
      return res.json();
    },
    enabled: !!selectedEmployee && employeeDrawerOpen,
  });

  const getInitials = (firstName: string | null, lastName: string | null, email: string) => {
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    }
    return email.slice(0, 2).toUpperCase();
  };

  const getName = (employee: { firstName: string | null; lastName: string | null; email: string }) => {
    if (employee.firstName && employee.lastName) {
      return `${employee.firstName} ${employee.lastName}`;
    }
    return employee.email;
  };

  const handleEmployeeClick = (employee: EmployeeWorkload) => {
    setSelectedEmployee(employee);
    setTaskFilter("open");
    setEmployeeDrawerOpen(true);
  };

  const handleTaskClick = (task: TaskWithRelations) => {
    setSelectedTask(task);
    setTaskDrawerOpen(true);
  };

  if (workloadLoading || summaryLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const statusChartData = statusSummary?.summary.map(s => ({
    name: STATUS_LABELS[s.status] || s.status,
    value: s.count,
    fill: STATUS_COLORS[s.status] || "#6B7280",
  })) || [];

  const priorityChartData = prioritySummary?.summary
    .filter(p => p.count > 0)
    .map(p => ({
      name: PRIORITY_LABELS[p.priority] || p.priority,
      value: p.count,
      fill: PRIORITY_COLORS[p.priority] || "#6B7280",
    })) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Workload Overview</h3>
          <p className="text-sm text-muted-foreground">
            Monitor task distribution and workload across your team
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Total Open</CardTitle>
            <ListTodo className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalOpenTasks || 0}</div>
            <p className="text-xs text-muted-foreground">
              across {summary?.totalProjects || 0} projects
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{summary?.totalOverdueTasks || 0}</div>
            <p className="text-xs text-muted-foreground">
              require immediate attention
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Unassigned</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{unassignedData?.totalCount || 0}</div>
            <p className="text-xs text-muted-foreground">
              need assignment
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Team Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalEmployees || 0}</div>
            <p className="text-xs text-muted-foreground">
              avg {summary?.avgTasksPerEmployee || 0} tasks each
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tasks by Status</CardTitle>
            <CardDescription>Distribution of all tasks</CardDescription>
          </CardHeader>
          <CardContent>
            {statusChartData.length > 0 ? (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {statusChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                No task data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Open Tasks by Priority</CardTitle>
            <CardDescription>Priority distribution of open tasks</CardDescription>
          </CardHeader>
          <CardContent>
            {priorityChartData.length > 0 ? (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={priorityChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={80} className="text-xs" />
                    <Tooltip />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {priorityChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                No priority data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tasks by Employee</CardTitle>
          <CardDescription>Click on an employee to view their tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                    Overdue
                  </div>
                </TableHead>
                <TableHead className="text-center">Today</TableHead>
                <TableHead className="text-center">Next 7 Days</TableHead>
                <TableHead className="text-center">Total Open</TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workloadData && workloadData.length > 0 ? (
                workloadData.map((employee) => (
                  <TableRow 
                    key={employee.userId} 
                    className="cursor-pointer hover-elevate"
                    onClick={() => handleEmployeeClick(employee)}
                    data-testid={`row-employee-${employee.userId}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={employee.avatarUrl || undefined} />
                          <AvatarFallback>{getInitials(employee.firstName, employee.lastName, employee.email)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{getName(employee)}</div>
                          <div className="text-xs text-muted-foreground">{employee.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {employee.overdueTasks > 0 ? (
                        <Badge variant="destructive">{employee.overdueTasks}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {employee.dueTodayTasks > 0 ? (
                        <Badge variant="secondary">{employee.dueTodayTasks}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {employee.next7DaysTasks > 0 ? (
                        <Badge variant="outline">{employee.next7DaysTasks}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{employee.openTasks}</Badge>
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No employee workload data available
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {unassignedData && unassignedData.totalCount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Unassigned Tasks Queue
            </CardTitle>
            <CardDescription>
              {unassignedData.totalCount} tasks need to be assigned
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {unassignedData.tasks.slice(0, 10).map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer"
                  onClick={() => handleTaskClick(task)}
                  data-testid={`row-unassigned-task-${task.id}`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{task.title}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <FolderKanban className="h-3 w-3" />
                        {task.projectName}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {task.dueDate && (
                      <Badge variant={new Date(task.dueDate) < new Date() ? "destructive" : "outline"} className="text-xs">
                        <Calendar className="h-3 w-3 mr-1" />
                        {format(new Date(task.dueDate), "MMM d")}
                      </Badge>
                    )}
                    {task.priority && task.priority !== "none" && (
                      <PriorityBadge priority={task.priority as "low" | "medium" | "high" | "urgent"} />
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              ))}
              {unassignedData.totalCount > 10 && (
                <div className="text-center text-sm text-muted-foreground py-2">
                  +{unassignedData.totalCount - 10} more unassigned tasks
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Sheet open={employeeDrawerOpen} onOpenChange={setEmployeeDrawerOpen}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-3">
              {selectedEmployee && (
                <>
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={selectedEmployee.avatarUrl || undefined} />
                    <AvatarFallback>
                      {getInitials(selectedEmployee.firstName, selectedEmployee.lastName, selectedEmployee.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div>{getName(selectedEmployee)}</div>
                    <div className="text-sm font-normal text-muted-foreground">{selectedEmployee.email}</div>
                  </div>
                </>
              )}
            </SheetTitle>
            <SheetDescription>
              View and manage tasks assigned to this team member
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-4 gap-2">
              <div className="text-center p-2 rounded-lg bg-destructive/10">
                <div className="text-lg font-bold text-destructive">{selectedEmployee?.overdueTasks || 0}</div>
                <div className="text-xs text-muted-foreground">Overdue</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-orange-500/10">
                <div className="text-lg font-bold text-orange-500">{selectedEmployee?.dueTodayTasks || 0}</div>
                <div className="text-xs text-muted-foreground">Today</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-blue-500/10">
                <div className="text-lg font-bold text-blue-500">{selectedEmployee?.next7DaysTasks || 0}</div>
                <div className="text-xs text-muted-foreground">Next 7d</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted">
                <div className="text-lg font-bold">{selectedEmployee?.openTasks || 0}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Filter:</span>
              <Select value={taskFilter} onValueChange={setTaskFilter}>
                <SelectTrigger className="w-40" data-testid="select-task-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">All Open</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="today">Due Today</SelectItem>
                  <SelectItem value="next7days">Next 7 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <ScrollArea className="h-[calc(100vh-350px)]">
              {employeeTasksLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : employeeTasks?.tasks && employeeTasks.tasks.length > 0 ? (
                <div className="space-y-2 pr-4">
                  {employeeTasks.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-3 rounded-lg border hover-elevate cursor-pointer"
                      onClick={() => handleTaskClick(task)}
                      data-testid={`row-employee-task-${task.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{task.title}</div>
                          {task.projectName && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <FolderKanban className="h-3 w-3" />
                              {task.projectName}
                            </div>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
                      </div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <StatusBadge status={(task.status || "todo") as "todo" | "in_progress" | "blocked" | "done"} />
                        {task.priority && task.priority !== "none" && (
                          <PriorityBadge priority={task.priority as "low" | "medium" | "high" | "urgent"} />
                        )}
                        {task.dueDate && (
                          <Badge 
                            variant={new Date(task.dueDate) < new Date() ? "destructive" : "outline"} 
                            className="text-xs"
                          >
                            <Calendar className="h-3 w-3 mr-1" />
                            {format(new Date(task.dueDate), "MMM d, yyyy")}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No tasks found for this filter
                </div>
              )}
            </ScrollArea>
          </div>
        </SheetContent>
      </Sheet>

      <TaskDetailDrawer
        task={selectedTask}
        open={taskDrawerOpen}
        onOpenChange={setTaskDrawerOpen}
      />
    </div>
  );
}
