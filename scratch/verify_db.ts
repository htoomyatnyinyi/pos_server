import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  try {
    const userCount = await prisma.user.count()
    console.log(`Connection successful. User count: ${userCount}`)
  } catch (error) {
    console.error('Error connecting to database or table does not exist:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
