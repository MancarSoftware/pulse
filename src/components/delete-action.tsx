"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "./icon";
export function DeleteAction({
  kind,
  id,
  name,
}: {
  kind: string;
  id: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          setOpen(next);
          setError("");
        }
      }}
    >
      <Dialog.Trigger
        className="delete-trigger"
        aria-label={`Eliminar ${name}`}
      >
        <Icon name="trash" /> Eliminar
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal-content delete-dialog">
          <div className="delete-symbol">
            <Icon name="trash" />
          </div>
          <Dialog.Title asChild>
            <h2>Eliminar {name}</h2>
          </Dialog.Title>
          <Dialog.Description className="muted">
            Se eliminará este registro de la configuración. Esta acción no se
            puede deshacer. Si tiene operaciones asociadas, te indicaremos cómo
            deshabilitarlo.
          </Dialog.Description>
          {error && (
            <p className="notice danger" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <Dialog.Close className="button secondary" disabled={busy}>
              Cancelar
            </Dialog.Close>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const response = await fetch("/api/gym/catalog", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ kind, id }),
                  });
                  const result = await response.json();
                  if (!response.ok)
                    throw new Error(
                      result.error?.message ?? "No se pudo eliminar",
                    );
                  setOpen(false);
                  router.refresh();
                } catch (failure) {
                  setError(
                    failure instanceof Error
                      ? failure.message
                      : "No se pudo conectar. Inténtalo de nuevo.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Eliminando…" : "Confirmar eliminación"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
