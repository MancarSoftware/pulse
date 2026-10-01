import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/modules/auth/auth";
import { db } from "@/infrastructure/db";
import { OperationForm } from "@/components/operation-form";
export default async function Setup() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  if (await db.staff.findUnique({ where: { userId: session.user.id } }))
    redirect("/dashboard");
  return (
    <main className="standalone">
      <section className="panel narrow">
        <p className="eyebrow">CONFIGURACIÓN INICIAL</p>
        <h1>Tu gimnasio empieza aquí</h1>
        <p>Moneda USD · Ecuador continental · recibos internos</p>
        <OperationForm
          endpoint="/api/setup"
          redirectTo="/dashboard"
          label="Crear mi organización"
          fields={[
            { name: "name", label: "Nombre del gimnasio" },
            { name: "branchName", label: "Primera sucursal" },
            { name: "address", label: "Dirección", required: false },
          ]}
        />
      </section>
    </main>
  );
}
