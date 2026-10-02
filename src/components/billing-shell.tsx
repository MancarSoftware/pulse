import Link from "next/link";
import { Logout } from "./auth-form";
export function BillingShell({
  children,
  platformAdmin = false,
}: {
  children: React.ReactNode;
  platformAdmin?: boolean;
}) {
  return (
    <div className="billing-shell">
      <a className="skip" href="#main">
        Saltar al contenido
      </a>
      <header className="billing-header">
        <Link href="/dashboard" className="wordmark">
          MANCAR<span>GYM</span>
        </Link>
        <nav aria-label="Facturación">
          <Link href="/subscription">Mi suscripción</Link>
          {platformAdmin && <Link href="/platform">Administración SaaS</Link>}
          <Logout />
        </nav>
      </header>
      <main id="main">{children}</main>
      <footer>MANCAR · Suscripciones del sistema · USD</footer>
    </div>
  );
}
