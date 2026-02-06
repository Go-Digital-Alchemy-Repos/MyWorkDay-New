import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCrmFlags } from "@/hooks/use-crm-flags";
import { formatErrorForToast } from "@/lib/parseApiError";
import { format, formatDistanceToNow } from "date-fns";
import { Link } from "wouter";

import {
  CalendarClock,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  User,
  Calendar,
  Clock,
  Users,
  Tag,
  CheckSquare,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PageShell,
  PageHeader,
  EmptyState,
  LoadingState,
} from "@/components/layout";

interface FollowUpItem {
  clientId: string;
  companyName: string;
  displayName: string | null;
  email: string | null;
  crmStatus: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  tags: string[] | null;
  nextFollowUpAt: string | null;
  followUpNotes: string | null;
  lastContactAt: string | null;
}

interface FollowUpsData {
  overdue: FollowUpItem[];
  dueToday: FollowUpItem[];
  next7Days: FollowUpItem[];
}

interface UserOption {
  id: string;
  name: string;
}

type SectionKey = "overdue" | "dueToday" | "next7Days";

const SECTION_CONFIG: Record<SectionKey, { label: string; badgeClass: string; iconClass: string }> = {
  overdue: {
    label: "Overdue",
    badgeClass: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    iconClass: "text-red-500",
  },
  dueToday: {
    label: "Due Today",
    badgeClass: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    iconClass: "text-orange-500",
  },
  next7Days: {
    label: "Next 7 Days",
    badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    iconClass: "text-blue-500",
  },
};

