if (process.env.CONFIRM_PRODUCTION_SEED !== 'YES') {
  throw new Error('Refusing production seed. Set CONFIRM_PRODUCTION_SEED=YES explicitly for the one-shot production operation.');
}

process.env.NODE_ENV = 'production';
process.env.SEED_PROFILE = 'production';

void (async () => {
  await import('../../prisma/seed.ts');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
