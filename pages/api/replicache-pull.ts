import { NextApiRequest, NextApiResponse } from "next";
import { PullResponse } from "replicache";
import { serverID } from "../../server/db";
import { PrismaTransaction, prisma } from "../../util/prisma";
import { Prisma } from "@prisma/client";

export default async function (req: NextApiRequest, res: NextApiResponse) {
  const pull = req.body;
  console.log(`Processing pull`, JSON.stringify(pull));
  const { clientGroupID } = pull;
  const fromVersion = pull.cookie ?? 0;
  const t0 = Date.now();

  try {
    await prisma.$transaction(
      async (prisma) => {
        // Read all data in a single transaction so it's consistent.
        // Get current version.
        // const { version: currentVersion } = await t.one<{ version: number }>(
        //   "select version from replicache_server where id = $1",
        //   serverID
        // );

        const { version: currentVersion } =
          await prisma.replicacheServer.findFirst({
            where: {
              id: serverID,
            },
            select: {
              version: true,
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

        // Get changed domain objects since requested version.
        // const changed = await t.manyOrNone<{
        //   id: string;
        //   sender: string;
        //   content: string;
        //   ord: number;
        //   version: number;
        //   deleted: boolean;
        // }>(
        //   "select id, sender, content, ord, version, deleted from message where version > $1",
        //   fromVersion
        // );

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
          },
        });

        // Build and return response.
        const patch = [];
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
                from: sender,
                content: content,
                order: ord,
              },
            });
          }
        }

        const body: PullResponse = {
          lastMutationIDChanges: lastMutationIDChanges ?? {},
          cookie: currentVersion,
          patch,
        };
        res.json(body);
        res.end();
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable, // Required for Replicache to work
        maxWait: 5000, // default: 2000
        timeout: 10000, // default: 5000
      }
    );
  } catch (e) {
    console.error(e);
    res.status(500).send(e.toString());
  } finally {
    console.log("Processed pull in", Date.now() - t0);
  }
}

async function getLastMutationIDChanges(
  prisma: PrismaTransaction,
  clientGroupID: string,
  fromVersion: number
) {
  // const rows = await t.manyOrNone<{ id: string; last_mutation_id: number }>(
  //   `select id, last_mutation_id
  //   from replicache_client
  //   where client_group_id = $1 and version > $2`,
  //   [clientGroupID, fromVersion]
  // );

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
