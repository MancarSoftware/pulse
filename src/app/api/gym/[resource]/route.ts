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
      case "members":
        return Response.json(await saveMember(ctx, body));
      case "catalog":
        return Response.json(await saveCatalog(ctx, body));
      case "renewals":
        return Response.json(await renewMembership(ctx, body));
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
