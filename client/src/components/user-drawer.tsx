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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { User, Team, Client } from "@shared/schema";

const userSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
  role: z.enum(["admin", "employee", "client"]).default("employee"),
  isActive: z.boolean().default(true),
  teamIds: z.array(z.string()).default([]),
  clientIds: z.array(z.string()).default([]),
});

type UserFormData = z.infer<typeof userSchema>;

interface UserDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: UserFormData) => Promise<void>;
  user?: User | null;
  isLoading?: boolean;
  mode: "create" | "edit";
  teams?: Team[];
  clients?: Client[];
  userTeamIds?: string[];
  userClientIds?: string[];
}

export function UserDrawer({
  open,
  onOpenChange,
  onSubmit,
  user,
  isLoading = false,
  mode,
  teams = [],
  clients = [],
  userTeamIds = [],
  userClientIds = [],
}: UserDrawerProps) {
  const [hasChanges, setHasChanges] = useState(false);

  const form = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      role: "employee",
      isActive: true,
      teamIds: [],
      clientIds: [],
    },
  });

  const watchedRole = form.watch("role");

  useEffect(() => {
    if (open && user && mode === "edit") {
      form.reset({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        email: user.email,
        role: (user.role as "admin" | "employee" | "client") || "employee",
        isActive: user.isActive ?? true,
        teamIds: userTeamIds,
        clientIds: userClientIds,
      });
    } else if (open && mode === "create") {
      form.reset({
        firstName: "",
        lastName: "",
        email: "",
        role: "employee",
        isActive: true,
        teamIds: [],
        clientIds: [],
      });
    }
    setHasChanges(false);
  }, [open, user, mode, form, userTeamIds, userClientIds]);

  useEffect(() => {
    const subscription = form.watch(() => {
      setHasChanges(form.formState.isDirty);
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const handleSubmit = async (data: UserFormData) => {
    try {
      await onSubmit(data);
      form.reset();
      setHasChanges(false);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save user:", error);
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
      title={mode === "create" ? "Create New User" : "Edit User"}
      description={mode === "create" ? "Add a new team member to your organization" : "Update user details and permissions"}
      hasUnsavedChanges={hasChanges}
      onConfirmClose={handleClose}
      width="xl"
      footer={
        <FullScreenDrawerFooter
          onCancel={handleCancel}
          onSave={form.handleSubmit(handleSubmit)}
          isLoading={isLoading}
          saveLabel={mode === "create" ? "Create User" : "Save Changes"}
        />
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="John"
                      {...field}
                      data-testid="input-user-firstname"
                    />
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
                  <FormLabel>Last Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Doe"
                      {...field}
                      data-testid="input-user-lastname"
                    />
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
                <FormLabel>Email *</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="john@example.com"
                    {...field}
                    data-testid="input-user-email"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Role</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-user-role">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="client">Client</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  Admins have full access to settings and all data
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {mode === "edit" && (
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="checkbox-user-active"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>User is active</FormLabel>
                    <FormDescription>
                      Inactive users cannot log in or access the system
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          )}

          {teams.length > 0 && (
            <FormField
              control={form.control}
              name="teamIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Team Assignments</FormLabel>
                  <div className="border rounded-md p-4 space-y-3 max-h-[200px] overflow-y-auto">
                    {teams.map((team) => (
                      <div key={team.id} className="flex items-center space-x-3">
                        <Checkbox
                          id={`team-${team.id}`}
                          checked={field.value.includes(team.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              field.onChange([...field.value, team.id]);
                            } else {
                              field.onChange(field.value.filter((id: string) => id !== team.id));
                            }
                          }}
                          data-testid={`checkbox-team-${team.id}`}
                        />
                        <Label htmlFor={`team-${team.id}`} className="cursor-pointer text-sm font-normal">
                          {team.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                  <FormDescription>
                    Assign user to one or more teams
                  </FormDescription>
                </FormItem>
              )}
            />
          )}

          {watchedRole === "client" && clients.length > 0 && (
            <FormField
              control={form.control}
              name="clientIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client Account Access</FormLabel>
                  <div className="border rounded-md p-4 space-y-3 max-h-[200px] overflow-y-auto">
                    {clients.map((client) => (
                      <div key={client.id} className="flex items-center space-x-3">
                        <Checkbox
                          id={`client-${client.id}`}
                          checked={field.value.includes(client.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              field.onChange([...field.value, client.id]);
                            } else {
                              field.onChange(field.value.filter((id: string) => id !== client.id));
                            }
                          }}
                          data-testid={`checkbox-client-${client.id}`}
                        />
                        <Label htmlFor={`client-${client.id}`} className="cursor-pointer text-sm font-normal">
                          {client.displayName || client.companyName}
                        </Label>
                      </div>
                    ))}
                  </div>
                  <FormDescription>
                    Grant access to specific client accounts
                  </FormDescription>
                </FormItem>
              )}
            />
          )}
        </form>
      </Form>
    </FullScreenDrawer>
  );
}
