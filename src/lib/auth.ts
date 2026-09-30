import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

/**
 * NextAuth configuration — email + password credentials provider.
 * Users are stored in the same D1/SQLite database as leads.
 * Passwords are hashed with bcrypt (10 rounds).
 */
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/api/auth/signin-form", // custom — we use a modal in the SPA, so this is just a fallback
  },
  providers: [
    CredentialsProvider({
      name: "Email + Password",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "you@example.com" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // Try to find existing user
        const prisma = await db;
        let user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });

        // If not found, try to create (signup flow — if password is at least 6 chars)
        if (!user) {
          if (credentials.password.length < 6) return null;
          const passwordHash = bcrypt.hashSync(credentials.password, 10);
          try {
            user = await prisma.user.create({
              data: {
                email: credentials.email.toLowerCase(),
                passwordHash,
                name: credentials.email.split("@")[0],
              },
            });
          } catch {
            // Email already taken (race condition) — return null
            return null;
          }
        } else {
          // Verify password
          const valid = bcrypt.compareSync(credentials.password, user.passwordHash);
          if (!valid) return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name || user.email,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || "leadforge-dev-secret-change-me-in-production",
};
