import { auth } from "@/auth";
import { PrismaTransaction, prisma } from "@/utils/prisma";
import { ClientMessage, MutationV1Custom } from "@/utils/replicacheMutations";
import { Prisma } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

export const POST = auth(async (req) => {
  if (!req.auth) {
    return Response.json({ message: "Not authenticated" }, { status: 401 });
  }

  const session = req.auth;
  const user = session.user;
  const searchParams = req.nextUrl.searchParams;
  const body = req.body ? await req.json() : null;

  if (!body) {
    return Response.json({ message: "Missing body" }, { status: 400 });
  }

  const push = body;
  const mutations: MutationV1Custom[] = push.mutations; // TODO: Probably need to do some validation here

  console.log("Processing push", JSON.stringify(push));

  const t0 = Date.now();

  try {
    // Iterate each mutation in the push.
    for (const mutation of mutations) {
      const t1 = Date.now();

      try {
        await prisma.$transaction(
          (t) => processMutation(t, push.clientGroupID, mutation, user.id),
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
          processMutation(t, push.clientGroupID, mutation, user.id, e)
        );
      }

      console.log("Processed mutation in", Date.now() - t1);
    }

    await sendPoke();

    return Response.json({}, { status: 200 });
    // We need to await here otherwise, Next.js will frequently kill the request
    // and the poke won't get sent.
  } catch (e) {
    console.error(e);
    return Response.json(e?.toString(), { status: 500 });
  } finally {
    console.log("Processed push in", Date.now() - t0);
  }
}) as any;

async function processMutation(
  prisma: PrismaTransaction,
  clientGroupID: string,
  mutation: MutationV1Custom,
  userId: string,
  error?: string | undefined | unknown
) {
  const { clientID } = mutation;

  const { version: prevVersion, id: spaceId } =
    await prisma.replicacheSpace.findFirstOrThrow({
      where: {
        userAuthorizations: { every: { User: { id: userId } } },
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
          mutation.args as ClientMessage,
          nextVersion,
          spaceId
        );
        break;
      default:
        const _: never = mutation.name; // Exhaustiveness check
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
  await prisma.replicacheSpace.updateMany({
    where: {
      userAuthorizations: { every: { User: { id: userId } } },
    },
    data: {
      version: nextVersion,
    },
  });
}

async function getLastMutationID(prisma: PrismaTransaction, clientID: string) {
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
  { id, sender, content, ord }: ClientMessage,
  version: number,
  spaceId: string
) {
  await prisma.message.create({
    data: {
      id: id,
      sender: sender,
      content: content,
      ord: ord,
      deleted: false,
      version: version,
      replicacheSpaceId: spaceId,
    },
  });
}

async function sendPoke() {
  const t0 = Date.now();
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const channelA = client.channel("room-1");

  await channelA.send({
    type: "broadcast",
    event: "poke",
    payload: {},
  });

  console.log("Sent poke in", Date.now() - t0);
}
