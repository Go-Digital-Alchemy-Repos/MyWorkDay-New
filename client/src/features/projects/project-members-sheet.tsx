import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Search, UserPlus, X, Users } from "lucide-react";
import type { Project, User, ProjectMember } from "@shared/schema";

interface ProjectMembersSheetProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type MemberWithUser = ProjectMember & { user?: User };
type TenantUser = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  role?: string;
};

export function ProjectMembersSheet({
  project,
  open,
  onOpenChange,
}: ProjectMembersSheetProps) {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: members = [], isLoading: membersLoading } = useQuery<MemberWithUser[]>({
    queryKey: ["/api/projects", project.id, "members"],
    enabled: open && !!project.id,
  });

  const { data: tenantUsers = [], isLoading: usersLoading } = useQuery<TenantUser[]>({
    queryKey: ["/api/users"],
    enabled: open,
  });

  const memberUserIds = useMemo(
    () => new Set(members.map((m) => m.userId)),
    [members]
  );

  const availableUsers = useMemo(
    () =>
      tenantUsers.filter(
        (u) =>
          !memberUserIds.has(u.id) &&
          (u.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.lastName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.email.toLowerCase().includes(searchQuery.toLowerCase()))
      ),
    [tenantUsers, memberUserIds, searchQuery]
  );

  const addMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("POST", `/api/projects/${project.id}/members`, { userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "members"] });
      toast({ title: "Member added to project" });
    },
    onError: (error: any) => {
      const message = error?.message || "Failed to add member";
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/projects/${project.id}/members/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "members"] });
      toast({ title: "Member removed from project" });
    },
    onError: (error: any) => {
      const message = error?.message || "Failed to remove member";
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  });

  const getInitials = (user: TenantUser | User | undefined) => {
    if (!user) return "?";
    const first = (user as any).firstName || "";
    const last = (user as any).lastName || "";
    if (first && last) return `${first[0]}${last[0]}`.toUpperCase();
    return user.email?.[0]?.toUpperCase() || "?";
  };

  const getDisplayName = (user: TenantUser | User | undefined) => {
    if (!user) return "Unknown";
    const first = (user as any).firstName || "";
    const last = (user as any).lastName || "";
    if (first || last) return `${first} ${last}`.trim();
    return user.email;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md" data-testid="sheet-project-members">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Project Members
          </SheetTitle>
          <SheetDescription>
            Manage who has access to "{project.name}"
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="space-y-3">
            <div className="text-sm font-medium text-muted-foreground">
              Current Members ({members.length})
            </div>
            <ScrollArea className="h-[200px]">
              {membersLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 p-2">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  ))}
                </div>
              ) : members.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  No members yet. Add team members below.
                </div>
              ) : (
                <div className="space-y-1">
                  {members.map((member) => (
                    <div
                      key={member.userId}
                      className="flex items-center justify-between p-2 rounded-md hover-elevate"
                      data-testid={`member-row-${member.userId}`}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={(member.user as any)?.avatarUrl || undefined} />
                          <AvatarFallback className="text-xs">
                            {getInitials(member.user)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="text-sm font-medium">
                            {getDisplayName(member.user)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {member.user?.email}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMemberMutation.mutate(member.userId)}
                        disabled={removeMemberMutation.isPending}
                        data-testid={`button-remove-member-${member.userId}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="text-sm font-medium text-muted-foreground">
              Add Members
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-users"
              />
            </div>
            <ScrollArea className="h-[200px]">
              {usersLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 p-2">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  ))}
                </div>
              ) : availableUsers.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  {searchQuery
                    ? "No matching users found"
                    : "All users are already members"}
                </div>
              ) : (
                <div className="space-y-1">
                  {availableUsers.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-2 rounded-md hover-elevate cursor-pointer"
                      onClick={() => addMemberMutation.mutate(user.id)}
                      data-testid={`user-row-${user.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.avatarUrl || undefined} />
                          <AvatarFallback className="text-xs">
                            {getInitials(user)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="text-sm font-medium">
                            {getDisplayName(user)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {user.email}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={addMemberMutation.isPending}
                        data-testid={`button-add-member-${user.id}`}
                      >
                        <UserPlus className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
