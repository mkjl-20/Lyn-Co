export function DashboardSkeletonGrid({
  count,
  variant = "metric",
  className = "",
  label = "Loading dashboard information",
}: {
  count: number;
  variant?: "metric" | "queue" | "panel";
  className?: string;
  label?: string;
}) {
  return (
    <div role="status" aria-label={label} className={`grid gap-3 ${className}`}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} aria-hidden="true" className={`dashboard-skeleton-card dashboard-skeleton-${variant}`}>
          {variant === "metric" ? (
            <>
              <span className="dashboard-skeleton-line w-2/5" />
              <span className="dashboard-skeleton-line mt-5 h-9 w-1/3" />
              <span className="dashboard-skeleton-line mt-3 w-3/5" />
            </>
          ) : variant === "queue" ? (
            <div className="flex items-center gap-3">
              <span className="dashboard-skeleton-circle" />
              <div className="min-w-0 flex-1">
                <span className="dashboard-skeleton-line w-2/5" />
                <span className="dashboard-skeleton-line mt-2 w-3/5" />
              </div>
              <span className="dashboard-skeleton-line w-16" />
            </div>
          ) : (
            <>
              <span className="dashboard-skeleton-line w-2/5" />
              <span className="dashboard-skeleton-line mt-5 h-24 w-full" />
              <span className="dashboard-skeleton-line mt-3 w-3/5" />
            </>
          )}
        </div>
      ))}
    </div>
  );
}
