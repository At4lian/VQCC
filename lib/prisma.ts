import { Prisma, PrismaClient } from '@prisma/client'

import { env } from './env'

declare global {
  var prisma: PrismaClient | undefined
}

const logLevels: Prisma.LogLevel[] =
  env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']

export const db = globalThis.prisma || new PrismaClient({
  log: logLevels,
})

if (env.NODE_ENV !== 'production') {
  globalThis.prisma = db
}