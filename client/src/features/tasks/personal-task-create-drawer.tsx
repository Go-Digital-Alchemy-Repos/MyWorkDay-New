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
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { formatErrorForToast } from "@/lib/parseApiError";

const personalTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  status: z.enum(["todo", "in_progress", "blocked", "done"]).default("todo"),
  dueDate: z.date().optional().nullable(),
  assigneeId: z.string().optional(),
});

type PersonalTaskFormData = z.infer<typeof personalTaskSchema>;

interface TenantUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

interface PersonalTaskCreateDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    title: string;
    description?: string;
    priority?: "low" | "medium" | "high" | "urgent";
    status?: "todo" | "in_progress" | "blocked" | "done";
    dueDate?: string | null;
    assigneeIds?: string[];
  }) => Promise<void>;
  tenantUsers?: TenantUser[];
  currentUserId?: string;
  isLoading?: boolean;
}

export function PersonalTaskCreateDrawer({
  open,
  onOpenChange,
  onSubmit,
  tenantUsers = [],
  currentUserId,
  isLoading = false,
}: PersonalTaskCreateDrawerProps) {
  const [hasChanges, setHasChanges] = useState(false);
  const { toast } = useToast();

  const form = useForm<PersonalTaskFormData>({
    resolver: zodResolver(personalTaskSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "medium",
      status: "todo",
      dueDate: null,
      assigneeId: "_self",
    },
  });

  useEffect(() => {
    if (!open) {
      form.reset();
      setHasChanges(false);
    }
  }, [open, form]);

  useEffect(() => {
    const subscription = form.watch(() => {
      const values = form.getValues();
      const hasAnyChanges = 
        values.title !== "" ||
        (values.description && values.description !== "") ||
        values.priority !== "medium" ||
        values.status !== "todo" ||
        values.dueDate !== null ||
        values.assigneeId !== "_self";
      setHasChanges(!!hasAnyChanges);
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const handleSubmit = async (data: PersonalTaskFormData) => {
    try {
      await onSubmit({
        title: data.title,
        description: data.description,
        priority: data.priority,
        status: data.status,
        dueDate: data.dueDate ? data.dueDate.toISOString() : null,
        assigneeIds: data.assigneeId === "_self" ? [] : data.assigneeId ? [data.assigneeId] : [],
      });
      form.reset();
      setHasChanges(false);
      onOpenChange(false);
    } catch (error) {
      const { title, description } = formatErrorForToast(error as Error);
      toast({
        title,
        description,
        variant: "destructive",
      });
    }
  };

  const handleClose = () => {
    form.reset();
    setHasChanges(false);
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <FullScreenDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Create Personal Task"
      description="Add a new personal task to your list"
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
                    placeholder="What do you need to do?"
                    {...field}
                    data-testid="input-personal-task-title"
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
                    placeholder="Add more details..."
                    className="min-h-[150px]"
                    data-testid="textarea-personal-task-description"
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
                      data-testid="select-personal-task-priority"
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
                      <SelectTrigger data-testid="select-personal-task-status">
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
                          data-testid="button-personal-task-due-date"
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

            <FormField
              control={form.control}
              name="assigneeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Assign To</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-personal-task-assignee">
                        <SelectValue placeholder="Assign to yourself (default)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="_self">Myself</SelectItem>
                      {tenantUsers?.filter(u => u.id !== currentUserId).map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.firstName && u.lastName 
                            ? `${u.firstName} ${u.lastName}` 
                            : u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Leave as default to assign to yourself
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </form>
      </Form>
    </FullScreenDrawer>
  );
}
