import { hashPassword } from "better-auth/crypto";
import { db } from "../src/infrastructure/db";
import { setupOrganization } from "../src/modules/organizations/service";
import { saveCatalog } from "../src/modules/organizations/catalog";
import { saveMember } from "../src/modules/members/service";
import { renewMembership } from "../src/modules/memberships/service";
import { checkIn, sellDayPass } from "../src/modules/checkins/service";
import { moveInventory } from "../src/modules/inventory/service";
import { sellProducts } from "../src/modules/sales/service";
import { recordExpense } from "../src/modules/expenses/service";
import { addDays, dayStart, localDate } from "../src/shared/dates";
import type { Context } from "../src/modules/auth/permissions";
if (
  process.env.NODE_ENV === "production" ||
  process.env.ALLOW_DEMO_SEED !== "true"
)
  throw new Error("Seed requires ALLOW_DEMO_SEED=true outside production");
const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 12)
  throw new Error("Provide DEMO_PASSWORD with at least 12 characters");
try {
  const email = "owner@mancar-demo.example";
  if (await db.user.findUnique({ where: { email } }))
    throw new Error("Demo already exists; seed does not overwrite data");
  const userId = crypto.randomUUID();
  await db.user.create({
    data: {
      id: userId,
      name: "María · Demo",
      email,
      accounts: {
        create: {
          id: crypto.randomUUID(),
          accountId: userId,
          providerId: "credential",
          password: await hashPassword(password),
        },
      },
    },
  });
  await setupOrganization(userId, {
    name: "MANCAR Fitness · DEMO",
    branchName: "Quito · Central",
    address: "Dirección ficticia para demostración",
  });
  const staff = await db.staff.findUniqueOrThrow({ where: { userId } });
  const ctx: Context = {
    userId,
    staffId: staff.id,
    organizationId: staff.organizationId,
    branchId: staff.branchId,
    role: "OWNER",
  };
  const method = await db.paymentMethod.findFirstOrThrow({
    where: { organizationId: ctx.organizationId, name: "Efectivo" },
  });
  const payment = () => ({
    branchId: ctx.branchId,
    paymentMethodId: method.id,
    idempotencyKey: crypto.randomUUID(),
  });
  const machines = await saveCatalog(ctx, {
    kind: "service",
    name: "Máquinas",
  });
  const crossfit = await saveCatalog(ctx, {
    kind: "service",
    name: "CrossFit",
  });
  const dance = await saveCatalog(ctx, { kind: "service", name: "Baile" });
  const basic = await saveCatalog(ctx, {
    kind: "plan",
    name: "Fuerza · 30 días",
    price: "25.00",
    durationDays: 30,
    serviceIds: [machines.id],
  });
  const full = await saveCatalog(ctx, {
    kind: "plan",
    name: "Completo · 30 días",
    price: "45.00",
    durationDays: 30,
    serviceIds: [machines.id, crossfit.id, dance.id],
  });
  await saveCatalog(ctx, {
    kind: "staff",
    name: "Diego · Recepción Demo",
    email: "reception@mancar-demo.example",
    password,
    branchId: ctx.branchId,
    role: "RECEPTIONIST",
  });
  const names = [
    ["Andrea", "López"],
    ["Carlos", "Vega"],
    ["Valentina", "Ríos"],
    ["Mateo", "Cruz"],
    ["Daniela", "Mora"],
    ["Emilio", "Paz"],
    ["Isabela", "Reyes"],
    ["Sebastián", "Luna"],
    ["Camila", "Torres"],
    ["Nicolás", "León"],
    ["Sofía", "Rivas"],
    ["Gabriel", "Soto"],
  ];
  for (const [index, [firstName, lastName]] of names.entries()) {
    const member = await saveMember(ctx, {
      firstName,
      lastName,
      phone: `00000000${String(index).padStart(2, "0")}`,
      branchId: ctx.branchId,
      email: `member${index}@mancar-demo.example`,
      notes: "Persona ficticia. Datos exclusivos de demostración.",
    });
    const isFull = index % 3 === 0;
    await renewMembership(ctx, {
      ...payment(),
      memberId: member.id,
      planId: isFull ? full.id : basic.id,
      expectedPrice: isFull ? "45.00" : "25.00",
      expectedLatestId: null,
    });
    if (index < 8)
      await checkIn(ctx, {
        branchId: ctx.branchId,
        memberId: member.id,
        serviceId: machines.id,
      });
    // Clearly separated demo scenario: show expiration states without waiting 30 days.
    if (index >= 8) {
      const endAt = addDays(
        dayStart(localDate()),
        index === 8 ? 1 : index === 9 ? 4 : -2,
      );
      await db.membership.updateMany({
        where: { organizationId: ctx.organizationId, memberId: member.id },
        data: { startAt: addDays(endAt, -30), endAt },
      });
    }
  }
  const water = await saveCatalog(ctx, {
    kind: "product",
    name: "Agua mineral 600 ml",
    sku: "DEMO-WATER",
    price: "1.25",
    cost: "0.50",
    lowStock: 10,
    category: "Bebidas",
  });
  const protein = await saveCatalog(ctx, {
    kind: "product",
    name: "Barra de proteína",
    sku: "DEMO-PROTEIN",
    price: "2.50",
    cost: "1.20",
    lowStock: 8,
    category: "Nutrición",
  });
  for (const p of [water, protein])
    await moveInventory(ctx, {
      branchId: ctx.branchId,
      productId: p.id,
      kind: "PURCHASE",
      quantity: p === water ? 50 : 12,
      reason: "Inventario inicial de demostración",
    });
  await sellProducts(ctx, {
    ...payment(),
    lines: [
      { productId: water.id, quantity: 4, expectedPrice: "1.25" },
      { productId: protein.id, quantity: 5, expectedPrice: "2.50" },
    ],
  });
  await sellDayPass(ctx, { ...payment(), serviceId: dance.id, amount: "3.00" });
  const category = await saveCatalog(ctx, {
    kind: "expense-category",
    name: "Limpieza",
  });
  await recordExpense(ctx, {
    ...payment(),
    categoryId: category.id,
    description: "Insumos de limpieza · Demo",
    amount: "12.50",
    date: localDate(),
  });
  console.log(
    "Demo creada. Usuario: owner@mancar-demo.example. La contraseña es el valor suministrado en DEMO_PASSWORD.",
  );
} finally {
  await db.$disconnect();
}
