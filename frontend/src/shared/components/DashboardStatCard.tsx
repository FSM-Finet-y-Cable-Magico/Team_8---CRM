import type { LucideIcon } from 'lucide-react';

export type StatCardTone = 'mint' | 'teal' | 'blue' | 'orange' | 'rose' | 'violet' | 'green' | 'amber';

export function DashboardStatCard({
  label,
  value,
  description,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
  tone: StatCardTone;
}) {
  return (
    <article className={`dashboard-stat-card dashboard-stat-card-${tone}`}>
      <span className="dashboard-stat-card-icon" aria-hidden="true">
        <Icon size={21} strokeWidth={1.8} />
      </span>
      <div className="dashboard-stat-card-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{description}</small>
      </div>
    </article>
  );
}
