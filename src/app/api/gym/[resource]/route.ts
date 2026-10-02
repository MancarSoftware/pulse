import { getContext } from "@/modules/auth/context";
import { checkOrigin, errorResponse, readBody } from "@/infrastructure/http";
import { saveMember } from "@/modules/members/service";
import { saveCatalog } from "@/modules/organizations/catalog";
import {
  renewMembership,
  changeMembershipState,
} from "@/modules/memberships/service";
import { reverseTransaction } from "@/modules/transactions/reversal";
import { checkIn, sellDayPass } from "@/modules/checkins/service";
import { sellProducts } from "@/modules/sales/service";
import { moveInventory } from "@/modules/inventory/service";
import { recordExpense } from "@/modules/expenses/service";
import { AppError } from "@/shared/errors";
import { deleteCatalog } from "@/modules/organizations/deletion";
import { after } from "next/server";
import { dispatchWhatsApp } from "@/modules/notifications/whatsapp-delivery";
import { retryWhatsApp } from "@/modules/notifications/whatsapp-retry";
import {
  beginWhatsAppSignup,
  finishWhatsAppSignup,
  refreshWhatsAppConnection,
  resolveWhatsAppConfig,
} from "@/modules/notifications/whatsapp-connect";
function scheduleWhatsApp(organizationId: string) {
  after(async () => {
    try {
      const config = await resolveWhatsAppConfig(organizationId);
      await dispatchWhatsApp(config);
    } catch {
      /* Worker recovers durable pending jobs. */
    }
  });
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ resource: string }> },
) {
  try {
    checkOrigin(request);
    const ctx = await getContext(request.headers);
    if ((await params).resource !== "catalog")
      throw new AppError("NOT_FOUND", "Operación no disponible", 404);
    return Response.json(await deleteCatalog(ctx, await readBody(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ resource: string }> },
) {
  try {
    checkOrigin(request);
    const ctx = await getContext(request.headers);
    const body = await readBody(request);
    const { resource } = await params;
    switch (resource) {
      case "whatsapp-connect": {
        const action =
          typeof body === "object" && body !== null && "action" in body
            ? body.action
            : null;
        if (action === "begin")
          return Response.json(await beginWhatsAppSignup(ctx));
        if (action === "finish") {
          const result = await finishWhatsAppSignup(ctx, body);
          if (result.ready) scheduleWhatsApp(ctx.organizationId);
          return Response.json(result);
        }
        if (action === "refresh") {
          const result = await refreshWhatsAppConnection(ctx);
          if (result.ready) scheduleWhatsApp(ctx.organizationId);
          return Response.json(result);
        }
        throw new AppError(
          "VALIDATION",
          "Acción de conexión no disponible",
          422,
        );
      }
      case "members":
        return Response.json(await saveMember(ctx, body));
      case "whatsapp-retry": {
        const result = await retryWhatsApp(ctx, body);
        scheduleWhatsApp(ctx.organizationId);
        return Response.json(result);
      }
      case "catalog":
        return Response.json(await saveCatalog(ctx, body));
      case "renewals": {
        const result = await renewMembership(ctx, body);
        scheduleWhatsApp(ctx.organizationId);
        return Response.json(result);
      }
      case "membership-state":
        return Response.json(await changeMembershipState(ctx, body));
      case "reversals":
        return Response.json(await reverseTransaction(ctx, body));
      case "check-ins":
        return Response.json(await checkIn(ctx, body));
      case "day-passes":
        return Response.json(await sellDayPass(ctx, body));
      case "sales":
        return Response.json(await sellProducts(ctx, body));
      case "movements":
        return Response.json(await moveInventory(ctx, body));
      case "expenses":
        return Response.json(await recordExpense(ctx, body));
      default:
        throw new AppError("NOT_FOUND", "Operación no disponible", 404);
    }
  } catch (error) {
    return errorResponse(error);
  }
}
