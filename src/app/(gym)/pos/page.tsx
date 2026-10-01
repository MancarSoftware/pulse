import { pageContext } from "@/lib/page-context";
import { authorize } from "@/modules/auth/permissions";
import {
  lookups,
  queryScope,
  pagination,
  type Search,
} from "@/modules/reports/queries";
import { db } from "@/infrastructure/db";
import { PosCart } from "@/components/pos-cart";
import { Pagination } from "@/components/pagination";
export default async function Pos({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const ctx = await pageContext();
  authorize(ctx, "payments:write");
  const search = await searchParams;
  const scope = queryScope(ctx, search);
  const branchId = scope.branchId ?? ctx.branchId;
  const { page, skip, take } = pagination(search);
  const q = typeof search.q === "string" ? search.q.trim().slice(0, 100) : "";
  const where = {
    organizationId: ctx.organizationId,
    active: true,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { sku: { contains: q, mode: "insensitive" as const } },
            { barcode: q },
          ],
        }
      : {}),
  };
  const [products, total, data] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: { name: "asc" },
      skip,
      take,
      include: { inventories: { where: { branchId } } },
    }),
    db.product.count({ where }),
    lookups(ctx),
  ]);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">COMERCIO</p>
          <h1>Punto de venta</h1>
          <p className="muted">
            Cobro y stock actualizados en una sola operación.
          </p>
        </div>
      </div>
      <form className="filters">
        <label className="search">
          Buscar producto
          <input
            name="q"
            defaultValue={q}
            placeholder="Nombre, SKU o código de barras"
          />
        </label>
        <label>
          Sucursal
          <select name="branch" defaultValue={branchId}>
            {data.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <button className="button secondary">Buscar</button>
      </form>
      <PosCart
        key={branchId}
        branchId={branchId}
        methods={data.methods.map((m) => ({ id: m.id, name: m.name }))}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price.toFixed(2),
          available: p.inventories[0]?.quantity ?? 0,
        }))}
      />
      <Pagination page={page} total={total} search={search} path="/pos" />
    </>
  );
}
