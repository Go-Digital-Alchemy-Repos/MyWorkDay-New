import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Clock, Calendar, TrendingUp, AlertTriangle, Play, Edit, FileWarning, Timer, BarChart3, List } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import { TimeTrackingContent } from "./time-tracking";

interface TimeStats {
  total: number;
  billable: number;
  unbillable: number;
}

interface DailyBreakdown {
  date: string;
  total: number;
  billable: number;
  unbillable: number;
}

interface MissingDescription {
  id: string;
  date: string;
  duration: number;
  clientName?: string;
  projectName?: string;
}

interface LongRunningDay {
  date: string;
  hours: number;
}

interface MyTimeStats {
  today: TimeStats;
  thisWeek: TimeStats;
  thisMonth: TimeStats;
  allTime: TimeStats;
  dailyBreakdown: DailyBreakdown[];
  warnings: {
    missingDescriptions: MissingDescription[];
    longRunningDays: LongRunningDay[];
  };
  lastEntryId: string | null;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function formatHours(seconds: number): string {
  return (seconds / 3600).toFixed(1);
}

function StatCard({ title, stats, icon: Icon, description }: { 
  title: string; 
  stats: TimeStats; 
  icon: React.ElementType;
  description?: string;
}) {
  const billablePercent = stats.total > 0 ? (stats.billable / stats.total) * 100 : 0;
  
  return (
    <Card data-testid={`stat-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
        <div>
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {description && <CardDescription className="text-xs">{description}</CardDescription>}
        </div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{formatDuration(stats.total)}</div>
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-purple-600 dark:text-purple-400">Billable</span>
            <span>{formatDuration(stats.billable)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-cyan-600 dark:text-cyan-400">Non-billable</span>
            <span>{formatDuration(stats.unbillable)}</span>
          </div>
          <Progress value={billablePercent} className="h-2" />
          <div className="text-xs text-muted-foreground text-right">
            {billablePercent.toFixed(0)}% billable
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function WeeklyChart({ data }: { data: DailyBreakdown[] }) {
  const maxTotal = Math.max(...data.map(d => d.total), 1);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  return (
    <Card data-testid="weekly-chart">
      <CardHeader>
        <CardTitle className="text-sm font-medium">This Week</CardTitle>
        <CardDescription>Daily time breakdown</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-2 h-32">
          {dayNames.map((day, index) => {
            const dayData = data.find(d => new Date(d.date).getDay() === index);
            const total = dayData?.total || 0;
            const billable = dayData?.billable || 0;
            const height = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
            const billableHeight = total > 0 ? (billable / total) * height : 0;
            
            return (
              <div key={day} className="flex flex-col items-center flex-1 gap-1">
                <div className="relative w-full h-24 flex flex-col justify-end">
                  <div 
                    className="w-full bg-cyan-500/30 dark:bg-cyan-600/30 rounded-t transition-all"
                    style={{ height: `${height}%` }}
                  >
                    <div 
                      className="w-full bg-purple-500 dark:bg-purple-600 rounded-t transition-all"
                      style={{ height: `${billableHeight > 0 ? (billableHeight / height) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">{day}</span>
                {total > 0 && (
                  <span className="text-xs font-medium">{formatHours(total)}h</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-center gap-4 mt-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-purple-500" />
            <span>Billable</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-cyan-500/30" />
            <span>Non-billable</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function WarningsPanel({ warnings, onEditEntry }: { 
  warnings: MyTimeStats['warnings']; 
  onEditEntry: (id: string) => void;
}) {
  const hasMissingDescriptions = warnings.missingDescriptions.length > 0;
  const hasLongDays = warnings.longRunningDays.length > 0;
  
  if (!hasMissingDescriptions && !hasLongDays) {
    return null;
  }
  
  return (
    <Card className="border-amber-200 dark:border-amber-800" data-testid="warnings-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Attention Needed
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasLongDays && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <Timer className="h-3 w-3" /> Long Days (&gt;8h)
            </h4>
            <div className="space-y-1">
              {warnings.longRunningDays.map((day) => (
                <div 
                  key={day.date} 
                  className="flex items-center justify-between text-sm p-2 rounded bg-amber-50 dark:bg-amber-950/30"
                  data-testid={`warning-long-day-${day.date}`}
                >
                  <span>{new Date(day.date).toLocaleDateString()}</span>
                  <Badge variant="outline" className="text-amber-600 border-amber-300">
                    {day.hours}h logged
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {hasMissingDescriptions && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <FileWarning className="h-3 w-3" /> Missing Descriptions
            </h4>
            <div className="space-y-1">
              {warnings.missingDescriptions.slice(0, 5).map((entry) => (
                <div 
                  key={entry.id} 
                  className="flex items-center justify-between text-sm p-2 rounded bg-amber-50 dark:bg-amber-950/30"
                  data-testid={`warning-missing-desc-${entry.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate">
                      {entry.projectName || entry.clientName || "No project"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(entry.date).toLocaleDateString()} - {formatDuration(entry.duration)}
                    </div>
                  </div>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => onEditEntry(entry.id)}
                    data-testid={`button-edit-entry-${entry.id}`}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuickActions({ lastEntryId, onEditEntry, onStartTimer }: {
  lastEntryId: string | null;
  onEditEntry: (id: string) => void;
  onStartTimer: () => void;
}) {
  return (
    <Card data-testid="quick-actions">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button 
          size="sm" 
          onClick={onStartTimer}
          data-testid="button-start-timer"
        >
          <Play className="h-4 w-4 mr-1" />
          Start Timer
        </Button>
        
        {lastEntryId && (
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => onEditEntry(lastEntryId)}
            data-testid="button-edit-last-entry"
          >
            <Edit className="h-4 w-4 mr-1" />
            Edit Last Entry
          </Button>
        )}
        
        <Link href="/my-calendar">
          <Button size="sm" variant="outline" data-testid="button-view-calendar">
            <Calendar className="h-4 w-4 mr-1" />
            My Calendar
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export default function MyTimePage() {
  const { toast } = useToast();
  const [location] = useLocation();
  const [activeTab, setActiveTab] = useState("dashboard");
  
  // Auto-switch to entries tab when edit param is present in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit");
    if (editId) {
      setActiveTab("entries");
    }
  }, [location]);
  
  const { data: stats, isLoading, error } = useQuery<MyTimeStats>({
    queryKey: ["/api/time-entries/my/stats"],
  });
  
  const startTimerMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/active-timer/start", {});
    },
    onSuccess: () => {
      toast({ title: "Timer started" });
      queryClient.invalidateQueries({ queryKey: ["/api/active-timer"] });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to start timer", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });
  
  const handleEditEntry = (_id: string) => {
    // Switch to the Time Entries tab where users can find and edit entries
    setActiveTab("entries");
  };
  
  const handleStartTimer = () => {
    startTimerMutation.mutate();
  };
  
  if (error) {
    return (
      <div className="p-6">
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">Failed to load time statistics. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="page-title">My Time</h1>
          <p className="text-sm text-muted-foreground">Your personal time tracking overview</p>
        </div>
        <Button onClick={handleStartTimer} data-testid="button-start-timer">
          <Play className="h-4 w-4 mr-2" />
          Start Timer
        </Button>
      </div>
      
      <div className="flex-1 overflow-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="mb-4">
            <TabsTrigger value="dashboard" data-testid="tab-dashboard">
              <BarChart3 className="h-4 w-4 mr-2" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="entries" data-testid="tab-time-entries">
              <List className="h-4 w-4 mr-2" />
              Time Entries
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="dashboard" className="flex-1 space-y-6">
            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                  <Card key={i}>
                    <CardHeader className="pb-2">
                      <Skeleton className="h-4 w-20" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-8 w-24 mb-4" />
                      <Skeleton className="h-2 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : stats ? (
              <>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <StatCard title="Today" stats={stats.today} icon={Clock} />
                  <StatCard title="This Week" stats={stats.thisWeek} icon={Calendar} />
                  <StatCard title="This Month" stats={stats.thisMonth} icon={TrendingUp} />
                  <StatCard title="All Time" stats={stats.allTime} icon={Timer} description="Total tracked" />
                </div>
                
                <div className="grid gap-4 md:grid-cols-2">
                  <WeeklyChart data={stats.dailyBreakdown} />
                  <div className="space-y-4">
                    <QuickActions 
                      lastEntryId={stats.lastEntryId} 
                      onEditEntry={handleEditEntry}
                      onStartTimer={handleStartTimer}
                    />
                    <WarningsPanel 
                      warnings={stats.warnings} 
                      onEditEntry={handleEditEntry}
                    />
                  </div>
                </div>
              </>
            ) : null}
          </TabsContent>
          
          <TabsContent value="entries" className="flex-1">
            <TimeTrackingContent />
          </TabsContent>
        </Tabs>
      </div>
      
    </div>
  );
}
