import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
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
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  Plus,
  Building2,
  Mail,
  Phone,
  Globe,
  MapPin,
  FolderKanban,
  User,
  MoreHorizontal,
  Pencil,
  Trash2,
  Send,
  FileText,
  Link as LinkIcon,
  Search,
  Play,
  Layers,
  Users,
} from "lucide-react";
import { useLocation } from "wouter";
import { StartTimerDrawer } from "@/features/timer";
import { DivisionDrawer } from "@/features/clients";
import { useToast } from "@/hooks/use-toast";
import type { ClientWithContacts, Project, ClientContact, ClientDivision } from "@shared/schema";

interface DivisionWithCounts extends ClientDivision {
  memberCount: number;
  projectCount: number;
}

const createContactSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  title: z.string().optional(),
  isPrimary: z.boolean().default(false),
  notes: z.string().optional(),
});

type CreateContactForm = z.infer<typeof createContactSchema>;

const updateClientSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  displayName: z.string().optional(),
  status: z.enum(["active", "inactive", "prospect"]),
  industry: z.string().optional(),
  website: z.string().optional(),
  notes: z.string().optional(),
});

type UpdateClientForm = z.infer<typeof updateClientSchema>;

const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  description: z.string().optional(),
  color: z.string().default("#3B82F6"),
});

type CreateProjectForm = z.infer<typeof createProjectSchema>;

