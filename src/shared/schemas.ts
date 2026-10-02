import { z } from "zod";
export const phoneNumber = z
  .string()
  .regex(
    /^[0-9]{1,10}$/,
    "El teléfono debe contener solo números, con un máximo de 10 dígitos",
  );
export const memberEmail = z
  .union([
    z.email("Ingresa un correo válido con @, por ejemplo nombre@dominio.com"),
    z.literal(""),
  ])
  .optional();
export const id = z.string().min(1).max(100);
export const name = z.string().trim().min(2).max(100);
export const amount = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Importe inválido")
  .refine((v) => Number(v) > 0, "El importe debe ser mayor que cero");
export const nonnegativeAmount = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);
export const paymentFields = {
  branchId: id,
  paymentMethodId: id,
  idempotencyKey: z.string().uuid(),
};
