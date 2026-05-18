import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PATHS = /^\/((?!api\/|_next\/|favicon\.ico).*)$/;

export function middleware(req: NextRequest) {
  // Skip auth for API routes (they have their own server-side token)
  if (!PROTECTED_PATHS.test(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const auth = req.headers.get("authorization");

  if (auth) {
    const [scheme, encoded] = auth.split(" ");
    if (scheme === "Basic" && encoded) {
      const decoded = atob(encoded);
      const [user, pass] = decoded.split(":");

      const validUser = process.env.DASHBOARD_USER ?? "admin";
      const validPass = process.env.DASHBOARD_PASS;

      if (validPass && user === validUser && pass === validPass) {
        return NextResponse.next();
      }
    }
  }

  // No DASHBOARD_PASS set = auth disabled (don't lock yourself out)
  if (!process.env.DASHBOARD_PASS) {
    return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="PPP Dashboard"',
    },
  });
}

export const config = {
  matcher: ["/((?!api/|_next/|favicon\\.ico).*)"],
};
