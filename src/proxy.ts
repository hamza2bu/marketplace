import NextAuth from "next-auth";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";
import { routing } from "./i18n/routing";

const { auth } = NextAuth(authConfig);
const intl = createIntlMiddleware(routing);

// Areas that need a signed-in user. Role checks happen on the server against
// the database (src/server/auth/guards.ts), on every page and action.
const PROTECTED = /^\/(?:he|ar|en)\/(?:account|seller|admin|checkout)(?:\/|$)/;

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  if (PROTECTED.test(pathname) && !req.auth?.user) {
    const locale = pathname.split("/")[1];
    const url = new URL(`/${locale}/sign-in`, req.nextUrl);
    url.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(url);
  }
  return intl(req);
});

export const config = {
  // Everything except API routes, Next internals and files with an extension.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
