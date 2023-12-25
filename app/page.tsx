import { auth, signOut } from "@/auth";
import { Auth } from "./components/auth";
import Link from "next/link";

export default async function Home() {
  const session = await auth();

  return (
    <div>
      {!session?.user && <Auth />}
      {session?.user && (
        <>
          <form
            action={async () => {
              "use server";
              await signOut();
            }}
          >
            <button>
              <div>Sign Out</div>
            </button>
          </form>
          <Link href="/chat">Chat</Link>
        </>
      )}
      <div> Hello World</div>
    </div>
  );
}
