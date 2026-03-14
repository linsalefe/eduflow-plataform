import { Skeleton } from '@/components/ui/skeleton';

export function ChatSkeleton() {
  return (
    <div className="flex h-full">
      {/* Contact list */}
      <div className="w-[320px] border-r border-border p-3 space-y-3">
        <Skeleton className="h-9 w-full rounded-lg" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2">
            <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-3 w-10" />
          </div>
        ))}
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col p-4">
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 py-4 space-y-4">
          <div className="flex justify-start">
            <Skeleton className="h-16 w-56 rounded-2xl rounded-tl-sm" />
          </div>
          <div className="flex justify-end">
            <Skeleton className="h-12 w-48 rounded-2xl rounded-tr-sm" />
          </div>
          <div className="flex justify-start">
            <Skeleton className="h-20 w-64 rounded-2xl rounded-tl-sm" />
          </div>
          <div className="flex justify-end">
            <Skeleton className="h-10 w-40 rounded-2xl rounded-tr-sm" />
          </div>
        </div>

        {/* Composer */}
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}