"use client";
export default function ErrorBoundary({ reset }: { reset: () => void }) {
  return (
    <section className="panel">
      <h1>No pudimos cargar esta vista</h1>
      <p>
        Revisa tu conexión e inténtalo de nuevo. Si el problema continúa,
        contacta al administrador.
      </p>
      <button className="button" onClick={reset}>
        Reintentar
      </button>
    </section>
  );
}
