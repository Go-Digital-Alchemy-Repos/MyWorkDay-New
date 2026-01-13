import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from "recharts";
import { Download, Clock, FolderKanban, CheckSquare, TrendingUp, Users, Building2, User, UserCheck, AlertTriangle, CalendarCheck, Flag } from "lucide-react";
import type { Project, TimeEntry, User as UserType, Team, WorkspaceMember } from "@shared/schema";

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16"];

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

function WorkloadContent() {
  const { data: workloadData, isLoading: workloadLoading } = useQuery<EmployeeWorkload[]>({
    queryKey: ["/api/v1/workload/tasks-by-employee"],
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<WorkloadSummary>({
    queryKey: ["/api/v1/workload/summary"],
  });

  const handleExportWorkloadCSV = () => {
    if (!workloadData) return;
    
    const headers = ["Employee", "Email", "Open Tasks", "Completed Tasks", "Overdue", "Due Today", "High Priority", "Completion Rate"];
    const rows = workloadData.map((w) => [
      w.firstName && w.lastName ? `${w.firstName} ${w.lastName}` : w.email,
      w.email,
      w.openTasks.toString(),
      w.completedTasks.toString(),
      w.overdueTasks.toString(),
      w.dueTodayTasks.toString(),
      w.highPriorityTasks.toString(),
      `${w.completionRate}%`,
    ]);
    
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workload-report-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const getInitials = (firstName: string | null, lastName: string | null, email: string) => {
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    }
    return email.slice(0, 2).toUpperCase();
  };

  const getName = (w: EmployeeWorkload) => {
    if (w.firstName && w.lastName) {
      return `${w.firstName} ${w.lastName}`;
    }
    return w.email;
  };

  if (workloadLoading || summaryLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="pt-4">
                <div className="h-16 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Task Workload by Employee</h3>
          <p className="text-sm text-muted-foreground">
            View task distribution and workload across your team
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportWorkloadCSV} data-testid="button-export-workload-csv">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Open Tasks</CardTitle>
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
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
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{summary?.totalCompletedTasks || 0}</div>
            <p className="text-xs text-muted-foreground">
              total completed tasks
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
              require attention
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Avg per Employee</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.avgTasksPerEmployee || 0}</div>
            <p className="text-xs text-muted-foreground">
              tasks per team member
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Employee Workload Overview</CardTitle>
          <CardDescription>Tasks assigned to each team member</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-center">Open</TableHead>
                <TableHead className="text-center">Completed</TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                    Overdue
                  </div>
                </TableHead>
                <TableHead className="text-center">Due Today</TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Flag className="h-3.5 w-3.5" />
                    Priority
                  </div>
                </TableHead>
                <TableHead className="text-center">Completion Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workloadData && workloadData.length > 0 ? (
                workloadData.map((employee) => (
                  <TableRow key={employee.userId}>
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
                      <Badge variant="outline">{employee.openTasks}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-green-600 font-medium">{employee.completedTasks}</span>
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
                      {employee.highPriorityTasks > 0 ? (
                        <Badge className="bg-orange-500 hover:bg-orange-600">{employee.highPriorityTasks}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary rounded-full" 
                            style={{ width: `${employee.completionRate}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium">{employee.completionRate}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No employee workload data available
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {workloadData && workloadData.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Open Tasks Distribution</CardTitle>
              <CardDescription>Tasks by employee</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={workloadData.slice(0, 8).map((w) => ({
                      name: w.firstName || w.email.split("@")[0],
                      openTasks: w.openTasks,
                      overdue: w.overdueTasks,
                    }))}
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" />
                    <YAxis dataKey="name" type="category" className="text-xs" width={80} />
                    <Tooltip />
                    <Bar dataKey="openTasks" name="Open Tasks" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="overdue" name="Overdue" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Completion Rates</CardTitle>
              <CardDescription>Task completion by employee</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={workloadData.filter((w) => w.totalTasks > 0).slice(0, 8).map((w) => ({
                        name: w.firstName || w.email.split("@")[0],
                        value: w.completionRate,
                      }))}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {workloadData.slice(0, 8).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

interface TimeEntryWithRelations extends TimeEntry {
  user?: UserType;
  project?: Project;
}

export function ReportsTab() {
  const [dateRange, setDateRange] = useState("this-month");
  const [groupBy, setGroupBy] = useState("week");
  const [reportView, setReportView] = useState<"organization" | "employee" | "team">("organization");

  const { data: timeEntries } = useQuery<TimeEntryWithRelations[]>({
    queryKey: ["/api/time-entries"],
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: teams } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const { data: workspaceMembers } = useQuery<(WorkspaceMember & { user?: UserType })[]>({
    queryKey: ["/api/workspace-members"],
  });

  const { data: timeSummary } = useQuery<any>({
    queryKey: ["/api/time-entries/summary", { groupBy }],
  });

  const totalHours = timeEntries?.reduce((acc, entry) => acc + (entry.duration || 0), 0) || 0;
  const totalMinutes = Math.round(totalHours / 60);
  const displayHours = Math.floor(totalMinutes / 60);
  const displayMinutes = totalMinutes % 60;

  const projectHours = projects?.map((project) => {
    const projectEntries = timeEntries?.filter((e) => e.projectId === project.id) || [];
    const hours = projectEntries.reduce((acc, e) => acc + (e.duration || 0), 0) / 3600;
    return {
      name: project.name.slice(0, 15),
      hours: Math.round(hours * 10) / 10,
      color: project.color || COLORS[0],
    };
  }).filter((p) => p.hours > 0) || [];

  const employeeHours = workspaceMembers?.map((member) => {
    const user = member.user;
    if (!user) return null;
    const userEntries = timeEntries?.filter((e) => e.userId === user.id) || [];
    const hours = userEntries.reduce((acc, e) => acc + (e.duration || 0), 0) / 3600;
    return {
      id: user.id,
      name: user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`
        : user.name || user.email,
      email: user.email,
      hours: Math.round(hours * 10) / 10,
      entries: userEntries.length,
      avatarUrl: user.avatarUrl,
    };
  }).filter(Boolean) || [];

  const teamHours = teams?.map((team) => {
    const teamEntries = timeEntries?.filter((e) => {
      const project = projects?.find((p) => p.id === e.projectId);
      return project?.teamId === team.id;
    }) || [];
    const hours = teamEntries.reduce((acc, e) => acc + (e.duration || 0), 0) / 3600;
    return {
      id: team.id,
      name: team.name,
      hours: Math.round(hours * 10) / 10,
      entries: teamEntries.length,
      projectCount: projects?.filter((p) => p.teamId === team.id).length || 0,
    };
  }) || [];

  const weeklyData = [
    { name: "Mon", hours: 6.5 },
    { name: "Tue", hours: 8.2 },
    { name: "Wed", hours: 7.8 },
    { name: "Thu", hours: 5.4 },
    { name: "Fri", hours: 7.1 },
    { name: "Sat", hours: 0 },
    { name: "Sun", hours: 0 },
  ];

  const handleExportCSV = (type: "time" | "employee" | "team" | "project") => {
    let csv = "";
    let filename = "";

    if (type === "time") {
      const headers = ["Date", "Employee", "Project", "Description", "Duration (hours)"];
      const rows = timeEntries?.map((entry) => [
        entry.date ? new Date(entry.date).toLocaleDateString() : "",
        entry.user ? (entry.user.firstName && entry.user.lastName 
          ? `${entry.user.firstName} ${entry.user.lastName}` 
          : entry.user.name || entry.user.email) : "",
        projects?.find((p) => p.id === entry.projectId)?.name || "",
        entry.description || "",
        ((entry.duration || 0) / 3600).toFixed(2),
      ]) || [];
      csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      filename = `time-entries-${new Date().toISOString().split("T")[0]}.csv`;
    } else if (type === "employee") {
      const headers = ["Employee", "Email", "Hours Logged", "Time Entries"];
      const rows = employeeHours.map((e: any) => [
        e.name,
        e.email,
        e.hours.toFixed(2),
        e.entries.toString(),
      ]);
      csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      filename = `employee-hours-${new Date().toISOString().split("T")[0]}.csv`;
    } else if (type === "team") {
      const headers = ["Team", "Hours Logged", "Time Entries", "Projects"];
      const rows = teamHours.map((t) => [
        t.name,
        t.hours.toFixed(2),
        t.entries.toString(),
        t.projectCount.toString(),
      ]);
      csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      filename = `team-hours-${new Date().toISOString().split("T")[0]}.csv`;
    } else if (type === "project") {
      const headers = ["Project", "Status", "Hours Logged", "Team"];
      const rows = projects?.map((project) => {
        const hours = projectHours.find((p) => p.name.startsWith(project.name.slice(0, 15)))?.hours || 0;
        const team = teams?.find((t) => t.id === project.teamId);
        return [
          project.name,
          project.status || "active",
          hours.toString(),
          team?.name || "-",
        ];
      }) || [];
      csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      filename = `project-report-${new Date().toISOString().split("T")[0]}.csv`;
    }

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-[180px]" data-testid="select-date-range">
            <SelectValue placeholder="Select range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this-week">This Week</SelectItem>
            <SelectItem value="last-week">Last Week</SelectItem>
            <SelectItem value="this-month">This Month</SelectItem>
            <SelectItem value="last-month">Last Month</SelectItem>
            <SelectItem value="this-year">This Year</SelectItem>
          </SelectContent>
        </Select>

        <Select value={groupBy} onValueChange={setGroupBy}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Group by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Day</SelectItem>
            <SelectItem value="week">Week</SelectItem>
            <SelectItem value="month">Month</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{displayHours}h {displayMinutes}m</div>
            <p className="text-xs text-muted-foreground">
              {timeEntries?.length || 0} time entries
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {projects?.filter((p) => p.status === "active").length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              of {projects?.length || 0} total projects
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Team Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {employeeHours.filter((e: any) => e.hours > 0).length}
            </div>
            <p className="text-xs text-muted-foreground">
              with time tracked
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Active Teams</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{teamHours.filter((t) => t.hours > 0).length}</div>
            <p className="text-xs text-muted-foreground">
              of {teams?.length || 0} total teams
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="time-tracking" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="time-tracking">Time Tracking</TabsTrigger>
          <TabsTrigger value="workload">Workload</TabsTrigger>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
        </TabsList>

        <TabsContent value="time-tracking" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button 
                variant={reportView === "organization" ? "default" : "outline"} 
                size="sm"
                onClick={() => setReportView("organization")}
                data-testid="button-view-organization"
              >
                <Building2 className="h-4 w-4 mr-2" />
                Organization
              </Button>
              <Button 
                variant={reportView === "employee" ? "default" : "outline"} 
                size="sm"
                onClick={() => setReportView("employee")}
                data-testid="button-view-employee"
              >
                <User className="h-4 w-4 mr-2" />
                By Employee
              </Button>
              <Button 
                variant={reportView === "team" ? "default" : "outline"} 
                size="sm"
                onClick={() => setReportView("team")}
                data-testid="button-view-team"
              >
                <Users className="h-4 w-4 mr-2" />
                By Team
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={() => handleExportCSV("time")} data-testid="button-export-time-csv">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Hours Trend</CardTitle>
                <CardDescription>Daily hours over the selected period</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weeklyData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="hours"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ fill: "hsl(var(--primary))" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Hours by {reportView === "organization" ? "Project" : reportView === "employee" ? "Employee" : "Team"}
                </CardTitle>
                <CardDescription>Distribution breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      data={
                        reportView === "organization" 
                          ? projectHours.slice(0, 6)
                          : reportView === "employee"
                          ? employeeHours.slice(0, 6).map((e: any) => ({ name: e.name.split(" ")[0], hours: e.hours }))
                          : teamHours.slice(0, 6).map((t) => ({ name: t.name, hours: t.hours }))
                      }
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip />
                      <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="workload" className="space-y-4">
          <WorkloadContent />
        </TabsContent>

        <TabsContent value="employees" className="space-y-4">
          <div className="flex items-center justify-end">
            <Button variant="outline" size="sm" onClick={() => handleExportCSV("employee")} data-testid="button-export-employee-csv">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Employee Time Summary</CardTitle>
                <CardDescription>Hours logged by each team member</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Hours Logged</TableHead>
                      <TableHead>Time Entries</TableHead>
                      <TableHead>Avg per Entry</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employeeHours
                      .sort((a: any, b: any) => b.hours - a.hours)
                      .map((employee: any) => (
                        <TableRow key={employee.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={employee.avatarUrl || undefined} />
                                <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-medium">{employee.name}</div>
                                <div className="text-xs text-muted-foreground">{employee.email}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">{employee.hours}h</span>
                          </TableCell>
                          <TableCell>{employee.entries}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {employee.entries > 0 
                              ? `${(employee.hours / employee.entries).toFixed(1)}h`
                              : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    {employeeHours.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          No time entries found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Hours Distribution</CardTitle>
                <CardDescription>By employee</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={employeeHours.filter((e: any) => e.hours > 0).slice(0, 8)}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name.split(" ")[0]} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="hours"
                      >
                        {employeeHours.slice(0, 8).map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Contributors</CardTitle>
                <CardDescription>Most active this period</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {employeeHours
                    .sort((a: any, b: any) => b.hours - a.hours)
                    .slice(0, 5)
                    .map((employee: any, index: number) => (
                      <div key={employee.id} className="flex items-center gap-3">
                        <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-xs font-medium">
                          {index + 1}
                        </div>
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={employee.avatarUrl || undefined} />
                          <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{employee.name}</div>
                          <div className="text-xs text-muted-foreground">{employee.entries} entries</div>
                        </div>
                        <div className="font-medium">{employee.hours}h</div>
                      </div>
                    ))}
                  {employeeHours.length === 0 && (
                    <div className="text-center text-muted-foreground py-4">
                      No data available
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="teams" className="space-y-4">
          <div className="flex items-center justify-end">
            <Button variant="outline" size="sm" onClick={() => handleExportCSV("team")} data-testid="button-export-team-csv">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Team Time Summary</CardTitle>
                <CardDescription>Hours logged by each team</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Team</TableHead>
                      <TableHead>Hours Logged</TableHead>
                      <TableHead>Time Entries</TableHead>
                      <TableHead>Projects</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamHours
                      .sort((a, b) => b.hours - a.hours)
                      .map((team) => (
                        <TableRow key={team.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                <Users className="h-4 w-4 text-primary" />
                              </div>
                              <span className="font-medium">{team.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">{team.hours}h</span>
                          </TableCell>
                          <TableCell>{team.entries}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{team.projectCount} projects</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    {teamHours.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          No teams found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Team Hours Distribution</CardTitle>
                <CardDescription>Comparison across teams</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={teamHours} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" className="text-xs" />
                      <YAxis dataKey="name" type="category" className="text-xs" width={80} />
                      <Tooltip />
                      <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Team Productivity</CardTitle>
                <CardDescription>Hours per project</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {teamHours
                    .filter((t) => t.projectCount > 0)
                    .sort((a, b) => (b.hours / b.projectCount) - (a.hours / a.projectCount))
                    .slice(0, 5)
                    .map((team) => (
                      <div key={team.id} className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Users className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{team.name}</div>
                          <div className="text-xs text-muted-foreground">{team.projectCount} projects</div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{(team.hours / team.projectCount).toFixed(1)}h</div>
                          <div className="text-xs text-muted-foreground">avg/project</div>
                        </div>
                      </div>
                    ))}
                  {teamHours.filter((t) => t.projectCount > 0).length === 0 && (
                    <div className="text-center text-muted-foreground py-4">
                      No team data available
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="projects" className="space-y-4">
          <div className="flex items-center justify-end">
            <Button variant="outline" size="sm" onClick={() => handleExportCSV("project")} data-testid="button-export-project-csv">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Project Summary</CardTitle>
              <CardDescription>Overview of all projects</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Hours Logged</TableHead>
                    <TableHead>Team</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects?.slice(0, 10).map((project) => {
                    const hours = projectHours.find((p) => p.name.startsWith(project.name.slice(0, 15)))?.hours || 0;
                    const team = teams?.find((t) => t.id === project.teamId);
                    return (
                      <TableRow key={project.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div
                              className="h-3 w-3 rounded-sm"
                              style={{ backgroundColor: project.color || COLORS[0] }}
                            />
                            <span className="font-medium">{project.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={project.status === "active" ? "default" : "secondary"}>
                            {project.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{hours}h</TableCell>
                        <TableCell className="text-muted-foreground">
                          {team?.name || "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Hours by Project</CardTitle>
                <CardDescription>Top projects by time tracked</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={projectHours.slice(0, 8)}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip />
                      <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                        {projectHours.slice(0, 8).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Project Status</CardTitle>
                <CardDescription>Current project breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Active", value: projects?.filter((p) => p.status === "active").length || 0 },
                          { name: "Archived", value: projects?.filter((p) => p.status === "archived").length || 0 },
                          { name: "Completed", value: projects?.filter((p) => p.status === "completed").length || 0 },
                        ].filter((d) => d.value > 0)}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        <Cell fill="#10B981" />
                        <Cell fill="#6B7280" />
                        <Cell fill="#3B82F6" />
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
