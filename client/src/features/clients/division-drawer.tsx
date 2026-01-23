import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { FullScreenDrawer, FullScreenDrawerFooter } from "@/components/ui/full-screen-drawer";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Users, X, Search, Loader2, Plus, FolderKanban, CheckSquare, Clock, MoreHorizontal } from "lucide-react";
import type { ClientDivision, User, Project, Task } from "@shared/schema";

const divisionSchema = z.object({
  name: z.string().min(1, "Division name is required"),
  description: z.string().optional(),
  color: z.string().default("#3B82F6"),
  isActive: z.boolean().default(true),
});

type DivisionFormData = z.infer<typeof divisionSchema>;

const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  description: z.string().optional(),
  color: z.string().default("#3B82F6"),
});

type CreateProjectForm = z.infer<typeof createProjectSchema>;

interface DivisionMember {
  id: string;
  userId: string;
  divisionId: string;
  role: string;
  user?: User;
}

interface DivisionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  division?: ClientDivision | null;
  mode: "create" | "edit";
}

export function DivisionDrawer({
  open,
  onOpenChange,
  clientId,
  division,
  mode,
}: DivisionDrawerProps) {
  const [hasChanges, setHasChanges] = useState(false);
  const [selectedTab, setSelectedTab] = useState("details");
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<DivisionFormData>({
    resolver: zodResolver(divisionSchema),
    defaultValues: {
      name: "",
      description: "",
      color: "#3B82F6",
      isActive: true,
    },
  });

  const projectForm = useForm<CreateProjectForm>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      name: "",
      description: "",
      color: "#3B82F6",
    },
  });

  const { data: tenantUsers = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: open && mode === "edit",
  });

  const { data: membersData, isLoading: membersLoading } = useQuery<{ members: DivisionMember[] }>({
    queryKey: ["/api/v1/divisions", division?.id, "members"],
    enabled: open && mode === "edit" && !!division?.id,
  });

  const { data: divisionProjects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/v1/divisions", division?.id, "projects"],
    enabled: open && mode === "edit" && !!division?.id,
  });

  const { data: divisionTasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/v1/divisions", division?.id, "tasks"],
    enabled: open && mode === "edit" && !!division?.id,
  });
  
  const currentMembers = membersData?.members || [];
  const initializedRef = useRef(false);

  useEffect(() => {
    if (open) {
      if (division && mode === "edit") {
        form.reset({
          name: division.name,
          description: division.description || "",
          color: division.color || "#3B82F6",
          isActive: division.isActive ?? true,
        });
      } else if (mode === "create") {
        form.reset({
          name: "",
          description: "",
          color: "#3B82F6",
          isActive: true,
        });
        setSelectedUserIds(new Set());
      }
      setSelectedTab("details");
      initializedRef.current = false;
    }
  }, [open, division?.id, mode]);

  useEffect(() => {
    if (open && mode === "edit" && currentMembers.length > 0 && !initializedRef.current) {
      const memberIds = new Set(currentMembers.map(m => m.userId));
      setSelectedUserIds(memberIds);
      initializedRef.current = true;
    }
  }, [open, mode, currentMembers]);

  useEffect(() => {
    const subscription = form.watch(() => {
      setHasChanges(form.formState.isDirty);
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const createDivisionMutation = useMutation({
    mutationFn: async (data: DivisionFormData) => {
      return apiRequest("POST", `/api/v1/clients/${clientId}/divisions`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/clients", clientId, "divisions"] });
      toast({ title: "Division created successfully" });
      handleClose();
    },
    onError: () => {
      toast({ title: "Failed to create division", variant: "destructive" });
    },
  });

  const updateDivisionMutation = useMutation({
    mutationFn: async (data: DivisionFormData) => {
      return apiRequest("PATCH", `/api/v1/divisions/${division?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/clients", clientId, "divisions"] });
      toast({ title: "Division updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update division", variant: "destructive" });
    },
  });

  const updateMembersMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      return apiRequest("POST", `/api/v1/divisions/${division?.id}/members`, { userIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/divisions", division?.id, "members"] });
      toast({ title: "Members updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update members", variant: "destructive" });
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: CreateProjectForm) => {
      return apiRequest("POST", `/api/projects`, {
        ...data,
        clientId,
        divisionId: division?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/divisions", division?.id, "projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project created successfully" });
      setCreateProjectOpen(false);
      projectForm.reset();
    },
    onError: () => {
      toast({ title: "Failed to create project", variant: "destructive" });
    },
  });

  const handleSubmit = async (data: DivisionFormData) => {
    if (mode === "create") {
      await createDivisionMutation.mutateAsync(data);
    } else {
      await updateDivisionMutation.mutateAsync(data);
    }
  };

  const handleSaveMembers = async () => {
    await updateMembersMutation.mutateAsync(Array.from(selectedUserIds));
  };

  const handleCreateProject = async (data: CreateProjectForm) => {
    await createProjectMutation.mutateAsync(data);
  };

  const toggleUserSelection = (userId: string) => {
    const newSelected = new Set(selectedUserIds);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUserIds(newSelected);
    setHasChanges(true);
  };

  const handleClose = () => {
    form.reset();
    setHasChanges(false);
    setSelectedUserIds(new Set());
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const filteredUsers = tenantUsers.filter(
    (user) =>
      user.name?.toLowerCase().includes(memberSearch.toLowerCase()) ||
      user.email?.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getTaskStatusColor = (status: string) => {
    switch (status) {
      case "done":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "in_progress":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "blocked":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const isLoading = createDivisionMutation.isPending || updateDivisionMutation.isPending;

  const renderFooter = () => {
    if (selectedTab === "details") {
      return (
        <FullScreenDrawerFooter
          onCancel={handleCancel}
          onSave={form.handleSubmit(handleSubmit)}
          isLoading={isLoading}
          saveLabel={mode === "create" ? "Create Division" : "Save Changes"}
        />
      );
    }
    if (selectedTab === "team") {
      return (
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t">
          <Button variant="outline" onClick={handleCancel} data-testid="button-team-cancel">
            Cancel
          </Button>
          <Button
            onClick={handleSaveMembers}
            disabled={updateMembersMutation.isPending}
            data-testid="button-save-members"
          >
            {updateMembersMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Members"
            )}
          </Button>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-end gap-2 px-6 py-4 border-t">
        <Button variant="outline" onClick={handleCancel} data-testid="button-close-drawer">
          Close
        </Button>
      </div>
    );
  };

  const colorOptions = [
    "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
    "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1",
  ];

  return (
    <FullScreenDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "create" ? "Create Division" : `${division?.name}`}
      description={mode === "create" ? "Create a new organizational division" : "Manage division settings, projects, team members, and tasks"}
      hasUnsavedChanges={hasChanges}
      onConfirmClose={handleClose}
      width="3xl"
      footer={renderFooter()}
    >
      {mode === "edit" ? (
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="h-full">
          <TabsList className="mb-4">
            <TabsTrigger value="details" data-testid="tab-division-details">Details</TabsTrigger>
            <TabsTrigger value="projects" data-testid="tab-division-projects">
              <FolderKanban className="h-4 w-4 mr-1" />
              Projects ({divisionProjects.length})
            </TabsTrigger>
            <TabsTrigger value="team" data-testid="tab-division-team">
              <Users className="h-4 w-4 mr-1" />
              Team ({currentMembers.length})
            </TabsTrigger>
            <TabsTrigger value="tasks" data-testid="tab-division-tasks">
              <CheckSquare className="h-4 w-4 mr-1" />
              Tasks ({divisionTasks.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-6">
            <DivisionDetailsForm form={form} colorOptions={colorOptions} />
          </TabsContent>

          <TabsContent value="projects" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Division Projects</h3>
              <Dialog open={createProjectOpen} onOpenChange={setCreateProjectOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="button-add-project">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Project
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Project in {division?.name}</DialogTitle>
                  </DialogHeader>
                  <Form {...projectForm}>
                    <form onSubmit={projectForm.handleSubmit(handleCreateProject)} className="space-y-4">
                      <FormField
                        control={projectForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Project Name *</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., Website Redesign" {...field} data-testid="input-project-name" />
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
                              <Textarea placeholder="Project description..." className="resize-none" rows={3} {...field} data-testid="input-project-description" />
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
                              <div className="flex flex-wrap gap-2">
                                {colorOptions.map((color) => (
                                  <button
                                    key={color}
                                    type="button"
                                    className={`h-8 w-8 rounded-md border-2 transition-all ${
                                      field.value === color ? "border-foreground scale-110" : "border-transparent"
                                    }`}
                                    style={{ backgroundColor: color }}
                                    onClick={() => field.onChange(color)}
                                    data-testid={`project-color-${color}`}
                                  />
                                ))}
                              </div>
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setCreateProjectOpen(false)} data-testid="button-create-project-cancel">
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createProjectMutation.isPending} data-testid="button-create-project-submit">
                          {createProjectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Project"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>

            {projectsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : divisionProjects.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FolderKanban className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground text-center">No projects in this division yet.</p>
                  <p className="text-sm text-muted-foreground text-center mt-1">Create a project to get started.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {divisionProjects.map((project) => (
                  <Card key={project.id} className="hover-elevate cursor-pointer" data-testid={`project-card-${project.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: project.color || "#3B82F6" }} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{project.name}</p>
                          {project.description && (
                            <p className="text-sm text-muted-foreground truncate">{project.description}</p>
                          )}
                        </div>
                        <Badge variant="outline">{project.status || "active"}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="team" className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-members"
                />
              </div>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  Select Team Members ({selectedUserIds.size} selected)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {usersLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="divide-y">
                      {filteredUsers.map((user) => (
                        <div
                          key={user.id}
                          className="flex items-center gap-3 p-3 hover-elevate cursor-pointer"
                          onClick={() => toggleUserSelection(user.id)}
                          data-testid={`user-option-${user.id}`}
                        >
                          <Checkbox
                            checked={selectedUserIds.has(user.id)}
                            onCheckedChange={() => toggleUserSelection(user.id)}
                          />
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs">
                              {getInitials(user.name || user.email || "?")}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {user.name || "Unnamed"}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {user.email}
                            </p>
                          </div>
                          <Badge variant="outline" className="shrink-0">
                            {user.role}
                          </Badge>
                        </div>
                      ))}
                      {filteredUsers.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          <Users className="h-8 w-8 text-muted-foreground/50 mb-2" />
                          <p className="text-sm text-muted-foreground">No users found</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tasks" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Division Tasks</h3>
            </div>

            {tasksLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : divisionTasks.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <CheckSquare className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground text-center">No tasks in this division yet.</p>
                  <p className="text-sm text-muted-foreground text-center mt-1">Create tasks within projects to see them here.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {divisionTasks.map((task) => (
                  <Card key={task.id} className="hover-elevate cursor-pointer" data-testid={`task-card-${task.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <CheckSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{task.title}</p>
                          {task.description && (
                            <p className="text-sm text-muted-foreground truncate">{task.description}</p>
                          )}
                        </div>
                        <Badge className={getTaskStatusColor(task.status || "todo")}>
                          {task.status || "todo"}
                        </Badge>
                        {task.dueDate && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {new Date(task.dueDate).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      ) : (
        <DivisionDetailsForm form={form} colorOptions={colorOptions} />
      )}
    </FullScreenDrawer>
  );
}

function DivisionDetailsForm({ 
  form, 
  colorOptions 
}: { 
  form: ReturnType<typeof useForm<DivisionFormData>>; 
  colorOptions: string[];
}) {
  return (
    <Form {...form}>
      <div className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Division Name *</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g., Engineering, Marketing, Sales"
                  {...field}
                  data-testid="input-division-name"
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
                  placeholder="Optional description for this division"
                  className="resize-none"
                  rows={3}
                  {...field}
                  data-testid="input-division-description"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="color"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Color</FormLabel>
              <FormControl>
                <div className="flex flex-wrap gap-2">
                  {colorOptions.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`h-8 w-8 rounded-md border-2 transition-all ${
                        field.value === color
                          ? "border-foreground scale-110"
                          : "border-transparent"
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => field.onChange(color)}
                      data-testid={`color-option-${color}`}
                    />
                  ))}
                </div>
              </FormControl>
              <FormDescription>Choose a color to identify this division</FormDescription>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Active Status</FormLabel>
                <FormDescription>
                  Inactive divisions are hidden from most views
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  data-testid="switch-division-active"
                />
              </FormControl>
            </FormItem>
          )}
        />
      </div>
    </Form>
  );
}
