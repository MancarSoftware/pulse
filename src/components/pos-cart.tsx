"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { NumericInput } from "./numeric-input";
type Product = { id: string; name: string; price: string; available: number };
const cents = (value: string) => {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
};
const display = (value: bigint) =>
  `$${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
export function PosCart({
  products,
  methods,
  branchId,
}: {
  products: Product[];
  methods: { id: string; name: string }[];
  branchId: string;
}) {
  const [cart, setCart] = useState<{ product: Product; quantity: number }[]>(
    [],
  );
  const [method, setMethod] = useState(methods[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  const [key, setKey] = useState<string | null>(null);
  const router = useRouter();
  const total = cart.reduce(
    (sum, line) => sum + cents(line.product.price) * BigInt(line.quantity),
    0n,
  );
  async function sell() {
    setBusy(true);
    setError("");
    const idempotencyKey = key ?? crypto.randomUUID();
    setKey(idempotencyKey);
    try {
      const response = await fetch("/api/gym/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          paymentMethodId: method,
          idempotencyKey,
          lines: cart.map((l) => ({
            productId: l.product.id,
            quantity: l.quantity,
            expectedPrice: l.product.price,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error?.message ?? "No se pudo registrar la venta");
      setReceipt(data.id);
      setCart([]);
      setKey(null);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo conectar. Reintenta con el mismo carrito.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="split">
      <section className="panel">
        <h2>Productos disponibles</h2>
        {products.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Precio</th>
                  <th>Stock</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>${p.price}</td>
                    <td>{p.available}</td>
                    <td>
                      <button
                        className="button secondary"
                        disabled={busy || p.available < 1}
                        aria-label={`Agregar ${p.name}`}
                        onClick={() => {
                          setReceipt("");
                          setCart((prev) => {
                            const existing = prev.find(
                              (l) => l.product.id === p.id,
                            );
                            return existing
                              ? prev.map((l) =>
                                  l.product.id === p.id
                                    ? {
                                        ...l,
                                        quantity: Math.min(
                                          l.quantity + 1,
                                          p.available,
                                        ),
                                      }
                                    : l,
                                )
                              : [...prev, { product: p, quantity: 1 }];
                          });
                        }}
                      >
                        Agregar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h3>No hay productos disponibles</h3>
            <p>
              Configura productos e ingresa inventario para empezar a vender.
            </p>
          </div>
        )}
      </section>
      <section className="panel">
        <p className="eyebrow">VENTA ACTUAL</p>
        <h2>Carrito</h2>
        {cart.length ? (
          cart.map((l) => (
            <div className="cart-line" key={l.product.id}>
              <div>
                <strong>{l.product.name}</strong>
                <br />
                <small>${l.product.price} / unidad</small>
              </div>
              <label>
                <span className="sr-only">Cantidad de {l.product.name}</span>
                <NumericInput
                  min={1}
                  max={l.product.available}
                  required
                  value={l.quantity}
                  disabled={busy}
                  onChange={(e) =>
                    setCart((prev) =>
                      prev.map((v) =>
                        v.product.id === l.product.id
                          ? {
                              ...v,
                              quantity: Math.min(
                                l.product.available,
                                Math.max(1, Number(e.target.value) || 1),
                              ),
                            }
                          : v,
                      ),
                    )
                  }
                />
              </label>
              <button
                disabled={busy}
                aria-label={`Quitar ${l.product.name}`}
                onClick={() =>
                  setCart((prev) =>
                    prev.filter((v) => v.product.id !== l.product.id),
                  )
                }
              >
                Quitar
              </button>
            </div>
          ))
        ) : (
          <p className="muted">Agrega productos para iniciar una venta.</p>
        )}
        <div className="total">
          <span>Total</span>
          <span>{display(total)}</span>
        </div>
        <label>
          Forma de pago
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            disabled={busy}
          >
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted" style={{ marginTop: 16 }}>
          Confirma solo después de recibir el pago.
        </p>
        <button
          className="button"
          onClick={sell}
          disabled={busy || !cart.length || !method}
        >
          {busy ? "Registrando…" : "Confirmar venta"}
        </button>
        {error && (
          <p className="notice danger" role="alert">
            {error}
          </p>
        )}
        {receipt && (
          <p className="notice success" role="status">
            Venta registrada.{" "}
            <Link href={`/receipts/${receipt}`}>Abrir recibo →</Link>
          </p>
        )}
      </section>
    </div>
  );
}
