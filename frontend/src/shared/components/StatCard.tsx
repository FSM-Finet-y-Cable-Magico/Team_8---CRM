export function StatCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <article className="stat-card">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{hint}</small>
      </div>
    </article>
  );
}
