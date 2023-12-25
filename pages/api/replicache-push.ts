import { Prisma } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { NextApiRequest, NextApiResponse } from "next";
import { MutationV1 } from "replicache";
import { serverID } from "../../server/db";
import { MessageWithID } from "../../types";
import { PrismaTransaction, prisma } from "../../util/prisma";

export default async function (req: NextApiRequest, res: NextApiResponse) {
  const push = req.body;
  console.log("Processing push", JSON.stringify(push));

  const t0 = Date.now();

  console.log("mutations", push.mutations);

  try {
    // Iterate each mutation in the push.
    for (const mutation of push.mutations) {
      const t1 = Date.now();

      try {
        await prisma.$transaction(
          (t) => processMutation(t, push.clientGroupID, mutation),
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable, // Required for Replicache to work
            maxWait: 5000, // default: 2000
            timeout: 10000, // default: 5000
          }
        );
      } catch (e) {
        console.error("Caught error from mutation", mutation, e);

        // Handle errors inside mutations by skipping and moving on. This is
        // convenient in development but you may want to reconsider as your app
        // gets close to production:
        //
        // https://doc.replicache.dev/server-push#error-handling
        //
        // Ideally we would run the mutator itself in a nested transaction, and
        // if that fails, rollback just the mutator and allow the lmid and
        // version updates to commit. However, nested transaction support in
        // Postgres is not great:
        //
        // https://postgres.ai/blog/20210831-postgresql-subtransactions-considered-harmful
        //
        // Instead we implement skipping of failed mutations by *re-runing*
        // them, but passing a flag that causes the mutator logic to be skipped.
        //
        // This ensures that the lmid and version bookkeeping works exactly the
        // same way as in the happy path. A way to look at this is that for the
        // error-case we replay the mutation but it just does something
        // different the second time.
        //
        // This is allowed in Replicache because mutators don't have to be
        // deterministic!:
        //
        // https://doc.replicache.dev/concepts/how-it-works#speculative-execution-and-confirmation
        await prisma.$transaction((t) =>
          processMutation(t, push.clientGroupID, mutation, e)
        );
      }

      console.log("Processed mutation in", Date.now() - t1);
    }

    res.send("{}");

    // We need to await here otherwise, Next.js will frequently kill the request
    // and the poke won't get sent.
    await sendPoke();
  } catch (e) {
    console.error(e);
    res.status(500).send(e.toString());
  } finally {
    console.log("Processed push in", Date.now() - t0);
  }
}

async function processMutation(
  prisma: PrismaTransaction,
  clientGroupID: string,
  mutation: MutationV1,
  error?: string | undefined
) {
  const { clientID } = mutation;

  // Get the previous version and calculate the next one.
  //   const { version: prevVersion } = await t.one(
  //     "select version from replicache_server where id = $1 for update",
  //     serverID
  //   );

  const { version: prevVersion } = await prisma.replicacheServer.findFirst({
    where: {
      id: serverID,
    },
  });
  const nextVersion = prevVersion + 1;

  const lastMutationID = await getLastMutationID(prisma, clientID);
  const nextMutationID = lastMutationID + 1;

  console.log("nextVersion", nextVersion, "nextMutationID", nextMutationID);

  // It's common due to connectivity issues for clients to send a
  // mutation which has already been processed. Skip these.
  if (mutation.id < nextMutationID) {
    console.log(
      `Mutation ${mutation.id} has already been processed - skipping`
    );
    return;
  }

  // If the Replicache client is working correctly, this can never
  // happen. If it does there is nothing to do but return an error to
  // client and report a bug to Replicache.
  if (mutation.id > nextMutationID) {
    throw new Error(
      `Mutation ${mutation.id} is from the future - aborting. This can happen in development if the server restarts. In that case, clear appliation data in browser and refresh.`
    );
  }

  if (error === undefined) {
    console.log("Processing mutation:", JSON.stringify(mutation));

    // For each possible mutation, run the server-side logic to apply the
    // mutation.
    switch (mutation.name) {
      case "createMessage":
        await createMessage(
          prisma,
          mutation.args as MessageWithID,
          nextVersion
        );
        break;
      default:
        throw new Error(`Unknown mutation: ${mutation.name}`);
    }
  } else {
    // TODO: You can store state here in the database to return to clients to
    // provide additional info about errors.
    console.log(
      "Handling error from mutation",
      JSON.stringify(mutation),
      error
    );
  }

  console.log("setting", clientID, "last_mutation_id to", nextMutationID);
  // Update lastMutationID for requesting client.
  await setLastMutationID(
    prisma,
    clientID,
    clientGroupID,
    nextMutationID,
    nextVersion
  );

  // Update global version.
  //   await t.none("update replicache_server set version = $1 where id = $2", [
  //     nextVersion,
  //     serverID,
  //   ]);

  await prisma.replicacheServer.updateMany({
    where: {
      id: serverID,
    },
    data: {
      version: nextVersion,
    },
  });
}

