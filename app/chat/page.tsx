"use client";
import { useReplicache, useReplicachePokeListener } from "@/utils/replicache";
import { nanoid } from "nanoid";
import { FormEvent, useRef } from "react";
import { useSubscribe } from "replicache-react";
import { Message } from "types";

export default function Home() {
  const { rep } = useReplicache();
  useReplicachePokeListener({ rep });

  const messages = useSubscribe(
    rep,
    async (tx) => {
      const list = await tx
        .scan<Message>({ prefix: "message/" })
        .entries()
        .toArray();
      list.sort(([, { order: a }], [, { order: b }]) => a - b);
      return list;
    },
    { default: [] }
  );

  const usernameRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLInputElement>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const last = messages.at(messages.length - 1);
    const order = (last ? last[1].order : 0) + 1;

    if (rep && usernameRef.current && contentRef.current) {
      rep.mutate.createMessage({
        id: nanoid(),
        from: usernameRef.current.value,
        content: contentRef.current.value,
        order,
      });
      contentRef.current.value = "";
    }
  };

  return (
    <div>
      <form onSubmit={onSubmit}>
        <input ref={usernameRef} required /> says:{" "}
        <input ref={contentRef} required /> <input type="submit" />
      </form>
      <MessageList messages={messages} />
    </div>
  );
}

function MessageList({
  messages,
}: {
  messages: (readonly [string, Message])[];
}) {
  return (
    <>
      {messages.map(([k, v]) => {
        return (
          <div key={k}>
            <b>{v.from}: </b>
            {v.content}
          </div>
        );
      })}
    </>
  );
}
