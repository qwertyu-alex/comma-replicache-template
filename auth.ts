import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { User } from "@prisma/client";
import { createId } from "@paralleldrive/cuid2";
import { prisma } from "./utils/prisma";

async function getUser(email: string): Promise<User | null> {
  try {
    const user = await prisma.user.findFirst({ where: { email } });
    return user;
  } catch (error) {
    console.error("Failed to fetch user:", error);
    throw new Error("Failed to fetch user.");
  }
}

export const {
  auth,
  signIn,
  signOut,
  handlers: { GET, POST },
} = NextAuth({
  ...authConfig,
  callbacks: {
    async jwt({ token, user, trigger }) {
      // Add access_token to the token right after signin
      // console.log('JWT', { token, user, trigger })
      return token;
    },
    async session({ session, token }) {
      // Add custom user information to the session object
      const user = await prisma.user.findFirstOrThrow({
        where: { email: session.user?.email },
        select: { id: true, email: true },
      });

      session.user = user;
      return session;
    },
  },
  providers: [
    Credentials({
      async authorize(credentials) {
        console.log("RUNNIN AUTHORIZER", credentials);

        const parsedCredentials = z
          .object({ email: z.string().email(), password: z.string() })
          .safeParse(credentials);

        if (parsedCredentials.success) {
          const { email, password } = parsedCredentials.data;

          const user = await getUser(email);
          if (!user || user.password === null) {
            await bcrypt.compare(createId(), createId()); // Compare fake passwords to prevent timing attacks
            return null;
          }

          const passwordsMatch = await bcrypt.compare(password, user.password);
          if (passwordsMatch) return user;
        }

        console.log("Invalid credentials");
        return null;
      },
    }),
  ],
});
