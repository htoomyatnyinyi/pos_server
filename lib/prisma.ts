import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

/*
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

// Client အစား Pool ကို သုံးပါ
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })
*/
