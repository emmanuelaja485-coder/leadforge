/**
 * Database client — auto-detects environment:
 * - On Cloudflare: uses getRequestContext().env.DB to get the D1 binding
 * - In local dev: uses a regular PrismaClient against the local SQLite file
 *
 * `db` is a Promise<PrismaClient> — call sites do `await (await db).lead.findMany()`
 */

import { PrismaClient } from '@prisma/client'
import { PrismaD1 } from '@prisma/adapter-d1'
import { getOptionalRequestContext } from '@cloudflare/next-on-pages'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

async function createPrismaClient(): Promise<PrismaClient> {
  // On Cloudflare — use the D1 binding from the request context
  try {
    const ctx = getOptionalRequestContext()
    const d1Binding = (ctx?.env as any)?.DB ?? null

    if (d1Binding) {
      const adapter = new PrismaD1(d1Binding)
      return new PrismaClient({ adapter } as any)
    }
  } catch {
    // Not on Cloudflare (local dev) — fall through to SQLite
  }

  // Local dev — standard PrismaClient against SQLite file
  return new PrismaClient({
    log: process.env.NODE_ENV !== 'production' ? ['query'] : ['error'],
  })
}

export const db: Promise<PrismaClient> = (async () => {
  if (globalForPrisma.prisma) return globalForPrisma.prisma
  const client = await createPrismaClient()
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = client
  return client
})()
