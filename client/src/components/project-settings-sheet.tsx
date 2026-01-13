import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { Building2, X, Archive, RotateCcw } from "lucide-react";
import type { Project, ClientWithContacts, Team } from "@shared/schema";

const PROJECT_COLORS = [
  { name: "Blue", value: "#3B82F6" },
  { name: "Green", value: "#10B981" },
  { name: "Purple", value: "#8B5CF6" },
  { name: "Orange", value: "#F59E0B" },
  { name: "Red", value: "#EF4444" },
  { name: "Cyan", value: "#06B6D4" },
  { name: "Pink", value: "#EC4899" },
  { name: "Indigo", value: "#6366F1" },
];

const editProjectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  description: z.string().optional(),
  teamId: z.string().optional(),
  color: z.string().default("#3B82F6"),
  visibility: z.enum(["workspace", "private"]).default("workspace"),
});

type EditProjectFormData = z.infer<typeof editProjectSchema>;

interface ProjectSettingsSheetProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectSettingsSheet({
  project,
  open,
  onOpenChange,
}: ProjectSettingsSheetProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: clients = [] } = useQuery<ClientWithContacts[]>({
    queryKey: ["/api/clients"],
  });

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const form = useForm<EditProjectFormData>({
    resolver: zodResolver(editProjectSchema),
    defaultValues: {
      name: project.name,
      description: project.description || "",
      teamId: project.teamId || "",
      color: project.color || "#3B82F6",
      visibility: (project.visibility as "workspace" | "private") || "workspace",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: project.name,
        description: project.description || "",
        teamId: project.teamId || "",
        color: project.color || "#3B82F6",
        visibility: (project.visibility as "workspace" | "private") || "workspace",
      });
    }
  }, [open, project, form]);

  const updateProjectMutation = useMutation({
    mutationFn: async (data: EditProjectFormData) => {
      return apiRequest("PATCH", `/api/projects/${project.id}`, {
        name: data.name,
        description: data.description || null,
        teamId: data.teamId || null,
        color: data.color,
        visibility: data.visibility,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Project updated",
        description: "Project details have been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update project.",
        variant: "destructive",
      });
    },
  });

  const assignClientMutation = useMutation({
    mutationFn: async (clientId: string | null) => {
      return apiRequest("PATCH", `/api/projects/${project.id}/client`, { clientId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({
        title: "Client updated",
        description: "Project client assignment has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update client assignment.",
        variant: "destructive",
      });
    },
  });

  const archiveProjectMutation = useMutation({
    mutationFn: async (status: "active" | "archived") => {
      return apiRequest("PATCH", `/api/projects/${project.id}`, { status });
    },
    onSuccess: (_, status) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: status === "archived" ? "Project archived" : "Project restored",
        description: status === "archived" 
          ? "The project has been archived and moved to inactive."
          : "The project has been restored to active status.",
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update project status.",
        variant: "destructive",
      });
    },
  });

  const currentClient = clients.find((c) => c.id === project.clientId);
  const isArchived = project.status === "archived";

  const handleAssignClient = (clientId: string) => {
    if (clientId === "unassign") {
      assignClientMutation.mutate(null);
    } else {
      assignClientMutation.mutate(clientId);
    }
  };

  const handleUnassign = () => {
    assignClientMutation.mutate(null);
  };

  const handleSubmit = (data: EditProjectFormData) => {
    updateProjectMutation.mutate(data);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Project Settings</SheetTitle>
          <SheetDescription>
            {isAdmin ? "Edit project details and settings." : "View project settings."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {isAdmin && (
            <>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Enter project name..."
                            {...field}
                            data-testid="input-edit-project-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Add a description..."
                            className="min-h-[80px] resize-none"
                            {...field}
                            data-testid="textarea-edit-project-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    {teams.length > 0 && (
                      <FormField
                        control={form.control}
                        name="teamId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Team</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-edit-team">
                                  <SelectValue placeholder="Select team" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="">No team</SelectItem>
                                {teams.map((team) => (
                                  <SelectItem key={team.id} value={team.id}>
                                    {team.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      control={form.control}
                      name="visibility"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Visibility</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-visibility">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="workspace">Workspace</SelectItem>
                              <SelectItem value="private">Private</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="color"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Color</FormLabel>
                        <div className="flex flex-wrap gap-2">
                          {PROJECT_COLORS.map((color) => (
                            <button
                              key={color.value}
                              type="button"
                              onClick={() => field.onChange(color.value)}
                              className={`h-8 w-8 rounded-md border-2 transition-all ${
                                field.value === color.value
                                  ? "border-foreground scale-110"
                                  : "border-transparent"
                              }`}
                              style={{ backgroundColor: color.value }}
                              title={color.name}
                              data-testid={`edit-color-${color.name.toLowerCase()}`}
                            />
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={updateProjectMutation.isPending}
                    data-testid="button-save-project"
                  >
                    {updateProjectMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </form>
              </Form>

              <Separator />
            </>
          )}

          <div className="space-y-3">
            <Label className="text-sm font-medium">Client</Label>
            <div className="space-y-3">
              {currentClient ? (
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{currentClient.companyName}</p>
                      {currentClient.displayName && (
                        <p className="text-xs text-muted-foreground">
                          {currentClient.displayName}
                        </p>
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleUnassign}
                      disabled={assignClientMutation.isPending}
                      data-testid="button-unassign-client"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Unassign
                    </Button>
                  )}
                </div>
              ) : (
                <div className="p-3 rounded-lg border border-dashed text-center">
                  <p className="text-sm text-muted-foreground">No client assigned</p>
                </div>
              )}

              {isAdmin && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    {currentClient ? "Change Client" : "Assign Client"}
                  </Label>
                  <Select
                    onValueChange={handleAssignClient}
                    disabled={assignClientMutation.isPending}
                  >
                    <SelectTrigger data-testid="select-project-client">
                      <SelectValue placeholder="Select a client..." />
                    </SelectTrigger>
                    <SelectContent>
                      {currentClient && (
                        <SelectItem value="unassign">
                          <span className="text-muted-foreground">Unassign client</span>
                        </SelectItem>
                      )}
                      {clients.map((client) => (
                        <SelectItem
                          key={client.id}
                          value={client.id}
                          disabled={client.id === project.clientId}
                        >
                          <div className="flex items-center gap-2">
                            <Building2 className="h-3.5 w-3.5" />
                            {client.companyName}
                          </div>
                        </SelectItem>
                      ))}
                      {clients.length === 0 && (
                        <div className="py-2 px-2 text-sm text-muted-foreground text-center">
                          No clients available
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          {isAdmin && (
            <>
              <Separator />
              
              <div className="space-y-3">
                <Label className="text-sm font-medium">Project Status</Label>
                <div className="p-3 rounded-lg bg-muted">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        {isArchived ? "Archived" : "Active"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isArchived 
                          ? "This project is archived and read-only."
                          : "This project is active and can be edited."}
                      </p>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant={isArchived ? "outline" : "secondary"}
                          size="sm"
                          disabled={archiveProjectMutation.isPending}
                          data-testid={isArchived ? "button-restore-project" : "button-archive-project"}
                        >
                          {isArchived ? (
                            <>
                              <RotateCcw className="h-4 w-4 mr-1" />
                              Restore
                            </>
                          ) : (
                            <>
                              <Archive className="h-4 w-4 mr-1" />
                              Archive
                            </>
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {isArchived ? "Restore Project" : "Archive Project"}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {isArchived 
                              ? "Are you sure you want to restore this project? It will become active and editable again."
                              : "Are you sure you want to archive this project? Archived projects preserve all tasks and time tracking data but become read-only."}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel data-testid="button-cancel-archive">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => archiveProjectMutation.mutate(isArchived ? "active" : "archived")}
                            data-testid="button-confirm-archive"
                          >
                            {isArchived ? "Restore" : "Archive"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
