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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Client } from "@shared/schema";

const clientSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  displayName: z.string().optional(),
  status: z.enum(["active", "inactive", "prospect"]).default("active"),
  industry: z.string().optional(),
  website: z.string().optional(),
  notes: z.string().optional(),
});

type ClientFormData = z.infer<typeof clientSchema>;

interface ClientDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ClientFormData) => Promise<void>;
  client?: Client | null;
  isLoading?: boolean;
  mode: "create" | "edit";
}

export function ClientDrawer({
  open,
  onOpenChange,
  onSubmit,
  client,
  isLoading = false,
  mode,
}: ClientDrawerProps) {
  const [hasChanges, setHasChanges] = useState(false);

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      companyName: "",
      displayName: "",
      status: "active",
      industry: "",
      website: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (open && client && mode === "edit") {
      form.reset({
        companyName: client.companyName,
        displayName: client.displayName || "",
        status: client.status as "active" | "inactive" | "prospect",
        industry: client.industry || "",
        website: client.website || "",
        notes: client.notes || "",
      });
    } else if (open && mode === "create") {
      form.reset({
        companyName: "",
        displayName: "",
        status: "active",
        industry: "",
        website: "",
        notes: "",
      });
    }
  }, [open, client, mode, form]);

  useEffect(() => {
    const subscription = form.watch(() => {
      setHasChanges(form.formState.isDirty);
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const handleSubmit = async (data: ClientFormData) => {
    try {
      await onSubmit(data);
      form.reset();
      setHasChanges(false);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save client:", error);
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
      title={mode === "create" ? "Add New Client" : "Edit Client"}
      description={mode === "create" ? "Create a new client for your organization" : "Update client information"}
      hasUnsavedChanges={hasChanges}
      onConfirmClose={handleClose}
      width="xl"
      footer={
        <FullScreenDrawerFooter
          onCancel={handleCancel}
          onSave={form.handleSubmit(handleSubmit)}
          isLoading={isLoading}
          saveLabel={mode === "create" ? "Create Client" : "Save Changes"}
        />
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
              control={form.control}
              name="companyName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Acme Inc."
                      {...field}
                      data-testid="input-company-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Short name or alias"
                      {...field}
                      data-testid="input-display-name"
                    />
                  </FormControl>
                  <FormDescription>
                    A shorter name for quick reference
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-status">
                        <SelectValue placeholder="Select status" />
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
              control={form.control}
              name="industry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Industry</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Technology, Finance, etc."
                      {...field}
                      data-testid="input-industry"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="website"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Website</FormLabel>
                <FormControl>
                  <Input
                    placeholder="https://example.com"
                    {...field}
                    data-testid="input-website"
                  />
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
                  <Textarea
                    placeholder="Additional notes about this client..."
                    className="min-h-[120px] resize-none"
                    {...field}
                    data-testid="textarea-notes"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </FullScreenDrawer>
  );
}
