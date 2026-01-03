import { PrismaClient, Prisma } from "@prisma/client";
import { env } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const log: Prisma.PrismaClientOptions["log"] =
  env.NODE_ENV === "development" ? ["warn", "error"] : ["error"];

export const db =
  globalThis.prisma ||
  new PrismaClient({
    log,
  });

if (env.NODE_ENV !== "production") globalThis.prisma = db;
