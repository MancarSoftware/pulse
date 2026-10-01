export default function Loading() {
  return (
    <div className="panel" role="status" aria-live="polite">
      <h2>Cargando información…</h2>
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}
