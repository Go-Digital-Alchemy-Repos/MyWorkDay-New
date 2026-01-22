import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientDrawer } from "@/features/clients";
import { Plus, Building2, FolderKanban, User } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { ClientWithContacts } from "@shared/schema";

export default function ClientsPage() {
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  const { data: clients, isLoading } = useQuery<ClientWithContacts[]>({
    queryKey: ["/api/clients"],
  });

  const createClientMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/clients", data);
    },
    onMutate: async (newClient) => {
      await queryClient.cancelQueries({ queryKey: ["/api/clients"] });
      const previousClients = queryClient.getQueryData<ClientWithContacts[]>(["/api/clients"]);
      const optimisticClient = {
        id: `temp-${Date.now()}`,
        companyName: newClient.companyName,
        displayName: newClient.displayName || null,
        status: newClient.status || "active",
        industry: newClient.industry || null,
        website: newClient.website || null,
        notes: newClient.notes || null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        state: null,
        postalCode: null,
        country: null,
        phone: null,
        email: null,
        tenantId: "",
        workspaceId: "",
        createdAt: new Date(),
        updatedAt: new Date(),
        contacts: [],
        projects: [],
      } as ClientWithContacts;
      queryClient.setQueryData<ClientWithContacts[]>(["/api/clients"], (old) => 
        old ? [optimisticClient, ...old] : [optimisticClient]
      );
      return { previousClients };
    },
    onError: (err, _newClient, context) => {
      if (context?.previousClients) {
        queryClient.setQueryData(["/api/clients"], context.previousClients);
      }
      toast({ title: "Failed to create client", variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: "Client created successfully" });
      setCreateDrawerOpen(false);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
    },
  });

  const handleCreateClient = async (data: any) => {
    await createClientMutation.mutateAsync(data);
  };

  const filteredClients = clients?.filter((client) =>
    client.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.displayName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500/10 text-green-600 dark:text-green-400";
      case "inactive":
        return "bg-gray-500/10 text-gray-600 dark:text-gray-400";
      case "prospect":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
      default:
        return "bg-gray-500/10 text-gray-600";
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Clients</h1>
            <p className="text-sm text-muted-foreground">Manage your clients and their projects</p>
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="px-6 py-4 border-b border-border shrink-0">
          <Skeleton className="h-9 w-64" />
        </div>
        <div className="flex-1 overflow-auto p-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="hover-elevate">
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <Skeleton className="h-3 w-24 mt-2" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-foreground" data-testid="text-clients-title">
            Clients
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage your clients and their projects
          </p>
        </div>
        <Button onClick={() => setCreateDrawerOpen(true)} data-testid="button-add-client">
          <Plus className="h-4 w-4 mr-2" />
          Add Client
        </Button>
      </div>

      <div className="px-6 py-4 border-b border-border shrink-0">
        <Input
          placeholder="Search clients..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
          data-testid="input-search-clients"
        />
      </div>

      <div className="flex-1 overflow-auto p-6">
        {filteredClients && filteredClients.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredClients.map((client) => (
              <Link key={client.id} href={`/clients/${client.id}`}>
                <Card
                  className="cursor-pointer transition-colors hover-elevate"
                  data-testid={`card-client-${client.id}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {getInitials(client.companyName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base truncate">
                            {client.companyName}
                          </CardTitle>
                          {client.displayName && (
                            <p className="text-xs text-muted-foreground truncate">
                              {client.displayName}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge className={getStatusColor(client.status)}>
                        {client.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <FolderKanban className="h-3.5 w-3.5" />
                        <span>{client.projects?.length || 0} projects</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        <span>{client.contacts?.length || 0} contacts</span>
                      </div>
                    </div>
                    {client.industry && (
                      <p className="text-xs text-muted-foreground mt-2 truncate">
                        {client.industry}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Building2 className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">
              No clients yet
            </h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              Start by adding your first client to organize projects and manage relationships.
            </p>
            <Button onClick={() => setCreateDrawerOpen(true)} data-testid="button-add-first-client">
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Client
            </Button>
          </div>
        )}
      </div>

      <ClientDrawer
        open={createDrawerOpen}
        onOpenChange={setCreateDrawerOpen}
        onSubmit={handleCreateClient}
        isLoading={createClientMutation.isPending}
        mode="create"
      />
    </div>
  );
}
