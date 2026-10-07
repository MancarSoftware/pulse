import { Brand } from "@/components/brand";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
export default function RegisterPage() {
  return (
    <main className="standalone">
      <Link className="wordmark dark" href="/login">
        <Brand />
      </Link>
      <section className="panel narrow">
        <p className="eyebrow">EMPIEZA POR TU EQUIPO</p>
        <h1>Prueba Gymora durante 2 días</h1>
        <p>
          Crea tu cuenta y después configura tu gimnasio. La prueba empieza al
          crear la organización y dura 48 horas. No necesitas tarjeta. Los datos
          que registres se conservan cuando actives un plan.
        </p>
        <AuthForm register />
        <Link href="/login">Ya tengo una cuenta</Link>
      </section>
    </main>
  );
}
