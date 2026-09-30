import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// Handles /api/auth/* routes (signin, signout, session, csrf, etc.)
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
