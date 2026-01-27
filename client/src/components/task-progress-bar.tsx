import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, Clock, AlertTriangle, Trophy, Target, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskStats {
  total: number;
  done: number;
  inProgress: number;
  todo: number;
  blocked: number;
}

interface TaskProgressBarProps {
  stats: TaskStats;
  className?: string;
  showMilestones?: boolean;
  compact?: boolean;
}

const MILESTONES = [25, 50, 75, 100];

export function TaskProgressBar({ stats, className, showMilestones = false, compact = false }: TaskProgressBarProps) {
  const { total, done, inProgress, todo, blocked } = stats;
  const completionPercentage = total > 0 ? Math.round((done / total) * 100) : 0;

  const getMilestoneMessage = () => {
    if (completionPercentage === 100) return "All tasks complete!";
    if (completionPercentage >= 75) return "Almost there!";
    if (completionPercentage >= 50) return "Halfway done!";
    if (completionPercentage >= 25) return "Great start!";
    return "Let's get started!";
  };

  if (compact) {
    return (
      <div className={cn("space-y-2", className)} data-testid="task-progress-bar-compact">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{completionPercentage}% Complete</span>
          <span className="text-muted-foreground">{done}/{total}</span>
        </div>
        <Progress value={completionPercentage} className="h-2" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)} data-testid="task-progress-bar">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Progress</span>
          <span className="text-2xl font-bold text-foreground">{completionPercentage}%</span>
          {completionPercentage === 100 && (
            <Trophy className="h-5 w-5 text-yellow-500" />
          )}
        </div>
        <span className="text-sm text-muted-foreground">
          {done} of {total} tasks completed
        </span>
      </div>

      <div className="relative">
        <Progress value={completionPercentage} className="h-3" />
        
        {showMilestones && (
          <div className="absolute inset-0 flex items-center pointer-events-none">
            {MILESTONES.map((milestone) => (
              <div
                key={milestone}
                className="absolute flex flex-col items-center"
                style={{ left: `${milestone}%`, transform: "translateX(-50%)" }}
              >
                <div
                  className={cn(
                    "w-3 h-3 rounded-full border-2 transition-all duration-300",
                    completionPercentage >= milestone
                      ? "bg-primary border-primary scale-110"
                      : "bg-background border-muted-foreground/30"
                  )}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {showMilestones && (
        <div className="flex items-center gap-2 text-sm">
          {completionPercentage >= 75 ? (
            <Sparkles className="h-4 w-4 text-yellow-500" />
          ) : (
            <Target className="h-4 w-4 text-muted-foreground" />
          )}
          <span className={cn(
            "font-medium",
            completionPercentage === 100 ? "text-green-600 dark:text-green-400" :
            completionPercentage >= 75 ? "text-yellow-600 dark:text-yellow-400" :
            "text-muted-foreground"
          )}>
            {getMilestoneMessage()}
          </span>
        </div>
      )}

      <div className="flex items-center gap-3 md:gap-4 flex-wrap">
        <div className="flex items-center gap-1.5" data-testid="stat-done">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span className="text-xs md:text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{done}</span> Done
          </span>
        </div>
        <div className="flex items-center gap-1.5" data-testid="stat-in-progress">
          <Clock className="h-4 w-4 text-blue-500" />
          <span className="text-xs md:text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{inProgress}</span> In Progress
          </span>
        </div>
        <div className="flex items-center gap-1.5" data-testid="stat-todo">
          <Circle className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs md:text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{todo}</span> To Do
          </span>
        </div>
        {blocked > 0 && (
          <div className="flex items-center gap-1.5" data-testid="stat-blocked">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="text-xs md:text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{blocked}</span> Blocked
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
