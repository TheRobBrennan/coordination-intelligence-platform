// Auth.js's JWT session strategy doesn't expose the OIDC id_token by default —
// auth.ts's jwt/session callbacks persist it so the app can pass it as
// id_token_hint to Keycloak's RP-initiated logout (see auth.ts's signOut).
//
// `export {}` forces this file into module scope. Without it, `declare
// module` below isn't recognized as an augmentation of the real module — it
// creates a brand-new ambient module that shadows the real one, wiping out
// every actual export (including NextAuth's default export, breaking it as
// "not callable" everywhere it's imported).
export {};

declare module "next-auth" {
  interface Session {
    idToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    idToken?: string;
  }
}
