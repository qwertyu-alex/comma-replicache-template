import { MessageWithID } from "@/types";
import { createClient } from "@supabase/supabase-js";
import { signIn, useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import {
  MutatorDefs,
  Replicache,
  TEST_LICENSE_KEY,
  WriteTransaction,
} from "replicache";

const mutators = {
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
} satisfies MutatorDefs;

type mutators = typeof mutators;

export const useReplicache = () => {
  const session = useSession();

  const status = session.status;
  const userId = session.data?.user.id;

  const rep = useMemo(() => {
    if (status === "authenticated" && userId) {
      console.log(session);

      const r = new Replicache({
        name: `${userId}`,
        licenseKey: TEST_LICENSE_KEY,
        pushURL: `/api/replicache-push`,
        pullURL: `/api/replicache-pull`,
        mutators,
      });

      // // This gets called when the push/pull API returns a `401`.
      const getAuth: typeof r.getAuth = () => {
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
  }, [rep]);
};
