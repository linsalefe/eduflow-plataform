import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface KanbanSkeletonProps {
  columns?: number;
  cardsPerColumn?: number;
}

export function KanbanSkeleton({ columns = 5, cardsPerColumn = 3 }: KanbanSkeletonProps) {
  return (
    <div className="flex gap-4 h-full overflow-x-auto p-4">
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="w-[280px] flex-shrink-0 flex flex-col">
          {/* Column header */}
          <div className="px-4 py-3 rounded-t-xl bg-muted/50 border border-b-0 border-border">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-8 rounded-full" />
            </div>
          </div>

          {/* Cards */}
          <div className="flex-1 border border-t-0 border-border rounded-b-xl p-2.5 space-y-2.5">
            {Array.from({ length: cardsPerColumn }).map((_, j) => (
              <Card key={j} className="p-3.5">
                <div className="flex items-center gap-2.5 mb-2">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
                <div className="flex gap-1 mb-2">
                  <Skeleton className="h-4 w-14 rounded" />
                  <Skeleton className="h-4 w-10 rounded" />
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-10 rounded" />
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}