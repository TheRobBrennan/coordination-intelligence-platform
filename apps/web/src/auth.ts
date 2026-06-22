import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";

// Browser-facing issuer (login redirect, ID-token "iss" validation). Must be
// reachable from the user's machine: http://localhost:8080/realms/platform.
const PUBLIC_ISSUER = process.env.KEYCLOAK_ISSUER!;

// Server-side issuer for the token/userinfo/jwks calls Auth.js makes itself.
// In the containerized web service this differs from PUBLIC_ISSUER — the
// container can't resolve "localhost:8080" back to the host's Keycloak, so
// docker-compose points it at the service name (http://keycloak:8080/...)
// instead. Native dev (pnpm dev:web) runs on the host, so the two URLs are
// the same and this just falls back to PUBLIC_ISSUER.
const SERVER_ISSUER = process.env.KEYCLOAK_INTERNAL_ISSUER ?? PUBLIC_ISSUER;

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Keycloak({
      issuer: PUBLIC_ISSUER,
      clientId: process.env.KEYCLOAK_CLIENT_ID,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
      // Explicit endpoints (instead of relying on issuer-based discovery) so
      // the browser and the server can use different hosts for the same realm.
      authorization: `${PUBLIC_ISSUER}/protocol/openid-connect/auth`,
      token: `${SERVER_ISSUER}/protocol/openid-connect/token`,
      userinfo: `${SERVER_ISSUER}/protocol/openid-connect/userinfo`,
      jwks_endpoint: `${SERVER_ISSUER}/protocol/openid-connect/certs`,
    }),
  ],
  // Not deployed behind Vercel locally — trust the host header from
  // localhost / the docker-compose network instead of rejecting it.
  trustHost: true,
});
