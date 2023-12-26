"use client";

import { authenticate, signUp } from "@/utils/auth";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

export const Auth = () => {
  const [action, setAction] = useState<"login" | "signup">("login");
  const [errorMessage, dispatch] = useFormState(
    action === "login" ? authenticate : signUp,
    undefined
  );

  return (
    <div>
      <button
        onClick={() => {
          setAction(action === "login" ? "signup" : "login");
        }}
      >
        Switch to {action === "login" ? "signup" : "login"}
      </button>
      <form action={dispatch}>
        <div>
          <div>
            <div>
              <label htmlFor="email">Email</label>
              <div>
                <input
                  id="email"
                  type="email"
                  name="email"
                  placeholder="Enter your email address"
                  required
                />
              </div>
            </div>
            <div>
              <label htmlFor="password">Password</label>
              <div>
                <input
                  id="password"
                  type="password"
                  name="password"
                  placeholder="Enter password"
                  required
                />
              </div>
            </div>
          </div>
          <LoginButton text={action} />
          <div aria-live="polite" aria-atomic="true">
            {errorMessage && (
              <>
                <p>{errorMessage}</p>
              </>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};

function LoginButton(props: { text: String }) {
  const { pending } = useFormStatus();

  return <button aria-disabled={pending}>{props.text}</button>;
}
