import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCrmFlags } from "@/hooks/use-crm-flags";
import { formatErrorForToast } from "@/lib/parseApiError";
import { formatDistanceToNow, format } from "date-fns";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PageShell,
  PageHeader,
  EmptyState,
  LoadingState,
} from "@/components/layout";
import {
  ArrowLeft,
  Building2,
  FolderKanban,
  Users,
  StickyNote,
  FileText,
  BarChart3,
  Activity,
  Plus,
  Mail,
  Phone,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Star,
  MoreHorizontal,
  Pencil,
  Trash2,
  Send,
  Upload,
  MessageSquare,
  Loader2,
  User,
  Target,
  Briefcase,
} from "lucide-react";
import { RichTextEditor, RichTextViewer } from "@/components/ui/rich-text-editor";

interface CrmSummary {
  client: {
    id: string;
    companyName: string;
    displayName: string | null;
    email: string | null;
    phone: string | null;
    status: string;
    industry: string | null;
  };
  crm: {
    clientId: string;
    tenantId: string;
    status: string;
    ownerUserId: string | null;
    tags: string[] | null;
    lastContactAt: string | null;
    nextFollowUpAt: string | null;
    followUpNotes: string | null;
  } | null;
  counts: {
    projects: number;
    openTasks: number;
    totalHours: number;
    billableHours: number;
  };
}

interface CrmContact {
  id: string;
  clientId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  isPrimary: boolean;
  notes: string | null;
  createdAt: string;
}

interface CrmNote {
  id: string;
  clientId: string;
  body: any;
  category: string;
  authorUserId: string;
  authorName: string | null;
  authorEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

const contactFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  title: z.string().optional(),
  isPrimary: z.boolean().default(false),
  notes: z.string().optional(),
});

type ContactFormValues = z.infer<typeof contactFormSchema>;

const CRM_STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  lead: { label: "Lead", variant: "outline" },
  prospect: { label: "Prospect", variant: "secondary" },
  active: { label: "Active", variant: "default" },
  past: { label: "Past", variant: "outline" },
  on_hold: { label: "On Hold", variant: "secondary" },
};