function EditContactForm({
  contact,
  onSubmit,
  onCancel,
  isPending,
}: {
  contact: ClientContact;
  onSubmit: (data: CreateContactForm) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const form = useForm<CreateContactForm>({
    resolver: zodResolver(createContactSchema),
    defaultValues: {
      firstName: contact.firstName || "",
      lastName: contact.lastName || "",
      email: contact.email || "",
      phone: contact.phone || "",
      title: contact.title || "",
      isPrimary: contact.isPrimary || false,
      notes: contact.notes || "",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First Name *</FormLabel>
                <FormControl>
                  <Input {...field} data-testid="input-edit-contact-first-name" />
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
                  <Input {...field} data-testid="input-edit-contact-last-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" {...field} data-testid="input-edit-contact-email" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone</FormLabel>
              <FormControl>
                <Input {...field} data-testid="input-edit-contact-phone" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Job Title</FormLabel>
              <FormControl>
                <Input {...field} data-testid="input-edit-contact-title" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending} data-testid="button-update-contact">
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default function ClientDetailPage() {
  const [, params] = useRoute("/clients/:id");
  const [, navigate] = useLocation();
  const clientId = params?.id;
  const { toast } = useToast();
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [editContactOpen, setEditContactOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ClientContact | null>(null);
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [timerDrawerOpen, setTimerDrawerOpen] = useState(false);
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [projectView, setProjectView] = useState<"options" | "create" | "assign">("options");
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [divisionDrawerOpen, setDivisionDrawerOpen] = useState(false);
  const [editingDivision, setEditingDivision] = useState<ClientDivision | null>(null);
  const [divisionMode, setDivisionMode] = useState<"create" | "edit">("create");

  const { data: client, isLoading } = useQuery<ClientWithContacts>({
    queryKey: ["/api/clients", clientId],
    enabled: !!clientId,
  });

  const { data: divisions = [] } = useQuery<DivisionWithCounts[]>({
    queryKey: ["/api/v1/clients", clientId, "divisions"],
    enabled: !!clientId,
  });

  const { data: unassignedProjects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects/unassigned", projectSearchQuery],
    enabled: addProjectOpen && projectView === "assign",
  });

  const createContactMutation = useMutation({
    mutationFn: async (data: CreateContactForm) => {
      return apiRequest("POST", `/api/clients/${clientId}/contacts`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId] });
      setAddContactOpen(false);
      contactForm.reset();
    },
  });

  const updateClientMutation = useMutation({
    mutationFn: async (data: UpdateClientForm) => {
      return apiRequest("PATCH", `/api/clients/${clientId}`, data);
    },
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey: ["/api/clients", clientId] });
      const previousClient = queryClient.getQueryData<ClientWithContacts>(["/api/clients", clientId]);
      if (previousClient) {
        queryClient.setQueryData<ClientWithContacts>(["/api/clients", clientId], {
          ...previousClient,
          companyName: newData.companyName,
          displayName: newData.displayName || null,
          status: newData.status,
          industry: newData.industry || null,
          notes: newData.notes || null,
        });
      }
      return { previousClient };
    },
    onError: (err, _newData, context) => {
      if (context?.previousClient) {
        queryClient.setQueryData(["/api/clients", clientId], context.previousClient);
      }
      toast({ title: "Failed to update client", variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: "Client updated successfully" });
      setEditClientOpen(false);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: string) => {
      return apiRequest("DELETE", `/api/clients/${clientId}/contacts/${contactId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId] });
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: async ({ contactId, data }: { contactId: string; data: CreateContactForm }) => {
      return apiRequest("PATCH", `/api/clients/${clientId}/contacts/${contactId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId] });
      setEditContactOpen(false);
      setEditingContact(null);
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: CreateProjectForm) => {
      const response = await apiRequest("POST", `/api/clients/${clientId}/projects`, data);
      return response.json() as Promise<Project>;
    },
    onSuccess: (project: Project) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/projects"] });
      setAddProjectOpen(false);
      setProjectView("options");
      projectForm.reset();
      navigate(`/projects/${project.id}`);
    },
  });

  const assignProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      return apiRequest("PATCH", `/api/projects/${projectId}/client`, { clientId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/unassigned"] });
      setAddProjectOpen(false);
      setProjectView("options");
    },
  });

  const contactForm = useForm<CreateContactForm>({
    resolver: zodResolver(createContactSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      title: "",
      isPrimary: false,
      notes: "",
    },
  });

  const clientForm = useForm<UpdateClientForm>({
    resolver: zodResolver(updateClientSchema),
    values: client ? {
      companyName: client.companyName,
      displayName: client.displayName || "",
      status: client.status as "active" | "inactive" | "prospect",
      industry: client.industry || "",
      website: client.website || "",
      notes: client.notes || "",
    } : undefined,
  });

  const projectForm = useForm<CreateProjectForm>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      name: "",
      description: "",
      color: "#3B82F6",
    },
  });

  const handleCreateContact = (data: CreateContactForm) => {
    createContactMutation.mutate(data);
  };

  const handleUpdateClient = (data: UpdateClientForm) => {
    updateClientMutation.mutate(data);
  };

  const handleCreateProject = (data: CreateProjectForm) => {
    createProjectMutation.mutate(data);
  };

  const handleAssignProject = (projectId: string) => {
    assignProjectMutation.mutate(projectId);
  };

  const handleCloseProjectSheet = () => {
    setAddProjectOpen(false);
    setProjectView("options");
    setProjectSearchQuery("");
    projectForm.reset();
  };

  const filteredUnassignedProjects = unassignedProjects.filter(
    (p) => p.name.toLowerCase().includes(projectSearchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500/10 text-green-600 dark:text-green-400";
      case "inactive":
        return "bg-gray-500/10 text-gray-600 dark:text-gray-400";
      case "prospect":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
      default:
        return "bg-gray-500/10 text-gray-600";
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center gap-4 px-6 py-4 border-b border-border shrink-0">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="flex-1 overflow-auto p-6">
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Building2 className="h-16 w-16 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium mb-2">Client not found</h3>
        <Link href="/clients">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Clients
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/clients">
            <Button variant="ghost" size="icon" data-testid="button-back-to-clients">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary/10 text-primary">
                {getInitials(client.companyName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-xl font-semibold text-foreground" data-testid="text-client-name">
                {client.companyName}
              </h1>
              {client.displayName && (
                <p className="text-sm text-muted-foreground">{client.displayName}</p>
              )}
            </div>
            <Badge className={getStatusColor(client.status)}>
              {client.status}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="default" 
            onClick={() => setTimerDrawerOpen(true)}
            data-testid="button-start-timer-client"
          >
            <Play className="h-4 w-4 mr-2" />
            Start Timer
          </Button>
          <Dialog open={editClientOpen} onOpenChange={setEditClientOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-edit-client">
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Client</DialogTitle>
              </DialogHeader>
              <Form {...clientForm}>
                <form onSubmit={clientForm.handleSubmit(handleUpdateClient)} className="space-y-4">
                  <FormField
                    control={clientForm.control}
                    name="companyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Name *</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-edit-company-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={clientForm.control}
                    name="displayName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display Name</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-edit-display-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={clientForm.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-edit-status">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                            <SelectItem value="prospect">Prospect</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={clientForm.control}
                    name="industry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Industry</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-edit-industry" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={clientForm.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Website</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-edit-website" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-end gap-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditClientOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={updateClientMutation.isPending}
                      data-testid="button-save-client"
                    >
                      {updateClientMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <Tabs defaultValue="overview" className="h-full">
          <div className="px-6 pt-4 border-b border-border">
            <TabsList>
              <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
              <TabsTrigger value="contacts" data-testid="tab-contacts">
                Contacts ({client.contacts?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="projects" data-testid="tab-projects">
                Projects ({client.projects?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="divisions" data-testid="tab-divisions">
                Divisions ({divisions.length})
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="p-6 space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Company Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {client.industry && (
                    <div className="flex items-start gap-3">
                      <Building2 className="h-4 w-4 mt-0.5 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Industry</p>
                        <p className="text-sm">{client.industry}</p>
                      </div>
                    </div>
                  )}
                  {client.website && (
                    <div className="flex items-start gap-3">
                      <Globe className="h-4 w-4 mt-0.5 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Website</p>
                        <a
                          href={client.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          {client.website}
                        </a>
                      </div>
                    </div>
                  )}
                  {!client.industry && !client.website && (
                    <p className="text-sm text-muted-foreground">No details added yet.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Quick Stats</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <p className="text-2xl font-semibold">{client.projects?.length || 0}</p>
                    <p className="text-xs text-muted-foreground">Projects</p>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <p className="text-2xl font-semibold">{client.contacts?.length || 0}</p>
                    <p className="text-xs text-muted-foreground">Contacts</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {client.notes && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{client.notes}</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="contacts" className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium">Contacts</h2>
              <Dialog open={addContactOpen} onOpenChange={setAddContactOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-contact">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Contact
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Contact</DialogTitle>
                  </DialogHeader>
                  <Form {...contactForm}>
                    <form onSubmit={contactForm.handleSubmit(handleCreateContact)} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={contactForm.control}
                          name="firstName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>First Name *</FormLabel>
                              <FormControl>
                                <Input {...field} data-testid="input-contact-first-name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={contactForm.control}
                          name="lastName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Last Name</FormLabel>
                              <FormControl>
                                <Input {...field} data-testid="input-contact-last-name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={contactForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input type="email" {...field} data-testid="input-contact-email" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={contactForm.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-contact-phone" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={contactForm.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Job Title</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-contact-title" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-end gap-2 pt-4">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setAddContactOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={createContactMutation.isPending}
                          data-testid="button-save-contact"
                        >
                          {createContactMutation.isPending ? "Adding..." : "Add Contact"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>

            {client.contacts && client.contacts.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {client.contacts.map((contact) => (
                  <Card key={contact.id} data-testid={`card-contact-${contact.id}`}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-muted text-muted-foreground">
                              {contact.firstName?.[0]}{contact.lastName?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">
                              {contact.firstName} {contact.lastName}
                              {contact.isPrimary && (
                                <Badge variant="outline" className="ml-2 text-xs">Primary</Badge>
                              )}
                            </p>
                            {contact.title && (
                              <p className="text-xs text-muted-foreground">{contact.title}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              setEditingContact(contact);
                              setEditContactOpen(true);
                            }}
                            data-testid={`button-edit-contact-${contact.id}`}
                          >
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => deleteContactMutation.mutate(contact.id)}
                            data-testid={`button-delete-contact-${contact.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-3 space-y-2">
                        {contact.email && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Mail className="h-3.5 w-3.5" />
                            <a href={`mailto:${contact.email}`} className="hover:text-foreground">
                              {contact.email}
                            </a>
                          </div>
                        )}
                        {contact.phone && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone className="h-3.5 w-3.5" />
                            <span>{contact.phone}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <User className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground mb-4">No contacts added yet</p>
                <Button onClick={() => setAddContactOpen(true)} variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Contact
                </Button>
              </div>
            )}

            <Dialog 
              open={editContactOpen} 
              onOpenChange={(open) => {
                setEditContactOpen(open);
                if (!open) setEditingContact(null);
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Contact</DialogTitle>
                </DialogHeader>
                {editingContact && (
                  <EditContactForm 
                    key={editingContact.id}
                    contact={editingContact}
                    onSubmit={(data) => updateContactMutation.mutate({ contactId: editingContact.id, data })}
                    onCancel={() => {
                      setEditContactOpen(false);
                      setEditingContact(null);
                    }}
                    isPending={updateContactMutation.isPending}
                  />
                )}
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="projects" className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium">Projects</h2>
              <Button onClick={() => setAddProjectOpen(true)} data-testid="button-add-project">
                <Plus className="h-4 w-4 mr-2" />
                Add New Project
              </Button>
            </div>

            {client.projects && client.projects.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {client.projects.map((project) => (
                  <Link key={project.id} href={`/projects/${project.id}`}>
                    <Card className="cursor-pointer hover-elevate" data-testid={`card-project-${project.id}`}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded-sm"
                            style={{ backgroundColor: project.color || "#3B82F6" }}
                          />
                          <CardTitle className="text-base">{project.name}</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {project.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {project.description}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FolderKanban className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground mb-4">No projects linked to this client</p>
                <Button onClick={() => setAddProjectOpen(true)} variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Project
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="divisions" className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium">Divisions</h2>
              <Button
                onClick={() => {
                  setEditingDivision(null);
                  setDivisionMode("create");
                  setDivisionDrawerOpen(true);
                }}
                data-testid="button-add-division"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Division
              </Button>
            </div>

            {divisions.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {divisions.map((division) => (
                  <Card
                    key={division.id}
                    className="cursor-pointer hover-elevate"
                    onClick={() => {
                      setEditingDivision(division);
                      setDivisionMode("edit");
                      setDivisionDrawerOpen(true);
                    }}
                    data-testid={`card-division-${division.id}`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded-sm shrink-0"
                            style={{ backgroundColor: division.color || "#3B82F6" }}
                          />
                          <CardTitle className="text-base truncate">{division.name}</CardTitle>
                        </div>
                        {!division.isActive && (
                          <Badge variant="outline" className="shrink-0">Inactive</Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {division.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                          {division.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          <span>{division.memberCount} members</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <FolderKanban className="h-3.5 w-3.5" />
                          <span>{division.projectCount} projects</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Layers className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground mb-4">No divisions created yet</p>
                <p className="text-xs text-muted-foreground mb-4 max-w-md">
                  Divisions help you organize teams and projects within this client for better access control.
                </p>
                <Button
                  onClick={() => {
                    setEditingDivision(null);
                    setDivisionMode("create");
                    setDivisionDrawerOpen(true);
                  }}
                  variant="outline"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Division
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <DivisionDrawer
        open={divisionDrawerOpen}
        onOpenChange={setDivisionDrawerOpen}
        clientId={clientId || ""}
        division={editingDivision}
        mode={divisionMode}
      />

      <Sheet open={addProjectOpen} onOpenChange={handleCloseProjectSheet}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {projectView === "options" && "Add Project"}
              {projectView === "create" && "Start a New Project"}
              {projectView === "assign" && "Assign Existing Project"}
            </SheetTitle>
            <SheetDescription>
              {projectView === "options" && "Create a new project or assign an existing one to this client."}
              {projectView === "create" && "Create a new project that will be automatically linked to this client."}
              {projectView === "assign" && "Select an unassigned project to link to this client."}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6">
            {projectView === "options" && (
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start h-auto p-4"
                  onClick={() => setProjectView("create")}
                  data-testid="button-create-new-project"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium">Start a New Project</p>
                      <p className="text-xs text-muted-foreground">
                        Create a fresh project for this client
                      </p>
                    </div>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start h-auto p-4"
                  onClick={() => setProjectView("assign")}
                  data-testid="button-assign-existing-project"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <LinkIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium">Assign an Existing Project</p>
                      <p className="text-xs text-muted-foreground">
                        Link an unassigned project to this client
                      </p>
                    </div>
                  </div>
                </Button>
              </div>
            )}

            {projectView === "create" && (
              <Form {...projectForm}>
                <form onSubmit={projectForm.handleSubmit(handleCreateProject)} className="space-y-4">
                  <FormField
                    control={projectForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="Website Redesign" {...field} data-testid="input-project-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={projectForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Brief description of the project" 
                            {...field} 
                            data-testid="input-project-description" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={projectForm.control}
                    name="color"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Color</FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            {["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"].map((color) => (
                              <button
                                key={color}
                                type="button"
                                className={`h-8 w-8 rounded-md border-2 ${field.value === color ? "border-foreground" : "border-transparent"}`}
                                style={{ backgroundColor: color }}
                                onClick={() => field.onChange(color)}
                                data-testid={`button-color-${color.slice(1)}`}
                              />
                            ))}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-between pt-4">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setProjectView("options")}
                    >
                      Back
                    </Button>
                    <Button
                      type="submit"
                      disabled={createProjectMutation.isPending}
                      data-testid="button-submit-create-project"
                    >
                      {createProjectMutation.isPending ? "Creating..." : "Create Project"}
                    </Button>
                  </div>
                </form>
              </Form>
            )}

            {projectView === "assign" && (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search projects..."
                    value={projectSearchQuery}
                    onChange={(e) => setProjectSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-unassigned-projects"
                  />
                </div>

                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {filteredUnassignedProjects.length > 0 ? (
                    filteredUnassignedProjects.map((project) => (
                      <div
                        key={project.id}
                        className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer"
                        onClick={() => handleAssignProject(project.id)}
                        data-testid={`button-assign-project-${project.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="h-3 w-3 rounded-sm"
                            style={{ backgroundColor: project.color || "#3B82F6" }}
                          />
                          <div>
                            <p className="font-medium text-sm">{project.name}</p>
                            {project.description && (
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {project.description}
                              </p>
                            )}
                          </div>
                        </div>
                        <Plus className="h-4 w-4 text-muted-foreground" />
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <FolderKanban className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {projectSearchQuery ? "No matching projects found" : "No unassigned projects available"}
                      </p>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setProjectView("options")}
                  >
                    Back
                  </Button>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <StartTimerDrawer
        open={timerDrawerOpen}
        onOpenChange={setTimerDrawerOpen}
        initialClientId={clientId}
      />
    </div>
  );
}
