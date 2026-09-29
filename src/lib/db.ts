import { PrismaClient } from '@prisma/client'
import { PrismaD1 } from '@prisma/adapter-d1'

/**
 * Database client — auto-detects environment:
 * - On Cloudflare (D1 binding present): uses PrismaD1 adapter against the D1 database
 * - In local dev: uses a regular PrismaClient against the local SQLite file
 *
 * USAGE in API routes:
 *   import { db } from '@/lib/db'
 *   const leads = await (await db).lead.findMany({...})
 *
 * `db` is a thenable (Promise) that resolves to a PrismaClient. Awaiting it
 * gives you the live Prisma client; on Cloudflare it uses the D1 adapter, in
 * local dev it uses the SQLite file via DATABASE_URL.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

async function createPrismaClient(): Promise<PrismaClient> {
  // Detect Cloudflare D1 binding (binding name "DB" set in wrangler.toml)
  // On Cloudflare Pages with @cloudflare/next-on-pages, the binding appears on process.env
  // via the nodejs_compat flag. On native Workers, it comes from the request env object.
  const d1Binding = (process.env as any).DB ?? (globalThis as any).DB ?? null

  if (d1Binding) {
    // On Cloudflare — use D1 adapter
    const adapter = new PrismaD1(d1Binding)
    return new PrismaClient({ adapter } as any)
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
