import { Message } from "@prisma/client";
import { MutatorDefs, WriteTransaction } from "replicache";
import type { MutationV1 } from "replicache/out/replicache.d.ts";

export type ClientMessage = Pick<Message, "sender" | "content" | "ord" | "id">;

export const mutators = {
  async createMessage(
    tx: WriteTransaction,
    { id, sender, content, ord }: ClientMessage
  ) {
    await tx.set(`message/${id}`, {
      sender,
      content,
      ord,
    });
  },
} satisfies MutatorDefs;

export type mutators = typeof mutators;

export type MutationV1Custom = Omit<MutationV1, "name"> & {
  name: keyof mutators;
};
