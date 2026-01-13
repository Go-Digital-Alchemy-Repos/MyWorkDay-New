import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Edit, Link as LinkIcon, RefreshCw, X, Check
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import type { User, Team, Invitation, Client } from "@shared/schema";

interface TeamMember {
  teamId: string;
  userId: string;
  user?: User;
}

export function TeamTab() {
  const [newUserOpen, setNewUserOpen] = useState(false);
  const [editUserOpen, setEditUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [editTeamOpen, setEditTeamOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  
  const [newUserForm, setNewUserForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "employee" as "admin" | "employee" | "client",
    teamIds: [] as string[],
    clientIds: [] as string[],
  });
  
  const [editUserForm, setEditUserForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "employee" as "admin" | "employee" | "client",
    isActive: true,
    teamIds: [] as string[],
    clientIds: [] as string[],
  });

  const [editTeamForm, setEditTeamForm] = useState({
    name: "",
    description: "",
  });

  const { toast } = useToast();

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: teams } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const { data: invitations } = useQuery<Invitation[]>({
    queryKey: ["/api/invitations"],
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: typeof newUserForm) => {
      return apiRequest("POST", "/api/users", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setNewUserOpen(false);
      setNewUserForm({
        firstName: "",
        lastName: "",
        email: "",
        role: "employee",
        teamIds: [],
        clientIds: [],
      });
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
      setEditUserOpen(false);
      setEditingUser(null);
      toast({ title: "User updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update user", variant: "destructive" });
    },
  });

  const createTeamMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      return apiRequest("POST", "/api/teams", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      setCreateTeamOpen(false);
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
      setEditTeamOpen(false);
      setEditingTeam(null);
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

  const createInvitationMutation = useMutation({
    mutationFn: async (data: { userId: string; expiresInDays?: number; sendEmail?: boolean }) => {
      return apiRequest("POST", "/api/invitations/for-user", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invitations"] });
      toast({ title: "Invitation created" });
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
    setEditUserForm({
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      email: user.email,
      role: (user.role as "admin" | "employee" | "client") || "employee",
      isActive: user.isActive ?? true,
      teamIds: [],
      clientIds: [],
    });
    setEditUserOpen(true);
  };

  const openEditTeam = (team: Team) => {
    setEditingTeam(team);
    setEditTeamForm({
      name: team.name,
      description: "",
    });
    setEditTeamOpen(true);
  };

  const handleCreateUser = () => {
    createUserMutation.mutate(newUserForm);
  };

  const handleUpdateUser = () => {
    if (!editingUser) return;
    updateUserMutation.mutate({
      id: editingUser.id,
      data: editUserForm,
    });
  };

  const handleCreateTeam = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createTeamMutation.mutate({
      name: formData.get("name") as string,
      description: formData.get("description") as string || undefined,
    });
  };

  const handleUpdateTeam = () => {
    if (!editingTeam) return;
    updateTeamMutation.mutate({
      id: editingTeam.id,
      data: editTeamForm,
    });
  };

  const handleDeleteTeam = (teamId: string) => {
    if (window.confirm("Are you sure you want to delete this team? Members will be detached but not deleted.")) {
      deleteTeamMutation.mutate(teamId);
    }
  };

  const handleInviteUser = (user: User) => {
    createInvitationMutation.mutate({ userId: user.id, expiresInDays: 7 });
  };

  const handleCopyInviteLink = (invitation: Invitation) => {
    navigator.clipboard.writeText(`${window.location.origin}/accept-invite/${invitation.token}`);
    toast({ title: "Invite link copied to clipboard" });
  };

  const handleRevokeInvite = (invitationId: string) => {
    deleteInvitationMutation.mutate(invitationId);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
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

        <Card>
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
            <div className="space-y-3">
              {teams?.map((team) => (
                <div
                  key={team.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                  data-testid={`card-team-${team.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="font-medium">{team.name}</div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditTeam(team)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Team
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => handleDeleteTeam(team.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Team
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
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

      <Sheet open={newUserOpen} onOpenChange={setNewUserOpen}>
        <SheetContent className="sm:max-w-[480px]">
          <SheetHeader>
            <SheetTitle>New User</SheetTitle>
            <SheetDescription>
              Create a new user without sending an email invitation
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-firstName">First Name *</Label>
                <Input
                  id="new-firstName"
                  value={newUserForm.firstName}
                  onChange={(e) => setNewUserForm({ ...newUserForm, firstName: e.target.value })}
                  placeholder="John"
                  required
                  data-testid="input-new-user-firstname"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-lastName">Last Name *</Label>
                <Input
                  id="new-lastName"
                  value={newUserForm.lastName}
                  onChange={(e) => setNewUserForm({ ...newUserForm, lastName: e.target.value })}
                  placeholder="Doe"
                  required
                  data-testid="input-new-user-lastname"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-email">Email *</Label>
              <Input
                id="new-email"
                type="email"
                value={newUserForm.email}
                onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                placeholder="john@example.com"
                required
                data-testid="input-new-user-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-role">Role</Label>
              <Select 
                value={newUserForm.role} 
                onValueChange={(v: "admin" | "employee" | "client") => setNewUserForm({ ...newUserForm, role: v })}
              >
                <SelectTrigger data-testid="select-new-user-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {teams && teams.length > 0 && (
              <div className="space-y-2">
                <Label>Assign to Teams</Label>
                <div className="border rounded-md p-3 space-y-2 max-h-[150px] overflow-y-auto">
                  {teams.map((team) => (
                    <div key={team.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`new-team-${team.id}`}
                        checked={newUserForm.teamIds.includes(team.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setNewUserForm({ ...newUserForm, teamIds: [...newUserForm.teamIds, team.id] });
                          } else {
                            setNewUserForm({ ...newUserForm, teamIds: newUserForm.teamIds.filter(id => id !== team.id) });
                          }
                        }}
                      />
                      <label htmlFor={`new-team-${team.id}`} className="text-sm cursor-pointer">
                        {team.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {newUserForm.role === "client" && clients && clients.length > 0 && (
              <div className="space-y-2">
                <Label>Client Account Access</Label>
                <div className="border rounded-md p-3 space-y-2 max-h-[150px] overflow-y-auto">
                  {clients.map((client) => (
                    <div key={client.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`new-client-${client.id}`}
                        checked={newUserForm.clientIds.includes(client.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setNewUserForm({ ...newUserForm, clientIds: [...newUserForm.clientIds, client.id] });
                          } else {
                            setNewUserForm({ ...newUserForm, clientIds: newUserForm.clientIds.filter(id => id !== client.id) });
                          }
                        }}
                      />
                      <label htmlFor={`new-client-${client.id}`} className="text-sm cursor-pointer">
                        {client.displayName || client.companyName}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <SheetFooter>
            <Button 
              onClick={handleCreateUser} 
              disabled={createUserMutation.isPending || !newUserForm.firstName || !newUserForm.lastName || !newUserForm.email}
              data-testid="button-create-user"
            >
              {createUserMutation.isPending ? "Creating..." : "Create User"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={editUserOpen} onOpenChange={setEditUserOpen}>
        <SheetContent className="sm:max-w-[480px]">
          <SheetHeader>
            <SheetTitle>Edit User</SheetTitle>
            <SheetDescription>
              Update user details and permissions
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-firstName">First Name</Label>
                <Input
                  id="edit-firstName"
                  value={editUserForm.firstName}
                  onChange={(e) => setEditUserForm({ ...editUserForm, firstName: e.target.value })}
                  data-testid="input-edit-user-firstname"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-lastName">Last Name</Label>
                <Input
                  id="edit-lastName"
                  value={editUserForm.lastName}
                  onChange={(e) => setEditUserForm({ ...editUserForm, lastName: e.target.value })}
                  data-testid="input-edit-user-lastname"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editUserForm.email}
                onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })}
                data-testid="input-edit-user-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select 
                value={editUserForm.role} 
                onValueChange={(v: "admin" | "employee" | "client") => setEditUserForm({ ...editUserForm, role: v })}
              >
                <SelectTrigger data-testid="select-edit-user-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit-isActive"
                checked={editUserForm.isActive}
                onCheckedChange={(checked) => setEditUserForm({ ...editUserForm, isActive: !!checked })}
              />
              <label htmlFor="edit-isActive" className="text-sm cursor-pointer">
                User is active
              </label>
            </div>

            {teams && teams.length > 0 && (
              <div className="space-y-2">
                <Label>Team Assignments</Label>
                <div className="border rounded-md p-3 space-y-2 max-h-[150px] overflow-y-auto">
                  {teams.map((team) => (
                    <div key={team.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`edit-team-${team.id}`}
                        checked={editUserForm.teamIds.includes(team.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setEditUserForm({ ...editUserForm, teamIds: [...editUserForm.teamIds, team.id] });
                          } else {
                            setEditUserForm({ ...editUserForm, teamIds: editUserForm.teamIds.filter(id => id !== team.id) });
                          }
                        }}
                      />
                      <label htmlFor={`edit-team-${team.id}`} className="text-sm cursor-pointer">
                        {team.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {editUserForm.role === "client" && clients && clients.length > 0 && (
              <div className="space-y-2">
                <Label>Client Account Access</Label>
                <div className="border rounded-md p-3 space-y-2 max-h-[150px] overflow-y-auto">
                  {clients.map((client) => (
                    <div key={client.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`edit-client-${client.id}`}
                        checked={editUserForm.clientIds.includes(client.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setEditUserForm({ ...editUserForm, clientIds: [...editUserForm.clientIds, client.id] });
                          } else {
                            setEditUserForm({ ...editUserForm, clientIds: editUserForm.clientIds.filter(id => id !== client.id) });
                          }
                        }}
                      />
                      <label htmlFor={`edit-client-${client.id}`} className="text-sm cursor-pointer">
                        {client.displayName || client.companyName}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <SheetFooter>
            <Button 
              onClick={handleUpdateUser} 
              disabled={updateUserMutation.isPending}
              data-testid="button-save-user"
            >
              {updateUserMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={createTeamOpen} onOpenChange={setCreateTeamOpen}>
        <SheetContent className="sm:max-w-[400px]">
          <SheetHeader>
            <SheetTitle>Create Team</SheetTitle>
            <SheetDescription>
              Create a new team to organize users
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleCreateTeam}>
            <div className="space-y-4 py-6">
              <div className="space-y-2">
                <Label htmlFor="team-name">Team Name *</Label>
                <Input
                  id="team-name"
                  name="name"
                  placeholder="Engineering"
                  required
                  data-testid="input-team-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="team-description">Description</Label>
                <Textarea
                  id="team-description"
                  name="description"
                  placeholder="Team description..."
                  data-testid="input-team-description"
                />
              </div>
            </div>
            <SheetFooter>
              <Button type="submit" disabled={createTeamMutation.isPending} data-testid="button-save-team">
                {createTeamMutation.isPending ? "Creating..." : "Create Team"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={editTeamOpen} onOpenChange={setEditTeamOpen}>
        <SheetContent className="sm:max-w-[400px]">
          <SheetHeader>
            <SheetTitle>Edit Team</SheetTitle>
            <SheetDescription>
              Update team details
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-6">
            <div className="space-y-2">
              <Label htmlFor="edit-team-name">Team Name</Label>
              <Input
                id="edit-team-name"
                value={editTeamForm.name}
                onChange={(e) => setEditTeamForm({ ...editTeamForm, name: e.target.value })}
                data-testid="input-edit-team-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-team-description">Description</Label>
              <Textarea
                id="edit-team-description"
                value={editTeamForm.description}
                onChange={(e) => setEditTeamForm({ ...editTeamForm, description: e.target.value })}
                data-testid="input-edit-team-description"
              />
            </div>
          </div>
          <SheetFooter>
            <Button 
              onClick={handleUpdateTeam} 
              disabled={updateTeamMutation.isPending || !editTeamForm.name}
              data-testid="button-update-team"
            >
              {updateTeamMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
