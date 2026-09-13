export function HistoryBox({ title, value }: { title: string; value: string | number }) {
  return (
    <article className="history-box">
      <span>{title}</span>
      <strong>{value}</strong>
    </article>
  );
}
