import { expiryLabel, expiryUrgency } from '../../lib';

export function ExpiryBadge({ days }: { days: number }) {
  return <span className={`expiry-badge expiry-badge-${expiryUrgency(days)}`}>{expiryLabel(days)}</span>;
}
