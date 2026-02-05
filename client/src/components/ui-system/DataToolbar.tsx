import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Search, X, ArrowUpDown, LayoutGrid, List, Table2, Plus, LucideIcon } from "lucide-react";

export type ViewMode = "list" | "grid" | "table" | "board";

export interface SortOption {
  value: string;
  label: string;
}

export interface FilterOption {
  value: string;
  label: string;
}

interface DataToolbarProps {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  
  sortValue?: string;
  onSortChange?: (value: string) => void;
  sortOptions?: SortOption[];
  sortLabel?: string;
  
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  availableViews?: ViewMode[];
  
  filters?: React.ReactNode;
  
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
    disabled?: boolean;
  };
  
  secondaryActions?: React.ReactNode;
  
  className?: string;
  "data-testid"?: string;
}

const viewIcons: Record<ViewMode, LucideIcon> = {
  list: List,
  grid: LayoutGrid,
  table: Table2,
  board: LayoutGrid,
};

const viewLabels: Record<ViewMode, string> = {
  list: "List",
  grid: "Grid",
  table: "Table",
  board: "Board",
};

export function DataToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
  sortValue,
  onSortChange,
  sortOptions,
  sortLabel = "Sort by",
  viewMode,
  onViewModeChange,
  availableViews = ["list", "grid"],
  filters,
  primaryAction,
  secondaryActions,
  className,
  "data-testid": testId,
}: DataToolbarProps) {
  const hasSearch = onSearchChange !== undefined;
  const hasSort = onSortChange && sortOptions && sortOptions.length > 0;
  const hasViewToggle = onViewModeChange && availableViews.length > 1;
  const hasFilters = !!filters;
  const hasPrimaryAction = !!primaryAction;
  const hasSecondaryActions = !!secondaryActions;

  return (
    <div 
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
      data-testid={testId}
    >
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {hasSearch && (
          <div className="relative w-full sm:w-auto sm:min-w-[200px] sm:max-w-[300px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-9 pr-9"
              data-testid="input-toolbar-search"
            />
            {searchValue && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                onClick={() => onSearchChange("")}
                data-testid="button-clear-search"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}

        {hasFilters && (
          <div className="flex flex-wrap items-center gap-2">
            {filters}
          </div>
        )}

        {hasSort && (
          <Select value={sortValue} onValueChange={onSortChange}>
            <SelectTrigger 
              className="w-[140px] sm:w-[160px]" 
              data-testid="select-toolbar-sort"
            >
              <ArrowUpDown className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              <SelectValue placeholder={sortLabel} />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((option) => (
                <SelectItem 
                  key={option.value} 
                  value={option.value}
                  data-testid={`sort-option-${option.value}`}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex items-center gap-2">
        {hasViewToggle && (
          <ToggleGroup 
            type="single" 
            value={viewMode} 
            onValueChange={(value) => value && onViewModeChange(value as ViewMode)}
            className="hidden sm:flex"
            data-testid="toggle-view-mode"
          >
            {availableViews.map((mode) => {
              const Icon = viewIcons[mode];
              return (
                <ToggleGroupItem 
                  key={mode} 
                  value={mode} 
                  aria-label={viewLabels[mode]}
                  data-testid={`view-mode-${mode}`}
                >
                  <Icon className="h-4 w-4" />
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
        )}

        {hasSecondaryActions && (
          <div className="flex items-center gap-2">
            {secondaryActions}
          </div>
        )}

        {hasPrimaryAction && (
          <Button 
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled}
            data-testid="button-toolbar-primary"
          >
            {primaryAction.icon ? (
              <primaryAction.icon className="h-4 w-4 mr-2" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            {primaryAction.label}
          </Button>
        )}
      </div>
    </div>
  );
}

interface FilterSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: FilterOption[];
  placeholder?: string;
  allLabel?: string;
  className?: string;
  "data-testid"?: string;
}

export function FilterSelect({
  value,
  onValueChange,
  options,
  placeholder = "Filter",
  allLabel = "All",
  className,
  "data-testid": testId,
}: FilterSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger 
        className={cn("w-[130px]", className)} 
        data-testid={testId}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface ActiveFiltersProps {
  filters: Array<{ key: string; label: string; value: string }>;
  onRemove: (key: string) => void;
  onClearAll?: () => void;
  className?: string;
}

export function ActiveFilters({
  filters,
  onRemove,
  onClearAll,
  className,
}: ActiveFiltersProps) {
  if (filters.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {filters.map((filter) => (
        <div 
          key={filter.key}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-muted rounded-md"
        >
          <span className="text-muted-foreground">{filter.label}:</span>
          <span className="font-medium">{filter.value}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-4 w-4 ml-1"
            onClick={() => onRemove(filter.key)}
            data-testid={`remove-filter-${filter.key}`}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
      {onClearAll && filters.length > 1 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          onClick={onClearAll}
          data-testid="button-clear-all-filters"
        >
          Clear all
        </Button>
      )}
    </div>
  );
}
