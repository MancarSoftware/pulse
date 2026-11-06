import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "@/infrastructure/db";
import { readEnvironment } from "@/infrastructure/env";
import {
  configuredAuthEmailSender,
  type AuthEmailSender,
  type AuthEmail,
} from "./email";

export function createGymoraAuth(
  send: AuthEmailSender | null = configuredAuthEmailSender(),
  background?: (task: Promise<unknown>) => void,
) {
  const env = readEnvironment();
  async function deliver(message: AuthEmail) {
    try {
      await send?.(message);
    } catch {
      console.error(
        "No se pudo enviar un correo de cuenta. Revisa el proveedor de correo.",
      );
    }
  }
  return betterAuth({
    database: prismaAdapter(db, { provider: "postgresql", transaction: true }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.BETTER_AUTH_URL],
    verification: { storeIdentifier: "hashed" },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: !send,
      requireEmailVerification: !!send,
      resetPasswordTokenExpiresIn: 900,
      revokeSessionsOnPasswordReset: true,
      ...(send
        ? {
            sendResetPassword: async ({
              user,
              url,
            }: {
              user: { email: string };
              url: string;
            }) => deliver({ kind: "reset", to: user.email, url }),
          }
        : {}),
    },
    ...(send
      ? {
          emailVerification: {
            sendOnSignUp: true,
            sendOnSignIn: false,
            autoSignInAfterVerification: false,
            expiresIn: 3600,
            sendVerificationEmail: async ({
              user,
              url,
            }: {
              user: { email: string };
              url: string;
            }) => deliver({ kind: "verify", to: user.email, url }),
          },
        }
      : {}),
    session: {
      expiresIn: 60 * 60 * 12,
      updateAge: 60 * 30,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/request-password-reset": { window: 300, max: 3 },
        "/send-verification-email": { window: 300, max: 3 },
        "/reset-password": { window: 300, max: 5 },
      },
    },
    advanced: {
      ...(background ? { backgroundTasks: { handler: background } } : {}),
      disableOriginCheck: false,
      disableCSRFCheck: false,
      useSecureCookies: env.BETTER_AUTH_URL.startsWith("https://"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
  });
}
