import { useState, useEffect } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { Users, X, Search, Loader2 } from "lucide-react";
import type { ClientDivision, User } from "@shared/schema";

const divisionSchema = z.object({
  name: z.string().min(1, "Division name is required"),
  description: z.string().optional(),
  color: z.string().default("#3B82F6"),
  isActive: z.boolean().default(true),
});

type DivisionFormData = z.infer<typeof divisionSchema>;

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

  const { data: tenantUsers = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: open && mode === "edit",
  });

  const { data: membersData, isLoading: membersLoading } = useQuery<{ members: DivisionMember[] }>({
    queryKey: ["/api/v1/divisions", division?.id, "members"],
    enabled: open && mode === "edit" && !!division?.id,
  });
  
  const currentMembers = membersData?.members || [];

  useEffect(() => {
    if (open && division && mode === "edit") {
      form.reset({
        name: division.name,
        description: division.description || "",
        color: division.color || "#3B82F6",
        isActive: division.isActive ?? true,
      });
      const memberIds = new Set(currentMembers.map(m => m.userId));
      setSelectedUserIds(memberIds);
    } else if (open && mode === "create") {
      form.reset({
        name: "",
        description: "",
        color: "#3B82F6",
        isActive: true,
      });
      setSelectedUserIds(new Set());
    }
    setSelectedTab("details");
  }, [open, division, mode, form, currentMembers]);

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

  const isLoading = createDivisionMutation.isPending || updateDivisionMutation.isPending;

  return (
    <FullScreenDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "create" ? "Create Division" : `Edit Division: ${division?.name}`}
      description={mode === "create" ? "Create a new organizational division" : "Update division settings and manage team members"}
      hasUnsavedChanges={hasChanges}
      onConfirmClose={handleClose}
      width="2xl"
      footer={
        selectedTab === "details" ? (
          <FullScreenDrawerFooter
            onCancel={handleCancel}
            onSave={form.handleSubmit(handleSubmit)}
            isLoading={isLoading}
            saveLabel={mode === "create" ? "Create Division" : "Save Changes"}
          />
        ) : (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t">
            <Button variant="outline" onClick={handleCancel}>
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
        )
      }
    >
      {mode === "edit" ? (
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="h-full">
          <TabsList className="mb-4">
            <TabsTrigger value="details" data-testid="tab-division-details">Details</TabsTrigger>
            <TabsTrigger value="team" data-testid="tab-division-team">
              Team ({currentMembers.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-6">
            <DivisionDetailsForm form={form} />
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
        </Tabs>
      ) : (
        <DivisionDetailsForm form={form} />
      )}
    </FullScreenDrawer>
  );
}

function DivisionDetailsForm({ form }: { form: ReturnType<typeof useForm<DivisionFormData>> }) {
  const colorOptions = [
    "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
    "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1",
  ];

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
