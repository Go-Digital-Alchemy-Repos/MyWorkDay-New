import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { RichTextEditor } from "@/components/richtext";
import { PrioritySelector, type PriorityLevel } from "@/components/forms/priority-selector";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2, Users } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import type { Section } from "@shared/schema";

const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  sectionId: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  status: z.enum(["todo", "in_progress", "blocked", "done"]).default("todo"),
  dueDate: z.date().optional().nullable(),
  assigneeIds: z.array(z.string()).default([]),
});

type CreateTaskFormData = z.infer<typeof createTaskSchema>;

interface TenantUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

interface TaskCreateDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    title: string;
    description?: string;
    sectionId?: string;
    priority: "low" | "medium" | "high" | "urgent";
    status: "todo" | "in_progress" | "blocked" | "done";
    dueDate?: Date | null;
    assigneeIds?: string[];
  }) => Promise<void>;
  sections?: Section[];
  defaultSectionId?: string;
  tenantUsers?: TenantUser[];
  isLoading?: boolean;
}

export function TaskCreateDrawer({
  open,
  onOpenChange,
  onSubmit,
  sections = [],
  defaultSectionId,
  tenantUsers = [],
  isLoading = false,
}: TaskCreateDrawerProps) {
  const [hasChanges, setHasChanges] = useState(false);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);

  const form = useForm<CreateTaskFormData>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: {
      title: "",
      description: "",
      sectionId: defaultSectionId || "",
      priority: "medium",
      status: "todo",
      dueDate: null,
      assigneeIds: [],
    },
  });

  useEffect(() => {
    if (open && defaultSectionId) {
      form.setValue("sectionId", defaultSectionId);
    }
  }, [open, defaultSectionId, form]);

  useEffect(() => {
    if (!open) {
      form.reset();
      setSelectedAssignees([]);
      setHasChanges(false);
    }
  }, [open, form]);

  useEffect(() => {
    const subscription = form.watch(() => {
      const values = form.getValues();
      const initialSectionId = defaultSectionId || "";
      const hasAnyChanges = 
        values.title !== "" ||
        (values.description && values.description !== "") ||
        values.priority !== "medium" ||
        values.status !== "todo" ||
        values.dueDate !== null ||
        values.sectionId !== initialSectionId ||
        selectedAssignees.length > 0;
      setHasChanges(!!hasAnyChanges);
    });
    return () => subscription.unsubscribe();
  }, [form, defaultSectionId, selectedAssignees]);

  const handleSubmit = async (data: CreateTaskFormData) => {
    try {
      await onSubmit({
        ...data,
        assigneeIds: selectedAssignees,
      });
      form.reset();
      setSelectedAssignees([]);
      setHasChanges(false);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to create task:", error);
    }
  };

  const handleClose = () => {
    form.reset();
    setSelectedAssignees([]);
    setHasChanges(false);
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const addAssignee = (userId: string) => {
    if (!selectedAssignees.includes(userId)) {
      setSelectedAssignees([...selectedAssignees, userId]);
    }
  };

  const removeAssignee = (userId: string) => {
    setSelectedAssignees(selectedAssignees.filter(id => id !== userId));
  };

  const getDisplayName = (user: TenantUser) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user.email;
  };

  const getInitials = (user: TenantUser) => {
    if (user.firstName) return user.firstName[0].toUpperCase();
    return user.email[0].toUpperCase();
  };

  const availableAssignees = tenantUsers.filter(u => !selectedAssignees.includes(u.id));

  return (
    <FullScreenDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Create Task"
      description="Add a new task to your project"
      hasUnsavedChanges={hasChanges}
      onConfirmClose={handleClose}
      width="xl"
      footer={
        <FullScreenDrawerFooter
          onCancel={handleCancel}
          onSave={form.handleSubmit(handleSubmit)}
          isLoading={isLoading}
          saveLabel="Create Task"
        />
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Enter task title..."
                    {...field}
                    data-testid="input-task-title"
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
                  <RichTextEditor
                    value={field.value || ""}
                    onChange={field.onChange}
                    placeholder="Add a detailed description..."
                    className="min-h-[120px]"
                    data-testid="textarea-task-description"
                  />
                </FormControl>
                <FormDescription>
                  Provide context and details for this task
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sections.length > 0 && (
              <FormField
                control={form.control}
                name="sectionId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Section</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-section">
                          <SelectValue placeholder="Select section" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sections.map((section) => (
                          <SelectItem key={section.id} value={section.id}>
                            {section.name}
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
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Priority</FormLabel>
                  <FormControl>
                    <PrioritySelector
                      value={field.value as PriorityLevel}
                      onChange={field.onChange}
                      data-testid="select-priority"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-status">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="todo">To Do</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="blocked">Blocked</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Due Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                          data-testid="button-due-date"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value ? format(field.value, "PPP") : "Pick a date"}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value || undefined}
                        onSelect={field.onChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="space-y-3">
            <FormLabel className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Assignees
            </FormLabel>
            
            {selectedAssignees.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedAssignees.map(userId => {
                  const user = tenantUsers.find(u => u.id === userId);
                  if (!user) return null;
                  return (
                    <Badge 
                      key={userId} 
                      variant="secondary"
                      className="pl-1 pr-1 gap-1"
                      data-testid={`badge-assignee-${userId}`}
                    >
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-xs">{getInitials(user)}</AvatarFallback>
                      </Avatar>
                      <span className="mx-1">{getDisplayName(user)}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 p-0"
                        onClick={() => removeAssignee(userId)}
                        data-testid={`button-remove-assignee-${userId}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  );
                })}
              </div>
            )}

            {tenantUsers.length > 0 && (
              <Select 
                value="" 
                onValueChange={(value) => {
                  if (value) addAssignee(value);
                }}
              >
                <SelectTrigger data-testid="select-add-assignee">
                  <SelectValue placeholder={selectedAssignees.length > 0 ? "Add another assignee..." : "Add assignee..."} />
                </SelectTrigger>
                <SelectContent>
                  {availableAssignees.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      All team members assigned
                    </div>
                  ) : (
                    availableAssignees.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-5 w-5">
                            <AvatarFallback className="text-xs">{getInitials(user)}</AvatarFallback>
                          </Avatar>
                          {getDisplayName(user)}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}

            {tenantUsers.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No team members available. Assignees can be added after creating the task.
              </p>
            )}
          </div>
        </form>
      </Form>
    </FullScreenDrawer>
  );
}
