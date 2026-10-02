import { PrismaClient, AuthProvider, Role, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function main() {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Refusing to provision: NODE_ENV must be production.');
  }

  const email = required('BOOTSTRAP_ADMIN_EMAIL').toLowerCase();
  const password = required('BOOTSTRAP_ADMIN_PASSWORD');
  const displayName = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || 'Dấu Việt Admin';

  if (password.length < 12) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.');
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    include: { authIdentities: true },
  });

  if (existing && existing.status === UserStatus.DELETED) {
    throw new Error('Refusing to reactivate a deleted account.');
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  await prisma.$transaction(async (tx) => {
    const user = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: {
            displayName: existing.displayName || displayName,
            status: UserStatus.ACTIVE,
            emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
            roles: Array.from(new Set([...existing.roles, Role.ADMIN])),
          },
        })
      : await tx.user.create({
          data: {
            email,
            displayName,
            status: UserStatus.ACTIVE,
            emailVerifiedAt: new Date(),
            roles: [Role.ADMIN],
          },
        });

    const passwordIdentity = existing?.authIdentities.find((identity) => identity.provider === AuthProvider.PASSWORD);
    if (passwordIdentity) {
      await tx.authIdentity.update({
        where: { id: passwordIdentity.id },
        data: { passwordHash },
      });
    } else {
      await tx.authIdentity.create({
        data: { userId: user.id, provider: AuthProvider.PASSWORD, passwordHash },
      });
    }

    await tx.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'admin_bootstrap_credentials_rotated' },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'admin.bootstrap.provisioned',
        entityId: user.id,
        metadata: { email, method: 'railway_env_one_time_bootstrap' },
      },
    });
  });

  console.log(`Production admin provisioned for ${email}. Remove BOOTSTRAP_ADMIN_PASSWORD from Railway now.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
