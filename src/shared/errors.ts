export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export class DuplicateMemberError extends AppError {
  constructor(public matches: { id: string; name: string; active: boolean }[]) {
    super(
      "DUPLICATE_MEMBER",
      "Encontramos coincidencias de nombre, teléfono o correo. Revisa el directorio antes de continuar; un contacto compartido puede pertenecer a personas distintas.",
      409,
    );
  }
}
export class CheckInError extends AppError {
  constructor(
    public reason:
      "EXPIRED" | "FROZEN" | "SCHEDULED" | "SERVICE" | "NO_MEMBERSHIP",
    message: string,
  ) {
    super("ACCESS_DENIED", `Acceso denegado: ${message}`, 403);
  }
}
export function requireFound<T>(
  value: T | null | undefined,
  message = "Registro no disponible",
): T {
  if (value == null) throw new AppError("NOT_FOUND", message, 404);
  return value;
}
