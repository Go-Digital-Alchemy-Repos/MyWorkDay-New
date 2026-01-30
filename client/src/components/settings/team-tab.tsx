import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { UserDrawer } from "@/components/user-drawer";
import { TeamDrawer } from "@/features/teams";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Plus, UserPlus, Users, Mail, MoreHorizontal, Copy, Trash2, 
  Edit, RefreshCw, X, ChevronDown, ChevronRight, UserMinus, Key, Eye, EyeOff
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { User, Team, Invitation, Client, TeamMember } from "@shared/schema";

interface TeamMemberWithUser extends TeamMember {
  user?: User;
}

interface TeamTabProps {
  isAdmin?: boolean;
}

export function TeamTab({ isAdmin = true }: TeamTabProps) {
  const [newUserOpen, setNewUserOpen] = useState(false);
  const [editUserOpen, setEditUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [editTeamOpen, setEditTeamOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  
  const [editingUserTeamIds, setEditingUserTeamIds] = useState<string[]>([]);
  const [editingUserClientIds, setEditingUserClientIds] = useState<string[]>([]);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);
  const [selectedTeamForMember, setSelectedTeamForMember] = useState<Team | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  
  // Password reset state
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mustChangeOnNextLogin, setMustChangeOnNextLogin] = useState(true);

  // Delete team confirmation state
  const [deleteTeamDialogOpen, setDeleteTeamDialogOpen] = useState(false);
  const [teamToDelete, setTeamToDelete] = useState<Team | null>(null);

  const { toast } = useToast();

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: teams } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const { data: invitations } = useQuery<Invitation[]>({
    queryKey: ["/api/invitations"],
    enabled: isAdmin,
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
    enabled: isAdmin,
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string; email: string; role: string; teamIds: string[]; clientIds: string[] }) => {
      return apiRequest("POST", "/api/users", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create user", variant: "destructive" });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PATCH", `/api/users/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update user", variant: "destructive" });
    },
  });

  const createTeamMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      return apiRequest("POST", "/api/teams", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({ title: "Team created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create team", variant: "destructive" });
    },
  });

  const updateTeamMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PATCH", `/api/teams/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({ title: "Team updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update team", variant: "destructive" });
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/teams/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({ title: "Team deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete team", variant: "destructive" });
    },
  });

  const addTeamMemberMutation = useMutation({
    mutationFn: async ({ teamId, userId }: { teamId: string; userId: string }) => {
      return apiRequest("POST", `/api/teams/${teamId}/members`, { userId });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/teams/${variables.teamId}/members`] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({ title: "Member added to team" });
      setAddMemberDialogOpen(false);
      setSelectedUserId("");
    },
    onError: () => {
      toast({ title: "Failed to add member", variant: "destructive" });
    },
  });

  const removeTeamMemberMutation = useMutation({
    mutationFn: async ({ teamId, userId }: { teamId: string; userId: string }) => {
      return apiRequest("DELETE", `/api/teams/${teamId}/members/${userId}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/teams/${variables.teamId}/members`] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({ title: "Member removed from team" });
    },
    onError: () => {
      toast({ title: "Failed to remove member", variant: "destructive" });
    },
  });

  const createInvitationMutation = useMutation({
    mutationFn: async (data: { userId: string; expiresInDays?: number; sendEmail?: boolean }) => {
      const res = await apiRequest("POST", "/api/invitations/for-user", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invitations"] });
      if (data?.inviteLink) {
        setLastInviteLink(data.inviteLink);
        navigator.clipboard.writeText(data.inviteLink);
        toast({ title: "Invitation created", description: "Invite link copied to clipboard" });
      } else {
        toast({ title: "Invitation created" });
      }
    },
    onError: () => {
      toast({ title: "Failed to create invitation", variant: "destructive" });
    },
  });

  const deleteInvitationMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/invitations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invitations"] });
      toast({ title: "Invitation revoked" });
    },
  });

  const toggleUserStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/users/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User status updated" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ id, password, mustChangeOnNextLogin }: { id: string; password: string; mustChangeOnNextLogin: boolean }) => {
      return apiRequest("POST", `/api/users/${id}/reset-password`, { password, mustChangeOnNextLogin });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setResetPasswordDialogOpen(false);
      setResetPasswordUser(null);
      setNewPassword("");
      setMustChangeOnNextLogin(true);
      toast({ title: "Password reset successfully", description: "The user will need to log in again with their new password." });
    },
    onError: (error: any) => {
      const message = error?.message || "Failed to reset password";
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  });

  const openResetPasswordDialog = (user: User) => {
    setResetPasswordUser(user);
    setNewPassword("");
    setMustChangeOnNextLogin(true);
    setShowPassword(false);
    setResetPasswordDialogOpen(true);
  };

  const handleResetPassword = () => {
    if (!resetPasswordUser || !newPassword || newPassword.length < 8) {
      toast({ title: "Error", description: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    resetPasswordMutation.mutate({
      id: resetPasswordUser.id,
      password: newPassword,
      mustChangeOnNextLogin,
    });
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "admin": return "default";
      case "employee": return "secondary";
      case "client": return "outline";
      default: return "secondary";
    }
  };

  const getInitials = (user: User) => {
    const first = user.firstName || user.name?.split(" ")[0] || "";
    const last = user.lastName || user.name?.split(" ")[1] || "";
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || user.email?.charAt(0).toUpperCase() || "U";
  };

  const getFullName = (user: User) => {
    if (user.firstName || user.lastName) {
      return `${user.firstName || ""} ${user.lastName || ""}`.trim();
    }
    return user.name || user.email || "Unknown";
  };

  const getUserInvitation = (user: User) => {
    return invitations?.find((inv) => inv.email === user.email && inv.status === "pending");
  };

  const hasUserAcceptedInvite = (user: User) => {
    return user.passwordHash !== null;
  };

  const openEditUser = (user: User) => {
    setEditingUser(user);
    setEditingUserTeamIds([]);
    setEditingUserClientIds([]);
    setEditUserOpen(true);
  };

  const openEditTeam = (team: Team) => {
    setEditingTeam(team);
    setEditTeamOpen(true);
  };

  const handleCreateUser = async (data: { firstName: string; lastName: string; email: string; role: string; teamIds: string[]; clientIds: string[] }) => {
    await createUserMutation.mutateAsync(data);
  };

  const handleUpdateUser = async (data: { firstName: string; lastName: string; email: string; role: string; isActive: boolean; teamIds: string[]; clientIds: string[] }) => {
    if (!editingUser) return;
    await updateUserMutation.mutateAsync({
      id: editingUser.id,
      data,
    });
  };

  const handleCreateTeam = async (data: { name: string }) => {
    await createTeamMutation.mutateAsync(data);
  };

  const handleUpdateTeam = async (data: { name: string }) => {
    if (!editingTeam) return;
    await updateTeamMutation.mutateAsync({
      id: editingTeam.id,
      data,
    });
  };

  const openDeleteTeamDialog = (team: Team) => {
    setTeamToDelete(team);
    setDeleteTeamDialogOpen(true);
  };

  const handleConfirmDeleteTeam = () => {
    if (teamToDelete) {
      deleteTeamMutation.mutate(teamToDelete.id);
      setDeleteTeamDialogOpen(false);
      setTeamToDelete(null);
    }
  };

  const handleInviteUser = (user: User) => {
    createInvitationMutation.mutate({ userId: user.id, expiresInDays: 7 });
  };

  const handleCopyInviteLink = (invitation: Invitation) => {
    if (lastInviteLink && invitation.tokenHash) {
      navigator.clipboard.writeText(lastInviteLink);
      toast({ title: "Invite link copied to clipboard" });
    } else {
      toast({ title: "Invite link unavailable", description: "The link is only available immediately after creation", variant: "destructive" });
    }
  };

  const handleRevokeInvite = (invitationId: string) => {
    deleteInvitationMutation.mutate(invitationId);
  };

  const openAddMemberDialog = (team: Team) => {
    setSelectedTeamForMember(team);
    setSelectedUserId("");
    setAddMemberDialogOpen(true);
    queryClient.invalidateQueries({ queryKey: [`/api/teams/${team.id}/members`] });
  };

  const handleAddMember = () => {
    if (selectedTeamForMember && selectedUserId) {
      addTeamMemberMutation.mutate({
        teamId: selectedTeamForMember.id,
        userId: selectedUserId,
      });
    }
  };

  const handleRemoveMember = (teamId: string, userId: string) => {
    removeTeamMemberMutation.mutate({ teamId, userId });
  };

  const toggleTeamExpanded = (teamId: string) => {
    setExpandedTeams(prev => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className={`grid gap-6 ${isAdmin ? "lg:grid-cols-3" : "lg:grid-cols-1"}`}>
        {isAdmin && (
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <div>
              <CardTitle className="text-lg">Team Members</CardTitle>
              <CardDescription>Manage users in your organization</CardDescription>
            </div>
            <Button size="sm" onClick={() => setNewUserOpen(true)} data-testid="button-new-user">
              <UserPlus className="h-4 w-4 mr-2" />
              New User
            </Button>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users?.map((user) => {
                    const invitation = getUserInvitation(user);
                    const hasPassword = hasUserAcceptedInvite(user);
                    
                    return (
                      <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs">
                                {getInitials(user)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium">{getFullName(user)}</div>
                              <div className="text-xs text-muted-foreground">{user.email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getRoleBadgeVariant(user.role || "employee")}>
                            {user.role || "employee"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant={user.isActive ? "default" : "secondary"}>
                              {user.isActive ? "Active" : "Inactive"}
                            </Badge>
                            {!hasPassword && (
                              <Badge variant="outline" className="text-xs">
                                Pending Onboarding
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEditUser(user)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit User
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {!invitation ? (
                                <DropdownMenuItem onClick={() => handleInviteUser(user)}>
                                  <Mail className="h-4 w-4 mr-2" />
                                  Create Invite
                                </DropdownMenuItem>
                              ) : (
                                <>
                                  <DropdownMenuItem onClick={() => handleCopyInviteLink(invitation)}>
                                    <Copy className="h-4 w-4 mr-2" />
                                    Copy Invite Link
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleInviteUser(user)}>
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                    Resend Invite
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => handleRevokeInvite(invitation.id)}
                                    className="text-destructive"
                                  >
                                    <X className="h-4 w-4 mr-2" />
                                    Revoke Invite
                                  </DropdownMenuItem>
                                </>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => openResetPasswordDialog(user)}>
                                <Key className="h-4 w-4 mr-2" />
                                Reset Password
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => toggleUserStatusMutation.mutate({ 
                                  id: user.id, 
                                  isActive: !user.isActive 
                                })}
                              >
                                {user.isActive ? "Deactivate" : "Activate"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {(!users || users.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No users found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        )}

        <Card className={isAdmin ? "lg:col-span-1" : "lg:col-span-1"}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <div>
              <CardTitle className="text-lg">Teams</CardTitle>
              <CardDescription>Organize users into groups</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => setCreateTeamOpen(true)} data-testid="button-create-team">
              <Plus className="h-4 w-4 mr-2" />
              Create Team
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {teams?.map((team) => (
                <TeamWithMembers
                  key={team.id}
                  team={team}
                  isExpanded={expandedTeams.has(team.id)}
                  onToggleExpand={() => toggleTeamExpanded(team.id)}
                  onEditTeam={() => openEditTeam(team)}
                  onDeleteTeam={() => openDeleteTeamDialog(team)}
                  onAddMember={() => openAddMemberDialog(team)}
                  onRemoveMember={(userId) => handleRemoveMember(team.id, userId)}
                  users={users}
                />
              ))}
              {(!teams || teams.length === 0) && (
                <div className="text-center text-muted-foreground py-8">
                  No teams created yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {isAdmin && (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pending Invitations</CardTitle>
          <CardDescription>Invitations waiting to be accepted</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations?.filter(inv => inv.status === "pending").map((invite) => (
                  <TableRow key={invite.id} data-testid={`row-invitation-${invite.id}`}>
                    <TableCell className="font-medium">{invite.email}</TableCell>
                    <TableCell>
                      <Badge variant={getRoleBadgeVariant(invite.role)}>
                        {invite.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {invite.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {invite.expiresAt ? new Date(invite.expiresAt).toLocaleDateString() : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleCopyInviteLink(invite)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => handleRevokeInvite(invite.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(!invitations || invitations.filter(i => i.status === "pending").length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No pending invitations
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      )}

      {isAdmin && (
      <>
      <UserDrawer
        open={newUserOpen}
        onOpenChange={setNewUserOpen}
        onSubmit={handleCreateUser}
        isLoading={createUserMutation.isPending}
        mode="create"
        teams={teams}
        clients={clients}
      />

      <UserDrawer
        open={editUserOpen}
        onOpenChange={setEditUserOpen}
        onSubmit={handleUpdateUser}
        user={editingUser}
        isLoading={updateUserMutation.isPending}
        mode="edit"
        teams={teams}
        clients={clients}
        userTeamIds={editingUserTeamIds}
        userClientIds={editingUserClientIds}
      />
      </>
      )}

      <TeamDrawer
        open={createTeamOpen}
        onOpenChange={setCreateTeamOpen}
        onSubmit={handleCreateTeam}
        isLoading={createTeamMutation.isPending}
        mode="create"
      />

      <TeamDrawer
        open={editTeamOpen}
        onOpenChange={setEditTeamOpen}
        onSubmit={handleUpdateTeam}
        team={editingTeam}
        isLoading={updateTeamMutation.isPending}
        mode="edit"
      />

      <AddMemberDialog
        open={addMemberDialogOpen}
        onOpenChange={setAddMemberDialogOpen}
        team={selectedTeamForMember}
        users={users}
        selectedUserId={selectedUserId}
        onSelectUser={setSelectedUserId}
        onConfirm={handleAddMember}
        isPending={addTeamMemberMutation.isPending}
      />

      {/* Password Reset Dialog */}
      <Dialog open={resetPasswordDialogOpen} onOpenChange={setResetPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for {resetPasswordUser?.firstName} {resetPasswordUser?.lastName} ({resetPasswordUser?.email})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min 8 characters)"
                  data-testid="input-new-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPassword(!showPassword)}
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {newPassword.length > 0 && newPassword.length < 8 && (
                <p className="text-sm text-destructive">Password must be at least 8 characters</p>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="must-change"
                checked={mustChangeOnNextLogin}
                onCheckedChange={(checked) => setMustChangeOnNextLogin(checked === true)}
                data-testid="checkbox-must-change"
              />
              <Label htmlFor="must-change" className="text-sm font-normal">
                Require password change on next login
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPasswordDialogOpen(false)} data-testid="button-cancel-reset">
              Cancel
            </Button>
            <Button 
              onClick={handleResetPassword} 
              disabled={!newPassword || newPassword.length < 8 || resetPasswordMutation.isPending}
              data-testid="button-confirm-reset"
            >
              {resetPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTeamDialogOpen} onOpenChange={setDeleteTeamDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Team</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{teamToDelete?.name}"? Members will be detached but not deleted.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-team">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDeleteTeam}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-team"
            >
              {deleteTeamMutation.isPending ? "Deleting..." : "Delete Team"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TeamWithMembers({
  team,
  isExpanded,
  onToggleExpand,
  onEditTeam,
  onDeleteTeam,
  onAddMember,
  onRemoveMember,
  users,
}: {
  team: Team;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEditTeam: () => void;
  onDeleteTeam: () => void;
  onAddMember: () => void;
  onRemoveMember: (userId: string) => void;
  users?: User[];
}) {
  const { data: members, isLoading } = useQuery<TeamMemberWithUser[]>({
    queryKey: [`/api/teams/${team.id}/members`],
    enabled: isExpanded,
  });

  const getInitials = (user: User) => {
    const first = user.firstName || user.name?.split(" ")[0] || "";
    const last = user.lastName || user.name?.split(" ")[1] || "";
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || user.email?.charAt(0).toUpperCase() || "U";
  };

  const getFullName = (user: User) => {
    if (user.firstName || user.lastName) {
      return `${user.firstName || ""} ${user.lastName || ""}`.trim();
    }
    return user.name || user.email || "Unknown";
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggleExpand}>
      <div
        className="rounded-lg border"
        data-testid={`card-team-${team.id}`}
      >
        <div className="flex items-center justify-between p-3">
          <CollapsibleTrigger asChild>
            <button 
              className="flex items-center gap-3 flex-1 text-left hover-elevate rounded-md p-1 -m-1"
              data-testid={`button-expand-team-${team.id}`}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="font-medium text-sm">{team.name}</div>
                <div className="text-xs text-muted-foreground">
                  {isExpanded && members ? `${members.length} members` : "Click to expand"}
                </div>
              </div>
            </button>
          </CollapsibleTrigger>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onAddMember} data-testid={`menu-add-member-${team.id}`}>
                <UserPlus className="h-4 w-4 mr-2" />
                Add Member
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEditTeam} data-testid={`menu-edit-team-${team.id}`}>
                <Edit className="h-4 w-4 mr-2" />
                Edit Team
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={onDeleteTeam}
                className="text-destructive"
                data-testid={`menu-delete-team-${team.id}`}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Team
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        <CollapsibleContent>
          <div className="border-t px-3 py-2 space-y-1">
            {isLoading && (
              <div className="text-xs text-muted-foreground py-2">Loading members...</div>
            )}
            {members && members.length === 0 && (
              <div className="text-xs text-muted-foreground py-2">No members yet</div>
            )}
            {members?.map((member) => (
              <div 
                key={member.id} 
                className="flex items-center justify-between py-1"
                data-testid={`team-member-${member.userId}`}
              >
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs">
                      {member.user ? getInitials(member.user) : "?"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm">
                    {member.user ? getFullName(member.user) : "Unknown"}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => onRemoveMember(member.userId)}
                  data-testid={`button-remove-member-${member.userId}`}
                >
                  <UserMinus className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-2 text-xs"
              onClick={onAddMember}
              data-testid={`button-add-member-${team.id}`}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Member
            </Button>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function AddMemberDialog({
  open,
  onOpenChange,
  team,
  users,
  selectedUserId,
  onSelectUser,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: Team | null;
  users?: User[];
  selectedUserId: string;
  onSelectUser: (userId: string) => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const { data: existingMembers } = useQuery<TeamMemberWithUser[]>({
    queryKey: [`/api/teams/${team?.id}/members`],
    enabled: open && !!team,
  });

  const existingMemberIds = new Set(existingMembers?.map(m => m.userId) || []);
  
  const availableUsers = users?.filter(u => 
    u.role !== "client" && !existingMemberIds.has(u.id)
  ) || [];

  const getFullName = (user: User) => {
    if (user.firstName || user.lastName) {
      return `${user.firstName || ""} ${user.lastName || ""}`.trim();
    }
    return user.name || user.email || "Unknown";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Team Member</DialogTitle>
          <DialogDescription>
            Add a user to {team?.name}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          {availableUsers.length === 0 ? (
            <div className="text-center text-muted-foreground py-4">
              All users are already members of this team
            </div>
          ) : (
            <Select value={selectedUserId} onValueChange={onSelectUser}>
              <SelectTrigger data-testid="select-team-member">
                <SelectValue placeholder="Select a user" />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {getFullName(user)} ({user.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-add-member"
          >
            Cancel
          </Button>
          <Button 
            onClick={onConfirm} 
            disabled={!selectedUserId || isPending || availableUsers.length === 0}
            data-testid="button-confirm-add-member"
          >
            {isPending ? "Adding..." : "Add Member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
