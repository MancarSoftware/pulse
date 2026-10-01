import { z } from "zod";
import { authorize, type Context } from "@/modules/auth/permissions";
import { audit, financialOperation } from "@/modules/transactions/service";
import { amount, id, paymentFields } from "@/shared/schemas";
import { money } from "@/shared/money";
import { dayStart, localDate } from "@/shared/dates";
import { AppError, requireFound } from "@/shared/errors";
export const expenseSchema = z
  .object({
    ...paymentFields,
    categoryId: id,
    description: z.string().trim().min(3).max(240),
    notes: z.string().max(2000).default(""),
    reference: z.string().max(160).default(""),
    amount,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();
export async function recordExpense(ctx: Context, input: unknown) {
  authorize(ctx, "expenses:write");
  const data = expenseSchema.parse(input);
  let occurredAt: Date;
  try {
    occurredAt = dayStart(data.date);
  } catch {
    throw new AppError("INVALID_DATE", "Fecha inválida");
  }
  if (data.date > localDate())
    throw new AppError(
      "FUTURE_EXPENSE",
      "No se puede registrar un gasto futuro",
    );
  return financialOperation(ctx, data, "expense", async (tx, requestHash) => {
    requireFound(
      await tx.expenseCategory.findFirst({
        where: {
          organizationId: ctx.organizationId,
          id: data.categoryId,
          active: true,
        },
      }),
    );
    const expense = await tx.expense.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: data.branchId,
        categoryId: data.categoryId,
        description: data.description,
        notes: data.notes,
        reference: data.reference,
        amount: money(data.amount),
        occurredAt,
        createdById: ctx.staffId,
      },
    });
    const entry = await tx.ledgerEntry.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: data.branchId,
        kind: "EXPENSE",
        amount: expense.amount.negated(),
        expenseId: expense.id,
        occurredAt,
        paymentMethodId: data.paymentMethodId,
        idempotencyKey: data.idempotencyKey,
        requestHash,
        createdById: ctx.staffId,
      },
    });
    await audit(tx, ctx, "expense.recorded", expense.id);
    return entry;
  });
}
