import { signIn, signOut } from "@/auth";
import { getSession } from "@/lib/session";

export default async function Home() {
  const session = await getSession();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50 font-sans dark:bg-black">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
        Coordination Intelligence Platform
      </h1>

      {session?.user ? (
        <>
          <p className="text-zinc-600 dark:text-zinc-400">
            Signed in as <strong>{session.user.name ?? session.user.email}</strong>
          </p>
          <form
            action={async () => {
              "use server";
              await signOut();
            }}
          >
            <button
              type="submit"
              className="rounded-full bg-foreground px-5 py-3 text-background"
            >
              Sign out
            </button>
          </form>
        </>
      ) : (
        <form
          action={async () => {
            "use server";
            await signIn("keycloak");
          }}
        >
          <button
            type="submit"
            className="rounded-full bg-foreground px-5 py-3 text-background"
          >
            Sign in with Keycloak
          </button>
        </form>
      )}
    </div>
  );
}
