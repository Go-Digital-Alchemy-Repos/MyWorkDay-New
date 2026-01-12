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
} from "lucide-react";
import type { ClientWithContacts, Project, ClientContact } from "@shared/schema";

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

export default function ClientDetailPage() {
  const [, params] = useRoute("/clients/:id");
  const clientId = params?.id;
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [editClientOpen, setEditClientOpen] = useState(false);

  const { data: client, isLoading } = useQuery<ClientWithContacts>({
    queryKey: ["/api/clients", clientId],
    enabled: !!clientId,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      setEditClientOpen(false);
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

  const handleCreateContact = (data: CreateContactForm) => {
    createContactMutation.mutate(data);
  };

  const handleUpdateClient = (data: UpdateClientForm) => {
    updateClientMutation.mutate(data);
  };

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
          </TabsContent>

          <TabsContent value="projects" className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium">Projects</h2>
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
                <p className="text-xs text-muted-foreground">
                  Create a project and assign it to this client to see it here.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
