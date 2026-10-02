"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "./icon";
import { NumericInput } from "./numeric-input";
type Product = {
  id: string;
  name: string;
  price: string;
  available: number;
  sku: string;
  category: string;
};
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
    <div className="pos-workspace">
      <section className="panel pos-catalog">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CATÁLOGO DE LA SUCURSAL</p>
            <h2>Productos disponibles</h2>
          </div>
          <span className="status">{products.length} productos</span>
        </div>
        {products.length ? (
          <div className="pos-products">
            {products.map((p) => {
              const selected =
                cart.find((line) => line.product.id === p.id)?.quantity ?? 0;
              return (
                <article
                  className={`pos-product ${selected ? "selected" : ""}`}
                  key={p.id}
                >
                  <div className="pos-product-top">
                    <span className="product-symbol">
                      <Icon name="inventory" />
                    </span>
                    <span
                      className={`stock-label ${p.available < 1 ? "out" : p.available <= 5 ? "low" : ""}`}
                    >
                      {p.available < 1
                        ? "Sin stock"
                        : `${p.available} disponibles`}
                    </span>
                  </div>
                  <small className="muted">
                    {p.category || "Productos"} · {p.sku}
                  </small>
                  <h3>{p.name}</h3>
                  <div className="pos-product-bottom">
                    <strong>${p.price}</strong>
                    <button
                      className="button secondary"
                      disabled={busy || selected >= p.available}
                      aria-label={`Agregar ${p.name}`}
                      onClick={() => {
                        setReceipt("");
                        setCart((previous) => {
                          const existing = previous.find(
                            (line) => line.product.id === p.id,
                          );
                          return existing
                            ? previous.map((line) =>
                                line.product.id === p.id
                                  ? {
                                      ...line,
                                      quantity: Math.min(
                                        line.quantity + 1,
                                        p.available,
                                      ),
                                    }
                                  : line,
                              )
                            : [...previous, { product: p, quantity: 1 }];
                        });
                      }}
                    >
                      + Agregar
                    </button>
                  </div>
                  {selected > 0 && (
                    <small className="in-cart">{selected} en esta venta</small>
                  )}
                </article>
              );
            })}
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
      <section className="panel pos-checkout">
        <div className="section-heading">
          <div>
            <p className="eyebrow">VENTA ACTUAL</p>
            <h2>Carrito</h2>
          </div>
          <span className="cart-count" aria-live="polite">
            {cart.reduce((sum, line) => sum + line.quantity, 0)} unidades
          </span>
        </div>
        {cart.length ? (
          cart.map((l) => (
            <div className="cart-line" key={l.product.id}>
              <div>
                <strong>{l.product.name}</strong>
                <br />
                <small>${l.product.price} / unidad</small>
                <span className="line-subtotal">
                  {display(cents(l.product.price) * BigInt(l.quantity))}
                </span>
              </div>
              <div className="quantity-control">
                <button
                  type="button"
                  disabled={busy || l.quantity <= 1}
                  aria-label={`Reducir cantidad de ${l.product.name}`}
                  onClick={() =>
                    setCart((previous) =>
                      previous.map((line) =>
                        line.product.id === l.product.id
                          ? { ...line, quantity: line.quantity - 1 }
                          : line,
                      ),
                    )
                  }
                >
                  −
                </button>
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
                  type="button"
                  disabled={busy || l.quantity >= l.product.available}
                  aria-label={`Aumentar cantidad de ${l.product.name}`}
                  onClick={() =>
                    setCart((previous) =>
                      previous.map((line) =>
                        line.product.id === l.product.id
                          ? { ...line, quantity: line.quantity + 1 }
                          : line,
                      ),
                    )
                  }
                >
                  +
                </button>
              </div>
              <button
                className="cart-remove"
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
          <div className="pos-empty">
            <Icon name="pos" />
            <h3>Prepara tu primera venta</h3>
            <p className="muted">
              Agrega productos del catálogo. Aquí podrás revisar cantidades y el
              importe antes de cobrar.
            </p>
          </div>
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
          className="button checkout-submit"
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
