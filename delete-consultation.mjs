import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const svc = await prisma.service.findFirst({
  where: { nameEn: { contains: 'Consultation', mode: 'insensitive' } },
});

if (!svc) {
  console.log('Service not found');
  await prisma.$disconnect();
  process.exit(0);
}

console.log(`Found: id=${svc.id}  "${svc.nameEn}" / "${svc.nameAr}"`);

const lines  = await prisma.dailyActivityLine.count({ where: { serviceId: svc.id } });
const prices = await prisma.clinicPrice.count({ where: { serviceId: svc.id } });
console.log(`  Income lines : ${lines}`);
console.log(`  Price rows   : ${prices}`);

// Delete in FK-safe order inside a transaction
await prisma.$transaction([
  prisma.dailyActivityLine.deleteMany({ where: { serviceId: svc.id } }),
  prisma.clinicPrice.deleteMany({ where: { serviceId: svc.id } }),
  prisma.service.delete({ where: { id: svc.id } }),
]);

console.log('Deleted successfully.');
await prisma.$disconnect();
