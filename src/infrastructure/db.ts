import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { readEnvironment } from "./env";
const globalDb = globalThis as unknown as { gymDb?: PrismaClient };
export const db =
  globalDb.gymDb ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: readEnvironment().DATABASE_URL,
      options: "-c timezone=UTC",
    }),
  });
if (process.env.NODE_ENV !== "production") globalDb.gymDb = db;
export type Tx = Prisma.TransactionClient;
export async function serializable<T>(
  operation: (tx: Tx) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(operation, {
        isolationLevel: "Serializable",
        timeout: 15000,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 3
      )
        continue;
      throw error;
    }
  }
}
