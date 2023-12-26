"use client";

import { createClient } from "@supabase/supabase-js";
import { signIn, useSession } from "next-auth/react";
import { useEffect, useMemo } from "react";
import { Replicache } from "replicache";
import { useSubscribe } from "replicache-react";
import { ClientMessage, mutators } from "./replicacheMutations";

export const useReplicache = () => {
  const session = useSession();

  const status = session.status;
  const userId = session.data?.user.id;

  const rep = useMemo(() => {
    // For some reason the hook renders on the server????
    // if (typeof window === "undefined") {
    //   return;
    // }

    if (status === "authenticated" && userId) {
      const r = new Replicache({
        name: `${userId}`,
        licenseKey: process.env.NEXT_PUBLIC_REPLICACHE_LICENSE!,
        pushURL: `/api/replicache/push`,
        pullURL: `/api/replicache/pull`,
        mutators,
      });

      // This gets called when the push/pull API returns a `401`.
      const getAuth: typeof r.getAuth = () => {
        console.log("Replicache push/pull - not authenticated");
        return signIn();
      };

      r.getAuth = getAuth;

      console.log("Replicache created");

      return r;
    }
  }, [status, userId]);

  return { rep };
};

export const useReplicachePokeListener = ({
  rep,
}: {
  rep: Replicache<mutators> | undefined;
}) => {
  useEffect(() => {
    if (!rep) {
      return;
    }

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

    return () => {
      channelA.unsubscribe();
    };
  }, [rep]);
};

export const useMessages = (input: {
  rep: Replicache<mutators> | undefined;
}) => {
  const messages = useSubscribe(
    input.rep,
    async (tx) => {
      const list = await tx
        .scan<ClientMessage>({ prefix: "message/" })
        .entries()
        .toArray();
      list.sort(([, { ord: a }], [, { ord: b }]) => a - b);
      return list;
    },
    { default: [] }
  );

  return messages;
};
