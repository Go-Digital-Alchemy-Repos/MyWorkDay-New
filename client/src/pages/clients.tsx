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
import { Plus, Building2, FolderKanban, User, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { ClientWithContacts, Client } from "@shared/schema";

interface ClientWithHierarchy extends Client {
  depth: number;
  parentName?: string;
  contactCount: number;
  projectCount: number;
}

export default function ClientsPage() {
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  // Fetch clients with hierarchy for display
  const { data: hierarchyClients, isLoading } = useQuery<ClientWithHierarchy[]>({
    queryKey: ["/api/v1/clients/hierarchy/list"],
  });
  
  // Also fetch regular clients for mutation compatibility
  const { data: clients } = useQuery<ClientWithContacts[]>({
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
        legalName: null,
        status: newClient.status || "active",
        industry: newClient.industry || null,
        companySize: null,
        website: newClient.website || null,
        taxId: null,
        foundedDate: null,
        description: null,
        notes: newClient.notes || null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        state: null,
        postalCode: null,
        country: null,
        phone: null,
        email: null,
        primaryContactName: null,
        primaryContactEmail: null,
        primaryContactPhone: null,
        parentClientId: null,
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
    onError: (err: any, _newClient, context) => {
      if (context?.previousClients) {
        queryClient.setQueryData(["/api/clients"], context.previousClients);
      }
      const errorMessage = err?.message || err?.error || "Unknown error";
      console.error("Failed to create client:", err);
      toast({ 
        title: "Failed to create client", 
        description: typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage),
        variant: "destructive" 
      });
    },
    onSuccess: () => {
      toast({ title: "Client created successfully" });
      setCreateDrawerOpen(false);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/clients/hierarchy/list"] });
    },
  });

  const handleCreateClient = async (data: any) => {
    await createClientMutation.mutateAsync(data);
  };

  const filteredClients = hierarchyClients?.filter((client) =>
    client.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.parentName?.toLowerCase().includes(searchQuery.toLowerCase())
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
      <div className="flex items-center justify-between px-3 md:px-6 py-3 md:py-4 border-b border-border shrink-0 gap-2">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold text-foreground truncate" data-testid="text-clients-title">
            Clients
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground hidden md:block">
            Manage your clients and their projects
          </p>
        </div>
        <Button onClick={() => setCreateDrawerOpen(true)} data-testid="button-add-client" size="sm" className="md:h-9 shrink-0">
          <Plus className="h-4 w-4 md:mr-2" />
          <span className="hidden md:inline">Add Client</span>
        </Button>
      </div>

      <div className="px-3 md:px-6 py-3 md:py-4 border-b border-border shrink-0">
        <Input
          placeholder="Search clients..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full md:max-w-sm"
          data-testid="input-search-clients"
        />
      </div>

      <div className="flex-1 overflow-auto p-3 md:p-6">
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
                        {client.depth > 0 && (
                          <div 
                            className="flex items-center text-muted-foreground shrink-0"
                            style={{ paddingLeft: `${(client.depth - 1) * 12}px` }}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </div>
                        )}
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {getInitials(client.companyName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base truncate">
                            {client.companyName}
                          </CardTitle>
                          {client.parentName ? (
                            <p className="text-xs text-muted-foreground truncate">
                              Sub-client of {client.parentName}
                            </p>
                          ) : client.displayName && (
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
                        <span>{client.projectCount} projects</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        <span>{client.contactCount} contacts</span>
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
