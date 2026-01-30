import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UsersRound } from "lucide-react";
import { TeamTab } from "@/components/settings/team-tab";

export default function UserManagerPage() {
  const { user, isLoading } = useAuth();

  const isAdmin = user?.role === "admin";
  const isSuperUser = user?.role === "super_user";
  const isEmployee = user?.role === "employee";
  const isTenantMember = isAdmin || isEmployee || isSuperUser;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isTenantMember) {
    return <Redirect to="/" />;
  }

  return (
    <ScrollArea className="h-full">
      <div className="container max-w-6xl py-8 px-6">
        <div className="flex items-center gap-3 mb-6">
          <UsersRound className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">{isAdmin || isSuperUser ? "User Manager" : "Team Manager"}</h1>
            <p className="text-muted-foreground text-sm">
              {isAdmin || isSuperUser 
                ? "Manage your organization's users and teams" 
                : "Manage your organization's teams"
              }
            </p>
          </div>
        </div>

        <TeamTab isAdmin={isAdmin || isSuperUser} />
      </div>
    </ScrollArea>
  );
}
