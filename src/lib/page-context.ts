import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getContext } from "@/modules/auth/context";
import { AppError } from "@/shared/errors";
export async function pageContext() {
  try {
    return await getContext(await headers());
  } catch (error) {
    if (error instanceof AppError && error.code === "UNAUTHENTICATED")
      redirect("/login");
    if (error instanceof AppError && error.code === "SETUP_REQUIRED")
      redirect("/setup");
    throw error;
  }
}
