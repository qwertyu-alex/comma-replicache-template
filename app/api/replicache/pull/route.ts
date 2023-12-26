import { auth } from "@/auth";
import { PrismaTransaction, prisma } from "@/utils/prisma";
import { Prisma } from "@prisma/client";
import { PatchOperation, PullResponse } from "replicache";

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

  const pull = body;
  console.log(`Processing pull`, JSON.stringify(pull));
  const { clientGroupID } = pull;
  const fromVersion = pull.cookie ?? 0;
  const t0 = Date.now();
  try {
    const dbRes = await prisma.$transaction(
      async (prisma) => {
        const { version: currentVersion, id: spaceId } =
          await prisma.replicacheSpace.findFirstOrThrow({
            where: {
              userAuthorizations: { every: { User: { id: user.id } } },
            },
            select: {
              version: true,
              id: true,
            },
          });

        if (fromVersion > currentVersion) {
          throw new Error(
            `fromVersion ${fromVersion} is from the future - aborting. This can happen in development if the server restarts. In that case, clear appliation data in browser and refresh.`
          );
        }

        // Get lmids for requesting client groups.
        const lastMutationIDChanges = await getLastMutationIDChanges(
          prisma,
          clientGroupID,
          fromVersion
        );

        const changed = await prisma.message.findMany({
          select: {
            id: true,
            sender: true,
            content: true,
            ord: true,
            version: true,
            deleted: true,
          },
          where: {
            version: {
              gt: fromVersion,
            },
            replicacheSpaceId: spaceId,
          },
        });

        // Build and return response.
        const patch: PatchOperation[] = [];
        for (const row of changed) {
          const {
            id,
            sender,
            content,
            ord,
            version: rowVersion,
            deleted,
          } = row;
          if (deleted) {
            if (rowVersion > fromVersion) {
              patch.push({
                op: "del",
                key: `message/${id}`,
              });
            }
          } else {
            patch.push({
              op: "put",
              key: `message/${id}`,
              value: {
                sender,
                content,
                ord,
              },
            });
          }
        }

        const body: PullResponse = {
          lastMutationIDChanges: lastMutationIDChanges ?? {},
          cookie: currentVersion,
          patch,
        };
        return body;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable, // Required for Replicache to work
        maxWait: 5000, // default: 2000
        timeout: 10000, // default: 5000
      }
    );
    return Response.json(dbRes);
  } catch (e) {
    console.error(e);
    return Response.json({ message: e?.toString() }, { status: 500 });
  }
}) as any;

async function getLastMutationIDChanges(
  prisma: PrismaTransaction,
  clientGroupID: string,
  fromVersion: number
) {
  const rows = await prisma.replicacheClient.findMany({
    select: {
      id: true,
      last_mutation_id: true,
    },
    where: {
      client_group_id: clientGroupID,
      version: {
        gt: fromVersion,
      },
    },
  });

  return Object.fromEntries(rows.map((r) => [r.id, r.last_mutation_id]));
}
