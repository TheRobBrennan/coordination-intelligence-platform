import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";
import { redirect } from "next/navigation";

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

export const { handlers, signIn, signOut: signOutLocally, auth } = NextAuth({
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
  callbacks: {
    // Auth.js's JWT session doesn't carry the OIDC id_token by default —
    // capture it on first sign-in so signOut() below can pass it to
    // Keycloak's RP-initiated logout (id_token_hint).
    async jwt({ token, account }) {
      if (account?.id_token) token.idToken = account.id_token;
      return token;
    },
    async session({ session, token }) {
      session.idToken = typeof token.idToken === "string" ? token.idToken : undefined;
      return session;
    },
  },
  // Not deployed behind Vercel locally — trust the host header from
  // localhost / the docker-compose network instead of rejecting it.
  trustHost: true,
});

// Clearing only the app's own session cookie (next-auth's default signOut)
// leaves Keycloak's own SSO session (its KEYCLOAK_SESSION cookie) alive — the
// next "Sign in with Keycloak" click then silently re-authenticates the same
// user instead of showing the login form, so a different user can never sign
// in without first clearing cookies by hand. RP-initiated logout (redirecting
// through Keycloak's end_session_endpoint) ends that SSO session too.
export async function signOut() {
  const session = await auth();
  await signOutLocally({ redirect: false });

  const params = new URLSearchParams({ post_logout_redirect_uri: "http://localhost:3000" });
  if (session?.idToken) params.set("id_token_hint", session.idToken);

  redirect(`${PUBLIC_ISSUER}/protocol/openid-connect/logout?${params}`);
}
