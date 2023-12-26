// import { Prisma } from "@prisma/client";
// import { NextApiRequest, NextApiResponse } from "next";
// import { PatchOperation, PullResponse } from "replicache";
// import { serverID } from "../../server/db";
// import { PrismaTransaction, prisma } from "../../utils/prisma";

// export default async function (req: NextApiRequest, res: NextApiResponse) {
//   const pull = req.body;
//   console.log(`Processing pull`, JSON.stringify(pull));
//   const { clientGroupID } = pull;
//   const fromVersion = pull.cookie ?? 0;
//   const t0 = Date.now();

//   try {
//     await prisma.$transaction(
//       async (prisma) => {
//         const { version: currentVersion } =
//           await prisma.replicacheServer.findFirstOrThrow({
//             where: {
//               id: serverID,
//             },
//             select: {
//               version: true,
//             },
//           });

//         if (fromVersion > currentVersion) {
//           throw new Error(
//             `fromVersion ${fromVersion} is from the future - aborting. This can happen in development if the server restarts. In that case, clear appliation data in browser and refresh.`
//           );
//         }

//         // Get lmids for requesting client groups.
//         const lastMutationIDChanges = await getLastMutationIDChanges(
//           prisma,
//           clientGroupID,
//           fromVersion
//         );

//         const changed = await prisma.message.findMany({
//           select: {
//             id: true,
//             sender: true,
//             content: true,
//             ord: true,
//             version: true,
//             deleted: true,
//           },
//           where: {
//             version: {
//               gt: fromVersion,
//             },
//           },
//         });

//         // Build and return response.
//         const patch: PatchOperation[] = [];
//         for (const row of changed) {
//           const {
//             id,
//             sender,
//             content,
//             ord,
//             version: rowVersion,
//             deleted,
//           } = row;
//           if (deleted) {
//             if (rowVersion > fromVersion) {
//               patch.push({
//                 op: "del",
//                 key: `message/${id}`,
//               });
//             }
//           } else {
//             patch.push({
//               op: "put",
//               key: `message/${id}`,
//               value: {
//                 from: sender,
//                 content: content,
//                 order: ord,
//               },
//             });
//           }
//         }

//         const body: PullResponse = {
//           lastMutationIDChanges: lastMutationIDChanges ?? {},
//           cookie: currentVersion,
//           patch,
//         };
//         res.json(body);
//         res.end();
//       },
//       {
//         isolationLevel: Prisma.TransactionIsolationLevel.Serializable, // Required for Replicache to work
//         maxWait: 5000, // default: 2000
//         timeout: 10000, // default: 5000
//       }
//     );
//   } catch (e) {
//     console.error(e);
//     res.status(500).send(e?.toString());
//   } finally {
//     console.log("Processed pull in", Date.now() - t0);
//   }
// }

// async function getLastMutationIDChanges(
//   prisma: PrismaTransaction,
//   clientGroupID: string,
//   fromVersion: number
// ) {
//   const rows = await prisma.replicacheClient.findMany({
//     select: {
//       id: true,
//       last_mutation_id: true,
//     },
//     where: {
//       client_group_id: clientGroupID,
//       version: {
//         gt: fromVersion,
//       },
//     },
//   });

//   return Object.fromEntries(rows.map((r) => [r.id, r.last_mutation_id]));
// }
