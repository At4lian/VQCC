import NextAuth from "next-auth";

import authConfig from "@/auth.config";
import {
  DEFAULT_LOGIN_REDIRECT,
  apiAuthPrefix,
  authRoutes,
  publicRoutes,
  apiPublicPrefixes,
} from "@/routes";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;

  const isLoggedIn = !!req.auth;
  const isAdmin = req.auth?.user?.role === "ADMIN";

  const isApiAuthRoute = pathname.startsWith(apiAuthPrefix);
  const isAuthRoute = authRoutes.includes(pathname);
  const isPublicRoute = publicRoutes.includes(pathname);
  const isRootRoute = pathname === "/";

  // ✅ Worker / internal API + další veřejné API prefixy
  const isApiPublic = apiPublicPrefixes.some((p) => pathname.startsWith(p));

  // ============================
  // ✅ WAITLIST MODE GATE
  // ============================
  const waitlistMode = process.env.WAITLIST_MODE === "1";

  if (waitlistMode && !isAdmin) {
    const isAllowedInWaitlist =
      isRootRoute ||
      pathname.startsWith("/api/waitlist") || // signup endpoint
      pathname.startsWith("/waitlist") ||     // unsubscribe/confirm pages
      isApiAuthRoute ||                       // next-auth internals
      isApiPublic ||                          // /api/internal pro worker atd.
      pathname.startsWith("/_next") ||
      pathname.startsWith("/favicon") ||
      pathname === "/robots.txt" ||
      pathname === "/sitemap.xml";

    if (!isAllowedInWaitlist) {
      return Response.redirect(new URL("/", nextUrl));
    }
  }

  // ✅ V waitlist modu nechceme posílat neauthed usera z "/" na login.
  // Landing je na "/" — takže redirect na /auth/login jen když waitlistMode není zapnutý.
  if (isRootRoute) {
    if (waitlistMode) {
      // admin už se do appky dostane výše přes isAdmin (nebo tady můžeš přesměrovat)
      if (isAdmin && isLoggedIn) {
        return Response.redirect(new URL(DEFAULT_LOGIN_REDIRECT, nextUrl));
      }
      return; // veřejnost uvidí landing
    }

    // původní chování mimo waitlist mode
    if (isLoggedIn) {
      return Response.redirect(new URL(DEFAULT_LOGIN_REDIRECT, nextUrl));
    }
    return Response.redirect(new URL("/auth/login", nextUrl));
  }

  // API auth route necháme být vždy
  if (isApiAuthRoute) {
    return;
  }

  // veřejné API prefixy (např. /api/internal) necháme být
  if (isApiPublic) {
    return;
  }

  // auth routy (login/signup...) – původní chování
  if (isAuthRoute) {
    if (isLoggedIn) {
      return Response.redirect(new URL(DEFAULT_LOGIN_REDIRECT, nextUrl));
    }
    return;
  }

  // klasická ochrana aplikace
  if (!isLoggedIn && !isPublicRoute) {
    let callbackUrl = pathname;
    if (nextUrl.search) callbackUrl += nextUrl.search;

    const encodedCallbackUrl = encodeURIComponent(callbackUrl);
    return Response.redirect(
      new URL(`/auth/login?callbackUrl=${encodedCallbackUrl}`, nextUrl)
    );
  }

  return;
});

// ponechávám tvůj matcher – protože už vyjímáme /api/internal přes apiPublicPrefixes
export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