export async function getLastMutationID(
  prisma: PrismaTransaction,
  clientID: string
) {
  //   const clientRow = await t.oneOrNone(
  //     "select last_mutation_id from replicache_client where id = $1",
  //     clientID
  //   );

  const clientRow = await prisma.replicacheClient.findFirst({
    where: {
      id: clientID,
    },
  });

  if (!clientRow) {
    return 0;
  }
  return clientRow.last_mutation_id;
}

async function setLastMutationID(
  prisma: PrismaTransaction,
  clientID: string,
  clientGroupID: string,
  mutationID: number,
  version: number
) {
  //   const result = await t.result(
  //     `update replicache_client set
  //       client_group_id = $2,
  //       last_mutation_id = $3,
  //       version = $4
  //     where id = $1`,
  //     [clientID, clientGroupID, mutationID, version]
  //   );

  const result = await prisma.replicacheClient.updateMany({
    where: {
      id: clientID,
    },
    data: {
      client_group_id: clientGroupID,
      last_mutation_id: mutationID,
      version: version,
    },
  });

  if (result.count === 0) {
    // await t.none(
    //   `insert into replicache_client (
    //     id,
    //     client_group_id,
    //     last_mutation_id,
    //     version
    //   ) values ($1, $2, $3, $4)`,
    //   [clientID, clientGroupID, mutationID, version]
    // );

    await prisma.replicacheClient.create({
      data: {
        id: clientID,
        client_group_id: clientGroupID,
        last_mutation_id: mutationID,
        version: version,
      },
    });
  }
}

async function createMessage(
  prisma: PrismaTransaction,
  { id, from, content, order }: MessageWithID,
  version: number
) {
  //   await t.none(
  //     `insert into message (
  //     id, sender, content, ord, deleted, version) values
  //     ($1, $2, $3, $4, false, $5)`,
  //     [id, from, content, order, version]
  //   );

  await prisma.message.create({
    data: {
      id: id,
      sender: from,
      content: content,
      ord: order,
      deleted: false,
      version: version,
    },
  });
}

async function sendPoke() {
  //   const pusher = new Pusher({
  //     appId: process.env.NEXT_PUBLIC_REPLICHAT_PUSHER_APP_ID,
  //     key: process.env.NEXT_PUBLIC_REPLICHAT_PUSHER_KEY,
  //     secret: process.env.NEXT_PUBLIC_REPLICHAT_PUSHER_SECRET,
  //     cluster: process.env.NEXT_PUBLIC_REPLICHAT_PUSHER_CLUSTER,
  //     useTLS: true,
  //   });

  //   await pusher.trigger("default", "poke", {});

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const channelA = client.channel("room-1");

  await channelA.send({
    type: "broadcast",
    event: "poke",
    payload: {},
  });

  const t0 = Date.now();
  console.log("Sent poke in", Date.now() - t0);
}