function OverviewTab({ clientId, summary, isLoading, onNavigateTab }: { clientId: string; summary?: CrmSummary; isLoading: boolean; onNavigateTab: (tab: string) => void }) {
  const crmFlags = useCrmFlags();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!summary) return null;

  const crmStatus = summary.crm?.status || "none";
  const statusInfo = CRM_STATUS_MAP[crmStatus];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card data-testid="card-crm-status">
          <CardContent className="pt-5 pb-4 px-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Pipeline Status</span>
            </div>
            {statusInfo ? (
              <Badge variant={statusInfo.variant} data-testid="badge-crm-status">{statusInfo.label}</Badge>
            ) : (
              <span className="text-sm text-muted-foreground" data-testid="text-crm-status-none">Not set</span>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-crm-owner">
          <CardContent className="pt-5 pb-4 px-4">
            <div className="flex items-center gap-2 mb-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Owner</span>
            </div>
            <span className="text-sm font-medium" data-testid="text-crm-owner">
              {summary.crm?.ownerUserId ? "Assigned" : "Unassigned"}
            </span>
          </CardContent>
        </Card>

        <Card data-testid="card-crm-followup">
          <CardContent className="pt-5 pb-4 px-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Next Follow-up</span>
            </div>
            <span className="text-sm font-medium" data-testid="text-crm-followup">
              {summary.crm?.nextFollowUpAt
                ? format(new Date(summary.crm.nextFollowUpAt), "MMM d, yyyy")
                : "Not scheduled"}
            </span>
          </CardContent>
        </Card>

        <Card data-testid="card-open-projects">
          <CardContent className="pt-5 pb-4 px-4">
            <div className="flex items-center gap-2 mb-2">
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Open Projects</span>
            </div>
            <span className="text-2xl font-semibold" data-testid="text-open-projects">{summary.counts.projects}</span>
          </CardContent>
        </Card>

        <Card data-testid="card-open-tasks">
          <CardContent className="pt-5 pb-4 px-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Open Tasks</span>
            </div>
            <span className="text-2xl font-semibold" data-testid="text-open-tasks">{summary.counts.openTasks}</span>
          </CardContent>
        </Card>

        <Card data-testid="card-hours-tracked">
          <CardContent className="pt-5 pb-4 px-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Hours Tracked</span>
            </div>
            <div data-testid="text-hours-tracked">
              <span className="text-2xl font-semibold">{summary.counts.totalHours.toFixed(1)}</span>
              {summary.counts.billableHours > 0 && (
                <span className="text-xs text-muted-foreground ml-1">
                  ({summary.counts.billableHours.toFixed(1)} billable)
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Link href={`/clients/${clientId}`}>
              <Button variant="outline" size="sm" data-testid="button-quick-add-project">
                <FolderKanban className="h-4 w-4 mr-2" />
                Add Project
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => onNavigateTab("contacts")} data-testid="button-quick-add-contact">
              <Users className="h-4 w-4 mr-2" />
              Add Contact
            </Button>
            <Button variant="outline" size="sm" onClick={() => onNavigateTab("notes")} data-testid="button-quick-add-note">
              <StickyNote className="h-4 w-4 mr-2" />
              Add Note
            </Button>
            {crmFlags.clientMessaging && (
              <Button variant="outline" size="sm" data-testid="button-quick-message-client">
                <MessageSquare className="h-4 w-4 mr-2" />
                Message Client
              </Button>
            )}
            {crmFlags.files && (
              <Button variant="outline" size="sm" data-testid="button-quick-upload-file">
                <Upload className="h-4 w-4 mr-2" />
                Upload File
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {summary.crm?.followUpNotes && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Follow-up Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground" data-testid="text-followup-notes">{summary.crm.followUpNotes}</p>
          </CardContent>
        </Card>
      )}

      {summary.crm?.tags && summary.crm.tags.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2" data-testid="container-crm-tags">
              {summary.crm.tags.map((tag) => (
                <Badge key={tag} variant="secondary">{tag}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ContactsTab({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<CrmContact | null>(null);
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null);

  const { data: contacts = [], isLoading } = useQuery<CrmContact[]>({
    queryKey: [`/api/crm/clients/${clientId}/contacts`],
    enabled: !!clientId,
  });

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
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

  const createContactMutation = useMutation({
    mutationFn: async (data: ContactFormValues) => {
      return apiRequest("POST", `/api/crm/clients/${clientId}/contacts`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/crm/clients/${clientId}/contacts`] });
      queryClient.invalidateQueries({ queryKey: [`/api/crm/clients/${clientId}/summary`] });
      setDrawerOpen(false);
      setEditingContact(null);
      form.reset();
      toast({ title: "Contact created" });
    },
    onError: (error) => {
      toast(formatErrorForToast(error));
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ContactFormValues> }) => {
      return apiRequest("PATCH", `/api/crm/contacts/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/crm/clients/${clientId}/contacts`] });
      setDrawerOpen(false);
      setEditingContact(null);
      form.reset();
      toast({ title: "Contact updated" });
    },
    onError: (error) => {
      toast(formatErrorForToast(error));
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/crm/contacts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/crm/clients/${clientId}/contacts`] });
      queryClient.invalidateQueries({ queryKey: [`/api/crm/clients/${clientId}/summary`] });
      setDeleteContactId(null);
      toast({ title: "Contact deleted" });
    },
    onError: (error) => {
      toast(formatErrorForToast(error));
    },
  });

  const markPrimaryMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/crm/contacts/${id}`, { isPrimary: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/crm/clients/${clientId}/contacts`] });
      toast({ title: "Primary contact updated" });
    },
    onError: (error) => {
      toast(formatErrorForToast(error));
    },
  });

  function openEditDrawer(contact: CrmContact) {
    setEditingContact(contact);
    form.reset({
      firstName: contact.firstName || "",
      lastName: contact.lastName || "",
      email: contact.email || "",
      phone: contact.phone || "",
      title: contact.title || "",
      isPrimary: contact.isPrimary || false,
      notes: contact.notes || "",
    });
    setDrawerOpen(true);
  }

  function openCreateDrawer() {
    setEditingContact(null);
    form.reset({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      title: "",
      isPrimary: false,
      notes: "",
    });
    setDrawerOpen(true);
  }

  function handleSubmit(data: ContactFormValues) {
    if (editingContact) {
      updateContactMutation.mutate({ id: editingContact.id, data });
    } else {
      createContactMutation.mutate(data);
    }
  }

  if (isLoading) {
    return <LoadingState type="list" rows={3} />;
  }

  const isPending = createContactMutation.isPending || updateContactMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h3 className="text-base font-medium">Contacts ({contacts.length})</h3>
        <Button size="sm" onClick={openCreateDrawer} data-testid="button-add-contact-360">
          <Plus className="h-4 w-4 mr-2" />
          Add Contact
        </Button>
      </div>

      {contacts.length === 0 ? (
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title="No contacts yet"
          description="Add contacts to keep track of key people at this client."
          action={
            <Button size="sm" onClick={openCreateDrawer} data-testid="button-add-first-contact-360">
              <Plus className="h-4 w-4 mr-2" />
              Add Contact
            </Button>
          }
          size="sm"
        />
      ) : (
        <div className="space-y-2">
          {contacts.map((contact) => (
            <Card key={contact.id} data-testid={`card-contact-${contact.id}`}>
              <CardContent className="py-4 px-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className="text-xs">
                        {(contact.firstName?.[0] || "").toUpperCase()}{(contact.lastName?.[0] || "").toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium" data-testid={`text-contact-name-${contact.id}`}>
                          {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unnamed"}
                        </span>
                        {contact.isPrimary && (
                          <Badge variant="default" className="text-xs" data-testid={`badge-primary-${contact.id}`}>
                            <Star className="h-3 w-3 mr-1" />
                            Primary
                          </Badge>
                        )}
                      </div>
                      {contact.title && (
                        <p className="text-xs text-muted-foreground">{contact.title}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {contact.email && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {contact.email}
                          </span>
                        )}
                        {contact.phone && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {contact.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" data-testid={`button-contact-menu-${contact.id}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDrawer(contact)} data-testid={`button-edit-contact-${contact.id}`}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      {!contact.isPrimary && (
                        <DropdownMenuItem onClick={() => markPrimaryMutation.mutate(contact.id)} data-testid={`button-mark-primary-${contact.id}`}>
                          <Star className="h-4 w-4 mr-2" />
                          Mark as Primary
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeleteContactId(contact.id)}
                        data-testid={`button-delete-contact-${contact.id}`}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Sheet open={drawerOpen} onOpenChange={(open) => { if (!open) { setDrawerOpen(false); setEditingContact(null); } }}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingContact ? "Edit Contact" : "Add Contact"}</SheetTitle>
            <SheetDescription>
              {editingContact ? "Update contact details." : "Add a new contact for this client."}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name *</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-360-contact-first-name" />
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
                          <Input {...field} data-testid="input-360-contact-last-name" />
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
                        <Input type="email" {...field} data-testid="input-360-contact-email" />
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
                        <Input {...field} data-testid="input-360-contact-phone" />
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
                        <Input {...field} data-testid="input-360-contact-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} data-testid="input-360-contact-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isPrimary"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={field.onChange}
                          className="h-4 w-4 rounded border-border"
                          data-testid="checkbox-360-contact-primary"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Primary Contact</FormLabel>
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { setDrawerOpen(false); setEditingContact(null); }}
                    data-testid="button-cancel-contact-360"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isPending} data-testid="button-save-contact-360">
                    {isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      editingContact ? "Save Changes" : "Add Contact"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteContactId} onOpenChange={(open) => { if (!open) setDeleteContactId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The contact will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-contact-360">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteContactId && deleteContactMutation.mutate(deleteContactId)}
              disabled={deleteContactMutation.isPending}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-contact-360"
            >
              {deleteContactMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NotesTab({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const [noteBody, setNoteBody] = useState("");
  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);

  const { data: notes = [], isLoading } = useQuery<CrmNote[]>({
    queryKey: [`/api/crm/clients/${clientId}/notes`],
    enabled: !!clientId,
  });

  const createNoteMutation = useMutation({
    mutationFn: async (body: string) => {
      return apiRequest("POST", `/api/crm/clients/${clientId}/notes`, { body });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/crm/clients/${clientId}/notes`] });
      setNoteBody("");
      toast({ title: "Note added" });
    },
    onError: (error) => {
      toast(formatErrorForToast(error));
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      return apiRequest("DELETE", `/api/crm/notes/${noteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/crm/clients/${clientId}/notes`] });
      setDeleteNoteId(null);
      toast({ title: "Note deleted" });
    },
    onError: (error) => {
      toast(formatErrorForToast(error));
    },
  });

  function handleCreateNote() {
    if (!noteBody || noteBody.trim() === "" || noteBody === "<p></p>") return;
    createNoteMutation.mutate(noteBody);
  }

  if (isLoading) {
    return <LoadingState type="list" rows={3} />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="space-y-3">
            <RichTextEditor
              value={noteBody}
              onChange={setNoteBody}
              placeholder="Write a note..."
              minHeight="80px"
              showToolbar={true}
              data-testid="editor-360-note"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleCreateNote}
                disabled={createNoteMutation.isPending || !noteBody || noteBody.trim() === "" || noteBody === "<p></p>"}
                data-testid="button-add-note-360"
              >
                {createNoteMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Posting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Post Note
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {notes.length === 0 ? (
        <EmptyState
          icon={<StickyNote className="h-10 w-10" />}
          title="No notes yet"
          description="Add notes to keep track of important information about this client."
          size="sm"
        />
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <Card key={note.id} data-testid={`card-note-${note.id}`}>
              <CardContent className="py-4 px-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="text-xs">
                        {(note.authorName?.[0] || note.authorEmail?.[0] || "?").toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-medium" data-testid={`text-note-author-${note.id}`}>
                          {note.authorName || note.authorEmail || "Unknown"}
                        </span>
                        <span className="text-xs text-muted-foreground" data-testid={`text-note-date-${note.id}`}>
                          {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                        </span>
                        {note.category && note.category !== "general" && (
                          <Badge variant="secondary" className="text-xs">{note.category}</Badge>
                        )}
                      </div>
                      <div className="text-sm" data-testid={`text-note-body-${note.id}`}>
                        {typeof note.body === "string" ? (
                          <RichTextViewer content={note.body} />
                        ) : (
                          <pre className="whitespace-pre-wrap text-sm">{JSON.stringify(note.body)}</pre>
                        )}
                      </div>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" data-testid={`button-note-menu-${note.id}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeleteNoteId(note.id)}
                        data-testid={`button-delete-note-${note.id}`}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteNoteId} onOpenChange={(open) => { if (!open) setDeleteNoteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Note</AlertDialogTitle>
            <AlertDialogDescription>
              This note will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-note-360">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteNoteId && deleteNoteMutation.mutate(deleteNoteId)}
              disabled={deleteNoteMutation.isPending}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-note-360"
            >
              {deleteNoteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface ActivityEvent {
  id: string;
  type: string;
  entityId: string;
  summary: string;
  actorUserId: string | null;
  actorName: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
}

const activityTypeLabels: Record<string, { label: string; color: string }> = {
  project: { label: "Project", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  task: { label: "Task", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  time_entry: { label: "Time", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  comment: { label: "Comment", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  file: { label: "File", color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200" },
};

function ActivityTab({ clientId }: { clientId: string }) {
  const [typeFilter, setTypeFilter] = useState<string>("");

  const url = typeFilter
    ? `/api/crm/clients/${clientId}/activity?type=${typeFilter}`
    : `/api/crm/clients/${clientId}/activity`;

  const { data: events, isLoading } = useQuery<ActivityEvent[]>({
    queryKey: [url],
    enabled: !!clientId,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const types = ["project", "task", "time_entry", "comment", "file"];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap" data-testid="activity-type-filters">
        <Button
          size="sm"
          variant={typeFilter === "" ? "default" : "outline"}
          onClick={() => setTypeFilter("")}
          data-testid="filter-activity-all"
        >
          All
        </Button>
        {types.map((t) => (
          <Button
            key={t}
            size="sm"
            variant={typeFilter === t ? "default" : "outline"}
            onClick={() => setTypeFilter(t)}
            data-testid={`filter-activity-${t}`}
          >
            {activityTypeLabels[t]?.label || t}
          </Button>
        ))}
      </div>

      {(!events || events.length === 0) ? (
        <EmptyState
          icon={<Activity className="h-10 w-10" />}
          title="No Activity"
          description="No activity events found for this client."
          size="sm"
        />
      ) : (
        <div className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-0">
            {events.map((event) => {
              const typeInfo = activityTypeLabels[event.type] || { label: event.type, color: "bg-muted text-muted-foreground" };
              return (
                <div
                  key={event.id}
                  className="relative flex items-start gap-4 py-3 pl-10"
                  data-testid={`activity-event-${event.id}`}
                >
                  <div className="absolute left-3 top-4 h-4 w-4 rounded-full border-2 border-background bg-muted" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className={`text-xs ${typeInfo.color}`}>
                        {typeInfo.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm mt-1">{event.summary}</p>
                    {event.actorName && (
                      <p className="text-xs text-muted-foreground mt-0.5">by {event.actorName}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface ClientFileItem {
  id: string;
  filename: string;
  mimeType: string | null;
  size: number | null;
  url: string | null;
  visibility: string;
  linkedEntityType: string | null;
  linkedEntityId: string | null;
  uploadedByUserId: string;
  uploaderName: string | null;
  createdAt: string;
}

function FilesTab({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const [visibilityFilter, setVisibilityFilter] = useState<string>("");

  const url = visibilityFilter
    ? `/api/crm/clients/${clientId}/files?visibility=${visibilityFilter}`
    : `/api/crm/clients/${clientId}/files`;

  const { data: files, isLoading } = useQuery<ClientFileItem[]>({
    queryKey: [url],
    enabled: !!clientId,
  });

  const toggleVisibilityMutation = useMutation({
    mutationFn: async ({ fileId, visibility }: { fileId: string; visibility: string }) => {
      await apiRequest("PATCH", `/api/crm/files/${fileId}`, { visibility });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [url] });
      toast({ title: "File visibility updated" });
    },
    onError: (error: Error) => {
      const { title, description } = formatErrorForToast(error);
      toast({ title, description, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (fileId: string) => {
      await apiRequest("DELETE", `/api/crm/files/${fileId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [url] });
      toast({ title: "File deleted" });
    },
    onError: (error: Error) => {
      const { title, description } = formatErrorForToast(error);
      toast({ title, description, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  function formatFileSize(bytes: number | null): string {
    if (!bytes) return "Unknown";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant={visibilityFilter === "" ? "default" : "outline"}
          onClick={() => setVisibilityFilter("")}
          data-testid="filter-files-all"
        >
          All Files
        </Button>
        <Button
          size="sm"
          variant={visibilityFilter === "internal" ? "default" : "outline"}
          onClick={() => setVisibilityFilter("internal")}
          data-testid="filter-files-internal"
        >
          Internal Only
        </Button>
        <Button
          size="sm"
          variant={visibilityFilter === "client" ? "default" : "outline"}
          onClick={() => setVisibilityFilter("client")}
          data-testid="filter-files-client"
        >
          Client Visible
        </Button>
      </div>

      {(!files || files.length === 0) ? (
        <EmptyState
          icon={<FileText className="h-10 w-10" />}
          title="No Files"
          description="No files have been uploaded for this client yet."
          size="sm"
        />
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <Card key={file.id} data-testid={`file-item-${file.id}`}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center h-10 w-10 rounded-md bg-muted">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.filename}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatFileSize(file.size)}</span>
                      <span>by {file.uploaderName || "Unknown"}</span>
                      <span>{formatDistanceToNow(new Date(file.createdAt), { addSuffix: true })}</span>
                    </div>
                  </div>
                  <Badge
                    variant={file.visibility === "client" ? "default" : "secondary"}
                    data-testid={`file-visibility-${file.id}`}
                  >
                    {file.visibility === "client" ? "Client" : "Internal"}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" data-testid={`file-actions-${file.id}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() =>
                          toggleVisibilityMutation.mutate({
                            fileId: file.id,
                            visibility: file.visibility === "client" ? "internal" : "client",
                          })
                        }
                        data-testid={`toggle-visibility-${file.id}`}
                      >
                        {file.visibility === "client" ? "Make Internal" : "Make Client Visible"}
                      </DropdownMenuItem>
                      {file.url && (
                        <DropdownMenuItem
                          onClick={() => {
                            navigator.clipboard.writeText(file.url!);
                            toast({ title: "Link copied" });
                          }}
                          data-testid={`copy-link-${file.id}`}
                        >
                          Copy Link
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => deleteMutation.mutate(file.id)}
                        className="text-destructive"
                        data-testid={`delete-file-${file.id}`}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function PlaceholderTab({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      size="md"
    />
  );
}

export default function Client360Page() {
  const [, params] = useRoute("/clients/:id/360");
  const clientId = params?.id;
  const crmFlags = useCrmFlags();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: summary, isLoading } = useQuery<CrmSummary>({
    queryKey: [`/api/crm/clients/${clientId}/summary`],
    enabled: !!clientId && crmFlags.client360,
  });

  if (!crmFlags.client360) {
    return (
      <PageShell>
        <EmptyState
          icon={<AlertCircle className="h-12 w-12" />}
          title="Client 360 is not enabled"
          description="This feature is currently disabled. Contact your administrator to enable it."
          action={
            <Link href="/clients">
              <Button variant="outline" data-testid="button-back-to-clients">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Clients
              </Button>
            </Link>
          }
        />
      </PageShell>
    );
  }

  if (isLoading) {
    return (
      <PageShell>
        <LoadingState type="detail" />
      </PageShell>
    );
  }

  const clientName = summary?.client?.companyName || "Client";

  return (
    <PageShell noPadding>
      <div className="flex flex-col h-full">
        <div className="px-6 pt-5 pb-0">
          <PageHeader
            breadcrumbs={
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Link href="/clients" className="hover:text-foreground transition-colors" data-testid="link-breadcrumb-clients">
                  Clients
                </Link>
                <span>/</span>
                <Link href={`/clients/${clientId}`} className="hover:text-foreground transition-colors" data-testid="link-breadcrumb-client-detail">
                  {clientName}
                </Link>
                <span>/</span>
                <span className="text-foreground">360 View</span>
              </div>
            }
            title={
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback>
                    <Building2 className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <div>
                  <span data-testid="text-360-client-name">{clientName}</span>
                  {summary?.client?.industry && (
                    <p className="text-sm text-muted-foreground font-normal">{summary.client.industry}</p>
                  )}
                </div>
              </div>
            }
            actions={
              <div className="flex items-center gap-2">
                <Link href={`/clients/${clientId}`}>
                  <Button variant="outline" size="sm" data-testid="button-back-to-detail">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Client Detail
                  </Button>
                </Link>
              </div>
            }
          />
        </div>

        <div className="flex-1 overflow-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
            <div className="px-6 pt-2 border-b border-border">
              <TabsList>
                <TabsTrigger value="overview" data-testid="tab-360-overview">
                  <Briefcase className="h-4 w-4 mr-1.5" />
                  Overview
                </TabsTrigger>
                <TabsTrigger value="projects" data-testid="tab-360-projects">
                  <FolderKanban className="h-4 w-4 mr-1.5" />
                  Projects
                </TabsTrigger>
                <TabsTrigger value="contacts" data-testid="tab-360-contacts">
                  <Users className="h-4 w-4 mr-1.5" />
                  Contacts
                </TabsTrigger>
                <TabsTrigger value="activity" data-testid="tab-360-activity">
                  <Activity className="h-4 w-4 mr-1.5" />
                  Activity
                </TabsTrigger>
                <TabsTrigger value="files" data-testid="tab-360-files">
                  <FileText className="h-4 w-4 mr-1.5" />
                  Files
                </TabsTrigger>
                <TabsTrigger value="notes" data-testid="tab-360-notes">
                  <StickyNote className="h-4 w-4 mr-1.5" />
                  Notes
                </TabsTrigger>
                <TabsTrigger value="reports" data-testid="tab-360-reports">
                  <BarChart3 className="h-4 w-4 mr-1.5" />
                  Reports
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="p-6">
              <OverviewTab clientId={clientId || ""} summary={summary} isLoading={isLoading} onNavigateTab={setActiveTab} />
            </TabsContent>

            <TabsContent value="projects" className="p-6">
              <PlaceholderTab
                icon={<FolderKanban className="h-10 w-10" />}
                title="Projects"
                description="View and manage projects for this client. Coming soon."
              />
            </TabsContent>

            <TabsContent value="contacts" className="p-6">
              <ContactsTab clientId={clientId || ""} />
            </TabsContent>

            <TabsContent value="activity" className="p-6">
              <ActivityTab clientId={clientId || ""} />
            </TabsContent>

            <TabsContent value="files" className="p-6">
              <FilesTab clientId={clientId || ""} />
            </TabsContent>

            <TabsContent value="notes" className="p-6">
              <NotesTab clientId={clientId || ""} />
            </TabsContent>

            <TabsContent value="reports" className="p-6">
              <PlaceholderTab
                icon={<BarChart3 className="h-10 w-10" />}
                title="Reports"
                description="View analytics and reports for this client. Coming soon."
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </PageShell>
  );
}
