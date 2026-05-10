import { prisma } from '../src/lib/prisma'

async function main() {
  try {
    const defaultCategory = await prisma.category.upsert({
      where: { slug: 'general' },
      update: {},
      create: {
        name: 'General',
        slug: 'general',
      },
    })
    console.log('Default category created/verified:', defaultCategory)
  } catch (error) {
    console.error('Error seeding category:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
