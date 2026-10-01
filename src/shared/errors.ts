export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function requireFound<T>(
  value: T | null | undefined,
  message = "Registro no disponible",
): T {
  if (value == null) throw new AppError("NOT_FOUND", message, 404);
  return value;
}
