/**
 * Seed a demo tenant ("Acme Inc" → product "Acme World") with roles, a couple
 * of users, and a published Lobby space populated with interactive objects.
 * Idempotent: safe to run repeatedly (upserts by natural keys).
 *
 *   pnpm db:seed
 */
import { Prisma, PrismaClient, RoleKey, SpaceType } from '@prisma/client';
import { DEFAULT_ROLE_PERMISSIONS } from '@mvs/shared';
import { defaultObjectsFor } from '@mvs/config';

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'acme' },
    update: {},
    create: {
      slug: 'acme',
      name: 'Acme Inc',
      mondayAccountId: 'demo-monday-account-1',
      status: 'ACTIVE',
      branding: {
        create: {
          productName: 'Acme World',
          logoUrl: null,
          palette: {
            primary: '#6c5ce7',
            secondary: '#00b894',
            background: '#0f1115',
            surface: '#1a1d24',
            accent: '#fdcb6e',
            text: '#f5f6fa',
          },
        },
      },
    },
    include: { branding: true },
  });

  // Roles with default permission sets
  for (const key of Object.values(RoleKey)) {
    await prisma.role.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key } },
      update: { permissions: DEFAULT_ROLE_PERMISSIONS[key] },
      create: {
        tenantId: tenant.id,
        key,
        name: toTitle(key),
        permissions: DEFAULT_ROLE_PERMISSIONS[key],
      },
    });
  }

  const adminRole = await prisma.role.findFirstOrThrow({
    where: { tenantId: tenant.id, key: RoleKey.TENANT_ADMIN },
  });
  const memberRole = await prisma.role.findFirstOrThrow({
    where: { tenantId: tenant.id, key: RoleKey.MEMBER },
  });

  await prisma.user.upsert({
    where: { tenantId_mondayUserId: { tenantId: tenant.id, mondayUserId: 'demo-user-admin' } },
    update: {},
    create: {
      tenantId: tenant.id,
      mondayUserId: 'demo-user-admin',
      email: 'admin@acme.test',
      name: 'Ada Admin',
      company: 'Acme Inc',
      jobTitle: 'Workspace Admin',
      roleId: adminRole.id,
      avatarConfig: { modelId: 'default', color: '#6c5ce7', accessories: [] },
    },
  });

  await prisma.user.upsert({
    where: { tenantId_mondayUserId: { tenantId: tenant.id, mondayUserId: 'demo-user-member' } },
    update: {},
    create: {
      tenantId: tenant.id,
      mondayUserId: 'demo-user-member',
      email: 'mia@acme.test',
      name: 'Mia Member',
      company: 'Acme Inc',
      jobTitle: 'Designer',
      roleId: memberRole.id,
      avatarConfig: { modelId: 'default', color: '#00b894', accessories: [] },
    },
  });

  // Lobby space + world manifest
  const lobby = await prisma.space.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'lobby' } },
    update: { isPublished: true },
    create: {
      tenantId: tenant.id,
      type: SpaceType.LOBBY,
      name: 'Lobby',
      slug: 'lobby',
      isPublished: true,
      capacity: 100,
      sceneConfig: {
        version: 1,
        environment: { skybox: 'city', groundColor: '#1f2430' },
        lighting: { ambientIntensity: 0.6, directionalIntensity: 1.2, shadows: true },
        bounds: { min: [-30, 0, -30], max: [30, 12, 30] },
        spawnPoints: [{ id: 'entrance', position: [0, 0, 8], rotation: 3.14159 }],
        spatialAudio: { minDistance: 2, maxDistance: 18, rolloff: 'inverse' },
      },
    },
  });

  // Replace objects deterministically with the designed Lobby (from @mvs/config)
  await prisma.sceneObject.deleteMany({ where: { spaceId: lobby.id } });
  await prisma.sceneObject.createMany({
    data: defaultObjectsFor(SpaceType.LOBBY).map((o) => ({
      tenantId: tenant.id,
      spaceId: lobby.id,
      type: o.type,
      transform: o.transform as Prisma.InputJsonValue,
      config: o.config as Prisma.InputJsonValue,
      interaction: (o.interaction ?? undefined) as Prisma.InputJsonValue | undefined,
    })),
  });

  console.log(`Seeded tenant "${tenant.name}" (${tenant.slug}) with Lobby space ${lobby.id}.`);
}

function toTitle(key: string): string {
  return key
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
