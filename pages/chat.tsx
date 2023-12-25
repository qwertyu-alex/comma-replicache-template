import { createClient } from "@supabase/supabase-js";
import { nanoid } from "nanoid";
import { FormEvent, useRef } from "react";
import { Replicache, TEST_LICENSE_KEY, WriteTransaction } from "replicache";
import { useSubscribe } from "replicache-react";
import { Message, MessageWithID } from "../types";

const rep = process.browser
  ? new Replicache({
      name: "chat-user-id",
      licenseKey: TEST_LICENSE_KEY,
      pushURL: "/api/replicache-push",
      pullURL: "/api/replicache-pull",
      mutators: {
        async createMessage(
          tx: WriteTransaction,
          { id, from, content, order }: MessageWithID
        ) {
          await tx.set(`message/${id}`, {
            from,
            content,
            order,
          });
        },
      },
    })
  : null;

listen();

export default function Home() {
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
  return messages.map(([k, v]) => {
    return (
      <div key={k}>
        <b>{v.from}: </b>
        {v.content}
      </div>
    );
  });
}

function listen() {
  if (!rep) {
    return;
  }

  console.log("listening");
  // Listen for pokes, and pull whenever we get one.
  // Pusher.logToConsole = true;
  // const pusher = new Pusher(process.env.NEXT_PUBLIC_REPLICHAT_PUSHER_KEY, {
  //   cluster: process.env.NEXT_PUBLIC_REPLICHAT_PUSHER_CLUSTER,
  // });
  // const channel = pusher.subscribe("default");
  // channel.bind("poke", () => {
  //   console.log("got poked");
  //   rep.pull();
  // });

  // Listen for new messages, and poke whenever we get one.
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const channelA = client.channel("room-1");

  channelA
    .on("broadcast", { event: "poke" }, (payload) => {
      console.log("got poked");
      rep.pull();
    })
    .subscribe();
}
