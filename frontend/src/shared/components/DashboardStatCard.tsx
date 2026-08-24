import type { LucideIcon } from 'lucide-react';

export type StatCardTone = 'mint' | 'teal' | 'blue' | 'orange' | 'rose' | 'violet' | 'green' | 'amber';

export function DashboardStatCard({
  label,
  value,
  description,
  icon: Icon,
  tone,
  onClick,
}: {
  label: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
  tone: StatCardTone;
  onClick?: () => void;
}) {
  const content = <>
    <span className="dashboard-stat-card-icon" aria-hidden="true">
      <Icon size={21} strokeWidth={1.8} />
    </span>
    <div className="dashboard-stat-card-copy">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{description}</small>
    </div>
  </>;

  if (onClick) {
    return <button type="button" className={`dashboard-stat-card dashboard-stat-card-${tone} dashboard-stat-card-link`} onClick={onClick}>{content}</button>;
  }

  return (
    <article className={`dashboard-stat-card dashboard-stat-card-${tone}`}>
      {content}
    </article>
  );
}
