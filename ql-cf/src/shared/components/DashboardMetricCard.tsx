export function DashboardMetricCard({
  label,
  value,
  suffix,
  detail,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  detail?: string;
}) {
  return (
    <article className="dashboard-metric-card">
      <p className="dashboard-metric-label">{label}</p>
      <p className="dashboard-metric-value">
        {value}
        {suffix && <span className="dashboard-metric-suffix">{suffix}</span>}
      </p>
      {detail && <p className="dashboard-metric-detail">{detail}</p>}
    </article>
  );
}
