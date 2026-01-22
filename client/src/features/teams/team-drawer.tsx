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
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { Team } from "@shared/schema";

const teamSchema = z.object({
  name: z.string().min(1, "Team name is required"),
});

type TeamFormData = z.infer<typeof teamSchema>;

interface TeamDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: TeamFormData) => Promise<void>;
  team?: Team | null;
  isLoading?: boolean;
  mode: "create" | "edit";
}

export function TeamDrawer({
  open,
  onOpenChange,
  onSubmit,
  team,
  isLoading = false,
  mode,
}: TeamDrawerProps) {
  const [hasChanges, setHasChanges] = useState(false);

  const form = useForm<TeamFormData>({
    resolver: zodResolver(teamSchema),
    defaultValues: {
      name: "",
    },
  });

  useEffect(() => {
    if (open && team && mode === "edit") {
      form.reset({
        name: team.name,
      });
    } else if (open && mode === "create") {
      form.reset({
        name: "",
      });
    }
    setHasChanges(false);
  }, [open, team, mode, form]);

  useEffect(() => {
    const subscription = form.watch(() => {
      setHasChanges(form.formState.isDirty);
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const handleSubmit = async (data: TeamFormData) => {
    try {
      await onSubmit(data);
      form.reset();
      setHasChanges(false);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save team:", error);
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
      title={mode === "create" ? "Create Team" : "Edit Team"}
      description={mode === "create" ? "Create a new team to organize users" : "Update team details"}
      hasUnsavedChanges={hasChanges}
      onConfirmClose={handleClose}
      width="lg"
      footer={
        <FullScreenDrawerFooter
          onCancel={handleCancel}
          onSave={form.handleSubmit(handleSubmit)}
          isLoading={isLoading}
          saveLabel={mode === "create" ? "Create Team" : "Save Changes"}
        />
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Team Name *</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Engineering"
                    {...field}
                    data-testid="input-team-name"
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
