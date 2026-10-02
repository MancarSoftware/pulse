import Link from "next/link";
import type { Search } from "@/modules/reports/queries";
export function Pagination({
  page,
  total,
  search,
  path,
  pageSize = 25,
}: {
  page: number;
  total: number;
  search: Search;
  path: string;
  pageSize?: number;
}) {
  function href(next: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(search))
      if (typeof value === "string") params.set(key, value);
    params.set("page", String(next));
    return `${path}?${params}`;
  }
  return (
    <div className="pagination">
      <span className="muted">
        {total} registros · Página {page} de{" "}
        {Math.max(1, Math.ceil(total / pageSize))}
      </span>
      <div className="inline">
        {page > 1 && <Link href={href(page - 1)}>← Anterior</Link>}
        {page * pageSize < total && (
          <Link href={href(page + 1)}>Siguiente →</Link>
        )}
      </div>
    </div>
  );
}
