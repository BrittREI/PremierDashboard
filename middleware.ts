export default function middleware(request: Request) {
  const url = new URL(request.url);

  // Skip auth for API routes (they have their own server-side token)
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  const auth = request.headers.get("authorization");

  if (auth) {
    const [scheme, encoded] = auth.split(" ");
    if (scheme === "Basic" && encoded) {
      const decoded = atob(encoded);
      const [user, pass] = decoded.split(":");

      const validUser = process.env.DASHBOARD_USER ?? "admin";
      const validPass = process.env.DASHBOARD_PASS;

      if (validPass && user === validUser && pass === validPass) {
        return;
      }
    }
  }

  // No DASHBOARD_PASS set = auth disabled (don't lock yourself out)
  if (!process.env.DASHBOARD_PASS) {
    return;
  }

  return new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="PPP Dashboard"',
    },
  });
}
