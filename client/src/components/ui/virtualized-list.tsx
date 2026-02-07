import { Virtuoso, VirtuosoProps } from "react-virtuoso";
import { forwardRef } from "react";

interface VirtualizedListProps<T> {
  data: T[];
  itemContent: (index: number, item: T) => React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  overscan?: number;
  endReached?: () => void;
  isLoadingMore?: boolean;
  emptyContent?: React.ReactNode;
  headerContent?: React.ReactNode;
  footerContent?: React.ReactNode;
  initialTopMostItemIndex?: number;
  followOutput?: VirtuosoProps<T, unknown>["followOutput"];
  atBottomStateChange?: (atBottom: boolean) => void;
  increaseViewportBy?: number | { top: number; bottom: number };
}

const ScrollerComponent = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => <div {...props} ref={ref} />
);
ScrollerComponent.displayName = "ScrollerComponent";

export function VirtualizedList<T>({
  data,
  itemContent,
  className,
  style,
  overscan = 200,
  endReached,
  emptyContent,
  headerContent,
  footerContent,
  initialTopMostItemIndex,
  followOutput,
  atBottomStateChange,
  increaseViewportBy,
}: VirtualizedListProps<T>) {
  if (data.length === 0 && emptyContent) {
    return <>{emptyContent}</>;
  }

  return (
    <Virtuoso
      data={data}
      itemContent={itemContent}
      className={className}
      style={style}
      overscan={overscan}
      endReached={endReached}
      initialTopMostItemIndex={initialTopMostItemIndex}
      followOutput={followOutput}
      atBottomStateChange={atBottomStateChange}
      increaseViewportBy={increaseViewportBy}
      components={{
        Header: headerContent ? () => <>{headerContent}</> : undefined,
        Footer: footerContent ? () => <>{footerContent}</> : undefined,
      }}
    />
  );
}
