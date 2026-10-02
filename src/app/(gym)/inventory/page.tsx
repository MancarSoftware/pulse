import { pageContext } from "@/lib/page-context";
import { authorize } from "@/modules/auth/permissions";
import {
  lookups,
  queryScope,
  pagination,
  type Search,
} from "@/modules/reports/queries";
import { db } from "@/infrastructure/db";
import { OperationForm, type Field } from "@/components/operation-form";
import { Modal } from "@/components/modal";
import { Pagination } from "@/components/pagination";
import { formatMoney } from "@/shared/money";
import { formatDate } from "@/shared/dates";
import { DeleteAction } from "@/components/delete-action";
export default async function Inventory({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const ctx = await pageContext();
  authorize(ctx, "inventory:write");
  const search = await searchParams;
  const scope = queryScope(ctx, search);
  const branchId = scope.branchId ?? ctx.branchId;
  const { page, skip, take } = pagination(search);
  const q = typeof search.q === "string" ? search.q.trim().slice(0, 100) : "";
  const where = {
    organizationId: ctx.organizationId,
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
  };
  const [products, total, data, movements] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: { name: "asc" },
      skip,
      take,
      include: { inventories: { where: { branchId } } },
    }),
    db.product.count({ where }),
    lookups(ctx),
    db.inventoryMovement.findMany({
      where: { organizationId: ctx.organizationId, branchId },
      take: 25,
      orderBy: { createdAt: "desc" },
      include: { product: { select: { name: true } } },
    }),
  ]);
  const productFields: Field[] = [
    { name: "name", label: "Nombre" },
    { name: "sku", label: "SKU" },
    { name: "barcode", label: "Código de barras", required: false },
    { name: "category", label: "Categoría", required: false },
    {
      name: "cost",
      label: "Costo USD",
      type: "decimal",
      min: "0",
      value: "0.00",
    },
    { name: "price", label: "Precio USD", type: "decimal" },
    {
      name: "lowStock",
      label: "Umbral de stock bajo",
      type: "number",
      min: "0",
      max: "100000",
      value: "5",
    },
    { name: "active", label: "Disponible para venta", type: "checkbox" },
    {
      name: "description",
      label: "Descripción",
      type: "textarea",
      required: false,
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PRODUCTOS Y EXISTENCIAS</p>
          <h1>Inventario</h1>
          <p className="muted">Cada unidad tiene una historia.</p>
        </div>
        <Modal title="Crear producto" trigger="Nuevo producto">
          <OperationForm
            endpoint="/api/gym/catalog"
            fixed={{ kind: "product" }}
            fields={productFields}
          />
        </Modal>
      </div>
      <section className="panel">
        <form className="filters">
          <label>
            Buscar producto
            <input name="q" defaultValue={q} />
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
          <button className="button secondary">Filtrar</button>
        </form>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Precio</th>
                <th>Existencias</th>
                <th>Operaciones</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const stock = p.inventories[0]?.quantity ?? 0;
                return (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      <br />
                      <small>
                        {p.sku} · {p.active ? "Activo" : "Deshabilitado"}
                      </small>
                    </td>
                    <td>{formatMoney(p.price)}</td>
                    <td>
                      <span
                        className={`status ${stock <= p.lowStock ? "warning" : ""}`}
                      >
                        {stock} unidades
                      </span>
                    </td>
                    <td>
                      <div className="inline">
                        <Modal
                          title={`Movimiento: ${p.name}`}
                          trigger="Mover stock"
                        >
                          <OperationForm
                            endpoint="/api/gym/movements"
                            fixed={{ branchId, productId: p.id }}
                            label="Registrar movimiento"
                            fields={[
                              {
                                name: "kind",
                                label: "Tipo",
                                type: "select",
                                options: [
                                  { value: "PURCHASE", label: "Compra (+)" },
                                  { value: "DAMAGED", label: "Daño (-)" },
                                  {
                                    value: "ADJUSTMENT",
                                    label: "Ajuste (+/-)",
                                  },
                                  { value: "RETURN", label: "Devolución (+)" },
                                ],
                              },
                              {
                                name: "quantity",
                                label: "Cantidad con signo",
                                type: "number",
                                signed: true,
                                min: "-100000",
                                max: "100000",
                                hint: "Ejemplo: 20 para entrada, -2 para salida.",
                              },
                              { name: "reason", label: "Motivo" },
                            ]}
                          />
                        </Modal>
                        <Modal title="Editar producto" trigger="Editar">
                          <OperationForm
                            endpoint="/api/gym/catalog"
                            fixed={{ kind: "product", id: p.id }}
                            fields={productFields.map((f) => ({
                              ...f,
                              value: String(p[f.name as keyof typeof p] ?? ""),
                            }))}
                          />
                        </Modal>
                        <DeleteAction kind="product" id={p.id} name={p.name} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!products.length && (
          <div className="empty">
            <h3>Tu inventario empieza con un producto</h3>
            <p>Agrega el catálogo y registra su primera entrada de stock.</p>
          </div>
        )}
        <Pagination
          page={page}
          total={total}
          search={search}
          path="/inventory"
        />
      </section>
      <section className="panel">
        <h2>Últimos 25 movimientos</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Producto</th>
                <th>Tipo</th>
                <th>Cantidad</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id}>
                  <td>{formatDate(m.createdAt)}</td>
                  <td>{m.product.name}</td>
                  <td>{m.kind}</td>
                  <td>
                    {m.quantity > 0 ? "+" : ""}
                    {m.quantity}
                  </td>
                  <td>{m.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
