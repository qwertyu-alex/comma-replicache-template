import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/",
  },
  providers: [
    // added later in auth.ts since it requires bcrypt which is only compatible with Node.js
    // while this file is also used in non-Node.js environments
  ],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const protectedPaths = ["/chat", "/api"];

      if (protectedPaths.some((path) => nextUrl.pathname.startsWith(path))) {
        if (isLoggedIn) return true;
        return false;
      }

      return true;

      //   const isOnDashboard = nextUrl.pathname.startsWith("/chat");

      //   if (isOnDashboard) {
      //     if (isLoggedIn) return true;
      //     return false; // Redirect unauthenticated users to login page
      //   } else if (isLoggedIn) {
      //     return Response.redirect(new URL("/chat", nextUrl));
      //   }
      //   return true;
    },
  },
} satisfies NextAuthConfig;
