"use server";

import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { prisma } from "./prisma";
import bcrypt from "bcrypt";

export async function authenticate(
  prevState: string | undefined,
  formData: FormData
) {
  try {
    await signIn("credentials", formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return "Invalid credentials.";
        default:
          return "Something went wrong.";
      }
    }
    throw error;
  }
}

export async function signUp(
  prevState: string | undefined,
  formData: FormData
) {
  try {
    const email = formData.get("email");
    const password = formData.get("password");

    if (!email || !password) {
      return "Missing email or password.";
    }

    await prisma.user.create({
      data: {
        email: email.toString(),
        password: (await bcrypt.hash(password.toString(), 10)).toString(),
        userAuthorization: {
          create: { replicacheServer: { create: { version: 1 } } },
        },
      },
    });

    await signIn("credentials", formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return "Invalid credentials.";
        default:
          return "Something went wrong.";
      }
    }
    throw error;
  }
}
