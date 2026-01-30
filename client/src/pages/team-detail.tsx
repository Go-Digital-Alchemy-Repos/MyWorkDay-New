import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { TeamDrawer } from "@/features/teams";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Users, 
  Edit, 
  Trash2, 
  MoreHorizontal, 
  UserMinus,
  ArrowLeft,
  FolderKanban
} from "lucide-react";
import type { Team, User, TeamMember, Project } from "@shared/schema";

interface TeamMemberWithUser extends TeamMember {
  user?: User;
}

export default function TeamDetailPage() {
  const { id: teamId } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [editTeamOpen, setEditTeamOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [removeMemberDialogOpen, setRemoveMemberDialogOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<TeamMemberWithUser | null>(null);

  const { data: team, isLoading: teamLoading } = useQuery<Team>({
    queryKey: ["/api/teams", teamId],
    enabled: !!teamId,
  });

  const { data: teamMembers = [], isLoading: membersLoading } = useQuery<TeamMemberWithUser[]>({
    queryKey: ["/api/teams", teamId, "members"],
    enabled: !!teamId,
  });

  const { data: teamProjects = [] } = useQuery<Project[]>({
    queryKey: ["/api/v1/projects", { teamId }],
    enabled: !!teamId,
  });

  const updateTeamMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      return apiRequest("PATCH", `/api/teams/${teamId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams", teamId] });
      toast({ title: "Team updated successfully" });
      setEditTeamOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to update team", variant: "destructive" });
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/teams/${teamId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({ title: "Team deleted successfully" });
      navigate("/settings/teams");
    },
    onError: () => {
      toast({ title: "Failed to delete team", variant: "destructive" });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/teams/${teamId}/members/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", teamId, "members"] });
      toast({ title: "Member removed from team" });
      setRemoveMemberDialogOpen(false);
      setMemberToRemove(null);
    },
    onError: () => {
      toast({ title: "Failed to remove member", variant: "destructive" });
    },
  });

  const handleEditTeam = async (data: { name: string }) => {
    await updateTeamMutation.mutateAsync(data);
  };

  const handleDeleteTeam = () => {
    deleteTeamMutation.mutate();
  };

  const handleRemoveMember = () => {
    if (memberToRemove?.userId) {
      removeMemberMutation.mutate(memberToRemove.userId);
    }
  };

  const confirmRemoveMember = (member: TeamMemberWithUser) => {
    setMemberToRemove(member);
    setRemoveMemberDialogOpen(true);
  };

  if (teamLoading) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground" data-testid="text-team-not-found">Team not found</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/settings/teams")} data-testid="button-back-to-teams-notfound">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Teams
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/settings/teams")} data-testid="button-back-teams">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="text-team-name">
            <Users className="h-6 w-6" />
            {team.name}
          </h1>
          <p className="text-muted-foreground text-sm">
            {teamMembers.length} member{teamMembers.length !== 1 ? "s" : ""} · {teamProjects.length} project{teamProjects.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setEditTeamOpen(true)} data-testid="button-edit-team">
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)} data-testid="button-delete-team">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team Members
            </CardTitle>
            <CardDescription>
              Users assigned to this team
            </CardDescription>
          </CardHeader>
          <CardContent>
            {membersLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : teamMembers.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No members in this team yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamMembers.map((member) => (
                    <TableRow key={member.id} data-testid={`row-member-${member.userId}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>
                              {member.user?.firstName?.charAt(0) || member.user?.email?.charAt(0) || "U"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">
                              {member.user?.firstName} {member.user?.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground">{member.user?.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{member.user?.role || "employee"}</Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-member-menu-${member.userId}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem 
                              onClick={() => confirmRemoveMember(member)}
                              className="text-destructive"
                              data-testid={`button-remove-member-${member.userId}`}
                            >
                              <UserMinus className="h-4 w-4 mr-2" />
                              Remove from team
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {teamProjects.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderKanban className="h-5 w-5" />
                Team Projects
              </CardTitle>
              <CardDescription>
                Projects assigned to this team
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {teamProjects.map((project) => (
                  <div 
                    key={project.id} 
                    className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer"
                    onClick={() => navigate(`/projects/${project.id}`)}
                    data-testid={`link-project-${project.id}`}
                  >
                    <div 
                      className="h-3 w-3 rounded-sm"
                      style={{ backgroundColor: project.color || "#3B82F6" }}
                    />
                    <span className="font-medium">{project.name}</span>
                    <Badge variant="outline" className="ml-auto">{project.status}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <TeamDrawer
        open={editTeamOpen}
        onOpenChange={setEditTeamOpen}
        onSubmit={handleEditTeam}
        team={team}
        mode="edit"
        isLoading={updateTeamMutation.isPending}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Team</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{team.name}"? Members will be detached but not deleted.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteTeam}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              {deleteTeamMutation.isPending ? "Deleting..." : "Delete Team"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={removeMemberDialogOpen} onOpenChange={setRemoveMemberDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {memberToRemove?.user?.firstName} {memberToRemove?.user?.lastName} from this team?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-remove-member">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRemoveMember}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-remove-member"
            >
              {removeMemberMutation.isPending ? "Removing..." : "Remove Member"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
