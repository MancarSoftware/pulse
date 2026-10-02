import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getContext } from "@/modules/auth/context";
import { AppError } from "@/shared/errors";
export async function pageContext(options: { allowSuspended?: boolean } = {}) {
  try {
    return await getContext(await headers(), options);
  } catch (error) {
    if (error instanceof AppError && error.code === "UNAUTHENTICATED")
      redirect("/login");
    if (error instanceof AppError && error.code === "SETUP_REQUIRED")
      redirect("/setup");
    if (error instanceof AppError && error.code === "SUBSCRIPTION_SUSPENDED")
      redirect("/subscription");
    throw error;
  }
}
