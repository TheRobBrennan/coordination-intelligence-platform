import { auth } from "@/auth";

// Pages call getSession(), never the IdP-specific auth() directly — swapping
// the IdP (Keycloak -> something else) means changing this file only.
export async function getSession() {
  return auth();
}
