import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  BarChart3, 
  Clock, 
  Users, 
  TrendingUp, 
  ArrowLeft,
  FileText,
  Calendar,
  Target
} from "lucide-react";
import { ReportsTab } from "@/components/settings/reports-tab";

type ReportView = "landing" | "workload" | "time" | "projects";

interface ReportCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  color: string;
}

function ReportCard({ icon, title, description, onClick, color }: ReportCardProps) {
  return (
    <Card 
      className="cursor-pointer hover-elevate active-elevate-2 transition-all"
      onClick={onClick}
      data-testid={`card-report-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <CardHeader className="pb-2">
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${color}`}>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <CardTitle className="text-lg mb-1">{title}</CardTitle>
        <CardDescription className="text-sm">
          {description}
        </CardDescription>
      </CardContent>
    </Card>
  );
}

export default function ReportsPage() {
  const { user, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState<ReportView>("landing");

  const isAdmin = user?.role === "admin";
  const isSuperUser = user?.role === "super_user";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAdmin && !isSuperUser) {
    return <Redirect to="/" />;
  }

  const reportCategories = [
    {
      icon: <Users className="h-6 w-6 text-white" />,
      title: "Workload Reports",
      description: "View task distribution and workload across your team members with completion metrics",
      view: "workload" as ReportView,
      color: "bg-blue-500",
    },
    {
      icon: <Clock className="h-6 w-6 text-white" />,
      title: "Time Tracking",
      description: "Analyze time entries by project, employee, and date range with detailed breakdowns",
      view: "time" as ReportView,
      color: "bg-green-500",
    },
    {
      icon: <Target className="h-6 w-6 text-white" />,
      title: "Project Analytics",
      description: "Project progress, budget utilization, and milestone tracking across all projects",
      view: "projects" as ReportView,
      color: "bg-purple-500",
    },
  ];

  if (currentView === "landing") {
    return (
      <ScrollArea className="h-full">
        <div className="container max-w-7xl py-8 px-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <BarChart3 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Reports & Analytics</h1>
              <p className="text-muted-foreground text-sm">
                Comprehensive insights into time tracking, workload, and project performance
              </p>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
            {reportCategories.map((category) => (
              <ReportCard
                key={category.title}
                icon={category.icon}
                title={category.title}
                description={category.description}
                onClick={() => setCurrentView(category.view)}
                color={category.color}
              />
            ))}
          </div>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Quick Stats
              </CardTitle>
              <CardDescription>
                Overview of your organization's key metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                Select a report category above to view detailed analytics and export options.
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    );
  }

  const getViewTitle = () => {
    switch (currentView) {
      case "workload": return "Workload Reports";
      case "time": return "Time Tracking Reports";
      case "projects": return "Project Analytics";
      default: return "Reports";
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="container max-w-7xl py-8 px-6">
        <div className="flex items-center gap-3 mb-6">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setCurrentView("landing")}
            data-testid="button-back-to-reports"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{getViewTitle()}</h1>
            <p className="text-muted-foreground text-sm">
              Detailed analytics and exportable reports
            </p>
          </div>
        </div>

        <ReportsTab defaultTab={currentView === "workload" ? "workload" : currentView === "time" ? "time" : undefined} />
      </div>
    </ScrollArea>
  );
}
