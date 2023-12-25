import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const create = await prisma.replicacheServer.create({
  data: {
    id: 1,
    version: 1,
  },
})


console.log(create)