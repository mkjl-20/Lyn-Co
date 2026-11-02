export function DashboardMetricCard({
  label,
  value,
  index,
  suffix,
  detail,
}: {
  label: string;
  value: number | string;
  index?: string;
  suffix?: string;
  detail?: string;
}) {
  return (
    <article className="dashboard-metric-card">
      <div className="flex items-center justify-between gap-3">
        <p className="dashboard-metric-label">{label}</p>
        {index && <span className="dashboard-metric-index">{index}</span>}
      </div>
      <p className="dashboard-metric-value">
        {value}
        {suffix && <span className="dashboard-metric-suffix">{suffix}</span>}
      </p>
      {detail && <p className="dashboard-metric-detail">{detail}</p>}
    </article>
  );
}
