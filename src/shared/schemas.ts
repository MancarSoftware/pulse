import { z } from "zod";
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
