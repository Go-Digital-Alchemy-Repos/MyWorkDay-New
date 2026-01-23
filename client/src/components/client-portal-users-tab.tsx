import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Mail,
  MoreHorizontal,
  UserPlus,
  Trash2,
  Users,
  Eye,
  Edit3,
  Copy,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

interface ClientUser {
  id: string;
  userId: string;
  clientId: string;
  accessLevel: string;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
  };
}

interface ClientContact {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  title: string | null;
}

interface InviteFormData {
  email: string;
  firstName: string;
  lastName?: string;
  accessLevel: string;
}

const inviteSchema = z.object({
  email: z.string().email("Valid email is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  accessLevel: z.enum(["viewer", "collaborator"]),
});

interface ClientPortalUsersTabProps {
  clientId: string;
}

export function ClientPortalUsersTab({ clientId }: ClientPortalUsersTabProps) {
  const { toast } = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ClientContact | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const form = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      accessLevel: "viewer",
    },
  });

  const { data: portalUsers = [], isLoading: usersLoading } = useQuery<ClientUser[]>({
    queryKey: ["/api/clients", clientId, "users"],
    enabled: !!clientId,
  });

  const { data: contacts = [] } = useQuery<ClientContact[]>({
    queryKey: ["/api/clients", clientId, "contacts"],
    enabled: !!clientId,
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: InviteFormData) => {
      const res = await apiRequest("POST", `/api/clients/${clientId}/users/invite`, data);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.inviteLink) {
        setInviteLink(data.inviteLink);
      }
      toast({
        title: "Invitation sent",
        description: "The user has been invited to the client portal.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send invitation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateAccessMutation = useMutation({
    mutationFn: async ({ userId, accessLevel }: { userId: string; accessLevel: string }) => {
      const res = await apiRequest("PATCH", `/api/clients/${clientId}/users/${userId}`, { accessLevel });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Access updated",
        description: "The user's access level has been updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update access",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const revokeAccessMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("DELETE", `/api/clients/${clientId}/users/${userId}`);
    },
    onSuccess: () => {
      toast({
        title: "Access revoked",
        description: "The user no longer has access to this client portal.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to revoke access",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleInvite = (data: InviteFormData) => {
    inviteMutation.mutate(data);
  };

  const handleInviteContact = (contact: ClientContact) => {
    setSelectedContact(contact);
    form.reset({
      email: contact.email || "",
      firstName: contact.firstName,
      lastName: contact.lastName || "",
      accessLevel: "viewer",
    });
    setInviteOpen(true);
  };

  const handleCopyInviteLink = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      toast({
        title: "Link copied",
        description: "Invitation link copied to clipboard.",
      });
    }
  };

  const handleCloseInviteDialog = () => {
    setInviteOpen(false);
    setInviteLink(null);
    setSelectedContact(null);
    form.reset();
  };

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return email.charAt(0).toUpperCase();
  };

  const getAccessLevelBadge = (level: string) => {
    switch (level) {
      case "collaborator":
        return <Badge variant="default">Collaborator</Badge>;
      case "viewer":
      default:
        return <Badge variant="secondary">Viewer</Badge>;
    }
  };

  const uninvitedContacts = contacts.filter(
    (contact) =>
      contact.email &&
      !portalUsers.some((user) => user.user.email === contact.email)
  );

  if (usersLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Portal Users</h3>
          <p className="text-sm text-muted-foreground">
            Manage client users who can access the client portal to view projects and tasks.
          </p>
        </div>
        <Dialog open={inviteOpen} onOpenChange={handleCloseInviteDialog}>
          <DialogTrigger asChild>
            <Button data-testid="button-invite-portal-user">
              <UserPlus className="h-4 w-4 mr-2" />
              Invite User
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {inviteLink ? "Invitation Created" : "Invite Portal User"}
              </DialogTitle>
              <DialogDescription>
                {inviteLink
                  ? "Share this link with the user to complete their registration."
                  : "Invite a client contact to access the client portal."}
              </DialogDescription>
            </DialogHeader>

            {inviteLink ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Input value={inviteLink} readOnly className="flex-1" />
                  <Button variant="outline" size="icon" onClick={handleCopyInviteLink}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={handleCloseInviteDialog}>
                    Done
                  </Button>
                  <Button onClick={() => window.open(inviteLink, "_blank")}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open Link
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleInvite)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input placeholder="user@example.com" {...field} data-testid="input-invite-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input placeholder="John" {...field} data-testid="input-invite-firstName" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Doe" {...field} data-testid="input-invite-lastName" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="accessLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Access Level</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-invite-accessLevel">
                              <SelectValue placeholder="Select access level" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="viewer">
                              <div className="flex items-center gap-2">
                                <Eye className="h-4 w-4" />
                                <span>Viewer - View projects and tasks only</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="collaborator">
                              <div className="flex items-center gap-2">
                                <Edit3 className="h-4 w-4" />
                                <span>Collaborator - Add comments and feedback</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Viewers can see projects and tasks. Collaborators can also add comments.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={handleCloseInviteDialog}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={inviteMutation.isPending} data-testid="button-submit-invite">
                      {inviteMutation.isPending ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Mail className="h-4 w-4 mr-2" />
                          Send Invitation
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {uninvitedContacts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Quick Invite from Contacts</CardTitle>
            <CardDescription>
              Invite existing contacts with email addresses to the portal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {uninvitedContacts.slice(0, 5).map((contact) => (
                <Button
                  key={contact.id}
                  variant="outline"
                  size="sm"
                  onClick={() => handleInviteContact(contact)}
                  data-testid={`button-invite-contact-${contact.id}`}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {contact.firstName} {contact.lastName}
                </Button>
              ))}
              {uninvitedContacts.length > 5 && (
                <Badge variant="secondary" className="px-3">
                  +{uninvitedContacts.length - 5} more
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {portalUsers.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Current Portal Users</CardTitle>
              <Badge variant="secondary">{portalUsers.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {portalUsers.map((portalUser) => (
                <div
                  key={portalUser.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                  data-testid={`portal-user-${portalUser.userId}`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="text-xs">
                        {getInitials(portalUser.user.name, portalUser.user.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">
                        {portalUser.user.name || portalUser.user.email}
                      </div>
                      {portalUser.user.name && (
                        <div className="text-sm text-muted-foreground">
                          {portalUser.user.email}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getAccessLevelBadge(portalUser.accessLevel)}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`button-portal-user-menu-${portalUser.userId}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            updateAccessMutation.mutate({
                              userId: portalUser.userId,
                              accessLevel: portalUser.accessLevel === "viewer" ? "collaborator" : "viewer",
                            })
                          }
                        >
                          {portalUser.accessLevel === "viewer" ? (
                            <>
                              <Edit3 className="h-4 w-4 mr-2" />
                              Upgrade to Collaborator
                            </>
                          ) : (
                            <>
                              <Eye className="h-4 w-4 mr-2" />
                              Downgrade to Viewer
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => revokeAccessMutation.mutate(portalUser.userId)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Revoke Access
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-1">No Portal Users</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Invite client contacts to give them access to view their projects and tasks.
            </p>
            <Button onClick={() => setInviteOpen(true)} data-testid="button-invite-first-user">
              <UserPlus className="h-4 w-4 mr-2" />
              Invite First User
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
