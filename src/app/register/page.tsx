import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
export default function RegisterPage() {
  return (
    <main className="standalone">
      <Link className="wordmark dark" href="/login">
        MANCAR<span>GYM</span>
      </Link>
      <section className="panel narrow">
        <p className="eyebrow">EMPIEZA POR TU EQUIPO</p>
        <h1>Crea tu cuenta</h1>
        <p>Después configurarás tu organización y primera sucursal.</p>
        <AuthForm register />
        <Link href="/login">Ya tengo una cuenta</Link>
      </section>
    </main>
  );
}
