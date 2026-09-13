import { ArrowRight, type LucideIcon } from 'lucide-react';
import type { StatCardTone } from './DashboardStatCard';

export function QuickActionCard<TTab extends string>({
  label,
  description,
  icon: Icon,
  tone,
  tab,
  onNavigate,
}: {
  label: string;
  description: string;
  icon: LucideIcon;
  tone: StatCardTone;
  tab: TTab;
  onNavigate: (tab: TTab) => void;
}) {
  return (
    <button type="button" className={`quick-action-card quick-action-card-${tone}`} onClick={() => onNavigate(tab)}>
      <span className="quick-action-icon" aria-hidden="true">
        <Icon size={20} strokeWidth={1.8} />
      </span>
      <span className="quick-action-copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <ArrowRight className="quick-action-arrow" size={17} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}
