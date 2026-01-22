import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { FullScreenDrawer, FullScreenDrawerFooter } from "@/components/ui/full-screen-drawer";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";
import type { Project, Client, User, ProjectMember } from "@shared/schema";

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

const projectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  description: z.string().optional(),
  clientId: z.string().min(1, "Client assignment is required"),
  color: z.string().default("#3B82F6"),
  memberIds: z.array(z.string()).default([]),
});

type ProjectFormData = z.infer<typeof projectSchema>;

interface ProjectDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ProjectFormData) => Promise<void>;
  project?: Project | null;
  isLoading?: boolean;
  mode: "create" | "edit";
}

export function ProjectDrawer({
  open,
  onOpenChange,
  onSubmit,
  project,
  isLoading = false,
  mode,
}: ProjectDrawerProps) {
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
    enabled: open,
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: open,
  });

  const { data: existingMembers } = useQuery<(ProjectMember & { user?: User })[]>({
    queryKey: ["/api/projects", project?.id, "members"],
    enabled: open && mode === "edit" && !!project?.id,
  });

  const form = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: "",
      description: "",
      clientId: "",
      color: "#3B82F6",
      memberIds: [],
    },
  });

  const clientIdValue = form.watch("clientId");
  const hasClientAssigned = !!clientIdValue;
  const projectMissingClient = mode === "edit" && project && !project.clientId && !hasClientAssigned;

  useEffect(() => {
    if (open && project && mode === "edit") {
      const memberIds = existingMembers?.map(m => m.userId) || [];
      form.reset({
        name: project.name,
        description: project.description || "",
        clientId: project.clientId || "",
        color: project.color || "#3B82F6",
        memberIds,
      });
    } else if (open && mode === "create") {
      form.reset({
        name: "",
        description: "",
        clientId: "",
        color: "#3B82F6",
        memberIds: [],
      });
    }
  }, [open, project, mode, form, existingMembers]);

  useEffect(() => {
    const subscription = form.watch(() => {
      setHasChanges(form.formState.isDirty);
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const handleSubmit = async (data: ProjectFormData) => {
    try {
      await onSubmit(data);
      form.reset();
      setHasChanges(false);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save project:", error);
    }
  };

  const handleClose = () => {
    form.reset();
    setHasChanges(false);
    setActiveTab("overview");
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const toggleMember = (userId: string) => {
    const current = form.getValues("memberIds");
    if (current.includes(userId)) {
      form.setValue("memberIds", current.filter(id => id !== userId), { shouldDirty: true });
    } else {
      form.setValue("memberIds", [...current, userId], { shouldDirty: true });
    }
  };

  const getFullName = (user: User) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user.name || user.email;
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const selectedMemberIds = form.watch("memberIds");

  return (
    <FullScreenDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "create" ? "Create Project" : "Edit Project"}
      description={mode === "create" ? "Create a new project with client assignment and team members" : "Update project details and team members"}
      hasUnsavedChanges={hasChanges}
      onConfirmClose={handleClose}
      width="xl"
      footer={
        <FullScreenDrawerFooter
          onCancel={handleCancel}
          onSave={form.handleSubmit(handleSubmit)}
          isLoading={isLoading}
          saveLabel={mode === "create" ? "Create Project" : "Save Changes"}
          saveDisabled={!hasClientAssigned}
        />
      }
    >
      {projectMissingClient && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive bg-destructive/10 p-3">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <span className="text-sm text-destructive">
            Client assignment required. Please assign a client before saving other changes.
          </span>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="team" data-testid="tab-team">Team</TabsTrigger>
        </TabsList>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)}>
            <TabsContent value="overview" className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Name *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter project name..."
                        {...field}
                        data-testid="input-project-name"
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
                        className="min-h-[100px] resize-none"
                        {...field}
                        data-testid="textarea-project-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-client">
                          <SelectValue placeholder="Select a client (required)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {clients?.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.companyName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                          data-testid={`color-${color.name.toLowerCase()}`}
                        />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </TabsContent>

            <TabsContent value="team" className="space-y-4">
              <div className="text-sm text-muted-foreground mb-4">
                Select team members who will have access to this project
              </div>

              {selectedMemberIds.length > 0 && (
                <div className="mb-4">
                  <div className="text-sm font-medium mb-2">Selected Members ({selectedMemberIds.length})</div>
                  <div className="flex flex-wrap gap-2">
                    {users?.filter(u => selectedMemberIds.includes(u.id)).map(user => (
                      <Badge key={user.id} variant="secondary" className="gap-1">
                        {getFullName(user)}
                        <button
                          type="button"
                          onClick={() => toggleMember(user.id)}
                          className="ml-1 hover:text-destructive"
                        >
                          x
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {users?.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center gap-3 p-3 rounded-md border hover-elevate cursor-pointer"
                    onClick={() => toggleMember(user.id)}
                    data-testid={`member-${user.id}`}
                  >
                    <Checkbox
                      checked={selectedMemberIds.includes(user.id)}
                      onCheckedChange={() => toggleMember(user.id)}
                      data-testid={`checkbox-member-${user.id}`}
                    />
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {getInitials(getFullName(user))}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="font-medium text-sm">{getFullName(user)}</div>
                      <div className="text-xs text-muted-foreground">{user.email}</div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {user.role}
                    </Badge>
                  </div>
                ))}
                {(!users || users.length === 0) && (
                  <div className="text-center text-muted-foreground py-8">
                    No team members available
                  </div>
                )}
              </div>
            </TabsContent>
          </form>
        </Form>
      </Tabs>
    </FullScreenDrawer>
  );
}
