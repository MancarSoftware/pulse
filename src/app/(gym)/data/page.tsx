import { pageContext } from "@/lib/page-context";
import { db } from "@/infrastructure/db";
import { MemberImport } from "@/components/member-import";
import { DataExport } from "@/components/data-export";
export default async function DataPage() {
  const ctx = await pageContext();
  if (ctx.role !== "OWNER")
    return (
      <section className="panel">
        <h1>Acceso restringido</h1>
        <p>Solo el propietario puede importar y exportar registros.</p>
      </section>
    );
  const branches = await db.branch.findMany({
    where: { organizationId: ctx.organizationId },
    select: { id: true, name: true, active: true },
    orderBy: { name: "asc" },
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">TUS DATOS EN GYMORA</p>
          <h1>Importar y exportar</h1>
          <p className="muted">
            Revisa los registros antes de guardarlos y descarga la información
            de tu gimnasio.
          </p>
        </div>
      </div>
      <MemberImport branches={branches.filter((branch) => branch.active)} />
      <DataExport branches={branches} />
    </>
  );
}
