"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
export function MemberPhotoUpload({ memberId }: { memberId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/gym/members/${memberId}/photo`, {
        method: "POST",
        body: new FormData(event.currentTarget),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error?.message ?? "No se pudo guardar la imagen",
        );
      setMessage("Fotografía guardada");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo conectar",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <label>
        Fotografía (opcional)
        <input
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
        />
      </label>
      <p className="muted">JPEG, PNG o WebP. Máximo 2 MB.</p>
      <button disabled={busy} className="button secondary">
        {busy ? "Guardando…" : "Guardar fotografía"}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
