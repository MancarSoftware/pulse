import { createGymoraAuth } from "./config";
import { AppError } from "@/shared/errors";
import { after } from "next/server";
export const auth = createGymoraAuth(undefined, (task) =>
  after(() => task.then(() => undefined)),
);
export function requireVerifiedEmail(user: { emailVerified: boolean }) {
  if (
    auth.options.emailAndPassword?.requireEmailVerification &&
    !user.emailVerified
  )
    throw new AppError(
      "EMAIL_NOT_VERIFIED",
      "Confirma tu correo antes de continuar.",
      403,
    );
}
