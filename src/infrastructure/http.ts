import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/shared/errors";
import { readEnvironment } from "./env";
import * as Sentry from "@sentry/nextjs";
export function checkOrigin(request: Request) {
  if (
    request.headers.get("origin") !==
    new URL(readEnvironment().BETTER_AUTH_URL).origin
  )
    throw new AppError("ORIGIN", "Origen no autorizado", 403);
}
export async function readBody(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AppError("CONTENT_TYPE", "Se requiere JSON", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("INVALID_JSON", "Solicitud vacía");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 32768) {
      await reader.cancel();
      throw new AppError("TOO_LARGE", "Solicitud demasiado grande", 413);
    }
    chunks.push(chunk.value);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError("INVALID_JSON", "Solicitud inválida");
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof AppError)
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  if (error instanceof z.ZodError)
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION",
          message: "Revisa los campos indicados",
          fields: z.flattenError(error).fieldErrors,
        },
      },
      { status: 422 },
    );
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  )
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Registro no disponible" } },
      { status: 404 },
    );
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2002", "P2003", "P2034"].includes(error.code)
  )
    return NextResponse.json(
      {
        error: {
          code: "CONFLICT",
          message:
            "El registro ya existe o cambió. Actualiza e inténtalo de nuevo.",
        },
      },
      { status: 409 },
    );
  const incident = crypto.randomUUID();
  if (process.env.SENTRY_DSN)
    Sentry.captureException(new Error("Application request failed"), {
      tags: {
        incident,
        errorType: error instanceof Error ? error.name : "unknown",
      },
    });
  console.error(
    JSON.stringify({
      level: "error",
      event: "request.failed",
      incident,
      type: error instanceof Error ? error.name : "unknown",
    }),
  );
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL",
        message: `No se pudo completar la operación. Referencia: ${incident}`,
      },
    },
    { status: 500 },
  );
}
