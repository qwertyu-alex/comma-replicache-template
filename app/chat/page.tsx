"use client";
import {
  useMessages,
  useReplicache,
  useReplicachePokeListener,
} from "@/utils/replicacheHooks";
import { ClientMessage } from "@/utils/replicacheMutations";
import { nanoid } from "nanoid";
import { useSession } from "next-auth/react";
import { FormEvent, useRef } from "react";

export default function Home() {
  const { rep } = useReplicache();
  useReplicachePokeListener({ rep });

  const session = useSession();
  const messages = useMessages({ rep });

  const usernameRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLInputElement>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const last = messages.at(messages.length - 1);
    const order = (last ? last[1].ord : 0) + 1;

    if (rep && usernameRef.current && contentRef.current) {
      rep.mutate.createMessage({
        id: nanoid(),
        sender: usernameRef.current.value,
        content: contentRef.current.value,
        ord: order,
      });
      contentRef.current.value = "";
    }
  };

  return (
    <div>
      <h1>{session.data?.user.email}</h1>
      <form onSubmit={onSubmit}>
        <input ref={usernameRef} required /> says:{" "}
        <input ref={contentRef} required /> <input type="submit" />
      </form>
      <MessageList messages={messages} />
    </div>
  );
}

function MessageList(props: {
  messages: (readonly [string, ClientMessage])[];
}) {
  return (
    <>
      {props.messages.map(([k, v]) => {
        return (
          <div key={k}>
            <b>{v.sender}: </b>
            {v.content}
          </div>
        );
      })}
    </>
  );
}
