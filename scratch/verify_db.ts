import { prisma } from '../src/lib/prisma'

async function main() {
  try {
    const userCount = await prisma.user.count()
    const categoryCount = await prisma.category.count()
    const firstCategory = await prisma.category.findFirst()
    console.log(`Connection successful. User count: ${userCount}`)
    console.log(`Category count: ${categoryCount}`)
    console.log(`First Category:`, firstCategory)
  } catch (error) {
    console.error('Error connecting to database or table does not exist:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
