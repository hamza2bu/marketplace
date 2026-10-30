import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { db } from "./server/db";
import { signInSchema } from "./lib/validation/auth";

// Compared against when the email is unknown, so both paths take similar time.
const DUMMY_HASH = "$2b$12$0xmjheBTllzB2ivaBB3mae/nUVeyEJ5rS717pxMDAtTpL7XQQ255y";
const ROLE_REFRESH_MS = 60 * 1000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = signInSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await db.user.findUnique({ where: { email } });
        const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !user.passwordHash || !valid || user.status !== "ACTIVE") return null;

        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Keep the role in the token close to the database, and end the session
    // of deleted or suspended users. Server-side guards still re-check the DB.
    async jwt(params) {
      const token = await authConfig.callbacks.jwt(params);
      if (params.user || Date.now() - (token.refreshedAt ?? 0) < ROLE_REFRESH_MS) return token;

      const user = await db.user.findUnique({
        where: { id: token.id },
        select: { role: true, status: true, passwordChangedAt: true },
      });
      if (!user || user.status !== "ACTIVE") return null;
      // A password reset signs out every session issued before it.
      // (1s margin: iat is in whole seconds.)
      if (user.passwordChangedAt && ((token.iat ?? 0) + 1) * 1000 < user.passwordChangedAt.getTime()) return null;
      token.role = user.role;
      token.refreshedAt = Date.now();
      return token;
    },
  },
});