function FollowUpCard({
  item,
  isSelected,
  onToggleSelect,
}: {
  item: FollowUpItem;
  isSelected: boolean;
  onToggleSelect: (clientId: string) => void;
}) {
  const name = item.companyName || item.displayName || "Unnamed";

  return (
    <Card data-testid={`card-followup-${item.clientId}`}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect(item.clientId)}
            data-testid={`checkbox-followup-${item.clientId}`}
            className="mt-0.5"
          />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Link href={`/clients/${item.clientId}/360`}>
                <span
                  className="text-sm font-medium hover:underline cursor-pointer"
                  data-testid={`link-client-${item.clientId}`}
                >
                  {name}
                </span>
              </Link>
              {item.crmStatus && (
                <Badge variant="outline" className="text-xs">
                  {item.crmStatus}
                </Badge>
              )}
            </div>

            {item.ownerName && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <User className="h-3 w-3 shrink-0" />
                <span data-testid={`text-owner-${item.clientId}`}>{item.ownerName}</span>
              </div>
            )}

            {item.nextFollowUpAt && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3 shrink-0" />
                <span data-testid={`text-followup-date-${item.clientId}`}>
                  {format(new Date(item.nextFollowUpAt), "MMM d, yyyy")}
                  {" - "}
                  {formatDistanceToNow(new Date(item.nextFollowUpAt), { addSuffix: true })}
                </span>
              </div>
            )}

            {item.followUpNotes && (
              <p
                className="text-xs text-muted-foreground line-clamp-2"
                data-testid={`text-notes-${item.clientId}`}
              >
                {item.followUpNotes}
              </p>
            )}

            {item.tags && item.tags.length > 0 && (
              <div className="flex flex-wrap gap-1" data-testid={`tags-${item.clientId}`}>
                {item.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
                {item.tags.length > 3 && (
                  <Badge variant="outline" className="text-xs">
                    +{item.tags.length - 3}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FollowUpSection({
  sectionKey,
  items,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: {
  sectionKey: SectionKey;
  items: FollowUpItem[];
  selectedIds: Set<string>;
  onToggleSelect: (clientId: string) => void;
  onToggleSelectAll: (sectionKey: SectionKey, items: FollowUpItem[]) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const config = SECTION_CONFIG[sectionKey];
  const sectionSelectedIds = items.filter((i) => selectedIds.has(i.clientId));
  const allSelected = items.length > 0 && sectionSelectedIds.length === items.length;
  const someSelected = sectionSelectedIds.length > 0 && !allSelected;

  return (
    <div data-testid={`section-${sectionKey}`}>
      <div className="flex items-center gap-3 mb-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          data-testid={`button-toggle-${sectionKey}`}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
        <h2 className="text-base font-semibold">{config.label}</h2>
        <span
          className={`inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-medium ${config.badgeClass}`}
          data-testid={`badge-count-${sectionKey}`}
        >
          {items.length}
        </span>
        {items.length > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <Checkbox
              checked={allSelected}
              ref={(el) => {
                if (el) {
                  (el as unknown as HTMLButtonElement).dataset.state = someSelected ? "indeterminate" : allSelected ? "checked" : "unchecked";
                }
              }}
              onCheckedChange={() => onToggleSelectAll(sectionKey, items)}
              data-testid={`checkbox-select-all-${sectionKey}`}
            />
            <span className="text-xs text-muted-foreground">Select all</span>
          </div>
        )}
      </div>
      {!collapsed && (
        <div className="space-y-2 ml-9">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4" data-testid={`text-empty-${sectionKey}`}>
              No follow-ups in this section
            </p>
          ) : (
            items.map((item) => (
              <FollowUpCard
                key={item.clientId}
                item={item}
                isSelected={selectedIds.has(item.clientId)}
                onToggleSelect={onToggleSelect}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function FollowUpsSkeleton() {
  return (
    <div className="space-y-6" data-testid="loading-followups">
      {Array.from({ length: 3 }).map((_, sectionIdx) => (
        <div key={sectionIdx} className="space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-8" />
          </div>
          <div className="space-y-2 ml-9">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-md" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CrmFollowupsPage() {
  const crmFlags = useCrmFlags();
  const { toast } = useToast();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState("");
  const [selectedDate, setSelectedDate] = useState("");

  const { data, isLoading } = useQuery<FollowUpsData>({
    queryKey: ["/api/crm/followups"],
    enabled: crmFlags.client360,
  });

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ["/api/users"],
    enabled: crmFlags.client360,
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      await apiRequest("POST", "/api/crm/bulk-update", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/followups"] });
      setSelectedIds(new Set());
      toast({ title: "Updated", description: "Bulk update applied successfully." });
    },
    onError: (error) => {
      const { title, description } = formatErrorForToast(error);
      toast({ title, description, variant: "destructive" });
    },
  });

  const toggleSelect = useCallback((clientId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) {
        next.delete(clientId);
      } else {
        next.add(clientId);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(
    (_sectionKey: SectionKey, items: FollowUpItem[]) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        const sectionIds = items.map((i) => i.clientId);
        const allSelected = sectionIds.every((id) => next.has(id));
        if (allSelected) {
          sectionIds.forEach((id) => next.delete(id));
        } else {
          sectionIds.forEach((id) => next.add(id));
        }
        return next;
      });
    },
    []
  );

  const handleAssignOwner = useCallback(() => {
    if (!selectedOwner || selectedIds.size === 0) return;
    bulkUpdateMutation.mutate({
      clientIds: Array.from(selectedIds),
      ownerUserId: selectedOwner,
    });
    setAssignDialogOpen(false);
    setSelectedOwner("");
  }, [selectedOwner, selectedIds, bulkUpdateMutation]);

  const handleSetDate = useCallback(() => {
    if (!selectedDate || selectedIds.size === 0) return;
    bulkUpdateMutation.mutate({
      clientIds: Array.from(selectedIds),
      nextFollowUpAt: new Date(selectedDate).toISOString(),
    });
    setDateDialogOpen(false);
    setSelectedDate("");
  }, [selectedDate, selectedIds, bulkUpdateMutation]);

  const totalItems = useMemo(() => {
    if (!data) return 0;
    return data.overdue.length + data.dueToday.length + data.next7Days.length;
  }, [data]);

  if (!crmFlags.client360) {
    return (
      <PageShell>
        <EmptyState
          icon={<AlertCircle className="h-12 w-12" />}
          title="Feature Not Enabled"
          description="The CRM Follow-ups feature is not enabled for your account. Please contact your administrator."
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Follow-ups"
        subtitle="Track and manage client follow-up tasks"
        icon={<CalendarClock className="h-6 w-6" />}
      />

      {selectedIds.size > 0 && (
        <div
          className="flex items-center gap-3 flex-wrap mb-6 p-3 rounded-md border bg-muted/50"
          data-testid="bulk-action-bar"
        >
          <CheckSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium" data-testid="text-selected-count">
            {selectedIds.size} selected
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAssignDialogOpen(true)}
            data-testid="button-bulk-assign"
          >
            <Users className="h-4 w-4 mr-2" />
            Assign Owner
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDateDialogOpen(true)}
            data-testid="button-bulk-date"
          >
            <Calendar className="h-4 w-4 mr-2" />
            Set Follow-up Date
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
            data-testid="button-clear-selection"
          >
            Clear
          </Button>
        </div>
      )}

      {isLoading ? (
        <FollowUpsSkeleton />
      ) : !data || totalItems === 0 ? (
        <EmptyState
          icon={<CalendarClock className="h-12 w-12" />}
          title="No follow-ups scheduled"
          description="Clients with upcoming follow-up dates will appear here."
        />
      ) : (
        <div className="space-y-8">
          <FollowUpSection
            sectionKey="overdue"
            items={data.overdue}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
          />
          <FollowUpSection
            sectionKey="dueToday"
            items={data.dueToday}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
          />
          <FollowUpSection
            sectionKey="next7Days"
            items={data.next7Days}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
          />
        </div>
      )}

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Owner</DialogTitle>
            <DialogDescription>
              Select a user to assign as the owner for {selectedIds.size} selected client(s).
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedOwner} onValueChange={setSelectedOwner}>
              <SelectTrigger data-testid="select-bulk-owner">
                <SelectValue placeholder="Select a user" />
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
                  <SelectItem key={user.id} value={String(user.id)}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAssignDialogOpen(false);
                setSelectedOwner("");
              }}
              data-testid="button-cancel-assign"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAssignOwner}
              disabled={!selectedOwner || bulkUpdateMutation.isPending}
              data-testid="button-confirm-assign"
            >
              {bulkUpdateMutation.isPending ? "Updating..." : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dateDialogOpen} onOpenChange={setDateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Follow-up Date</DialogTitle>
            <DialogDescription>
              Choose a follow-up date for {selectedIds.size} selected client(s).
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              data-testid="input-bulk-date"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDateDialogOpen(false);
                setSelectedDate("");
              }}
              data-testid="button-cancel-date"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSetDate}
              disabled={!selectedDate || bulkUpdateMutation.isPending}
              data-testid="button-confirm-date"
            >
              {bulkUpdateMutation.isPending ? "Updating..." : "Set Date"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
