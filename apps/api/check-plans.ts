import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const plans = await prisma.plan.findMany();
    console.log('PLAN_DATA_START');
    console.log(JSON.stringify(plans, null, 2));
    console.log('PLAN_DATA_END');
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
