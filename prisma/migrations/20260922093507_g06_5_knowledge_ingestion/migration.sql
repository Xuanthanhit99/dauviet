-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- CreateEnum
CREATE TYPE "IngestionSourceClass" AS ENUM ('AUTHORITATIVE', 'STRUCTURED_KNOWLEDGE', 'GEOSPATIAL', 'MEDIA', 'OPERATIONAL_PROVIDER');

-- CreateEnum
CREATE TYPE "IngestionTransport" AS ENUM ('API', 'DATASET', 'STRUCTURED_IMPORT');

-- CreateEnum
CREATE TYPE "RawPayloadStoragePolicy" AS ENUM ('STORE_ALLOWED', 'STORE_LIMITED', 'REFERENCE_ONLY', 'PROHIBITED');

-- CreateEnum
CREATE TYPE "IngestionScopeType" AS ENUM ('COUNTRY', 'REGION', 'CITY', 'DESTINATION', 'EXTERNAL_IDS', 'EXPLICIT_ENTITY_SET');

-- CreateEnum
CREATE TYPE "IngestionRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IngestionRunTrigger" AS ENUM ('MANUAL', 'SCHEDULED', 'RETRY');

-- CreateEnum
CREATE TYPE "NormalizationStatus" AS ENUM ('PENDING', 'NORMALIZED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "IngestionCandidateType" AS ENUM ('COUNTRY', 'REGION', 'CITY', 'DESTINATION', 'PLACE', 'PERSON', 'EVENT', 'HISTORICAL_FACT', 'MEDIA');

-- CreateEnum
CREATE TYPE "IngestionCandidateStatus" AS ENUM ('UNRESOLVED', 'AUTO_MATCHED', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'MERGED');

-- CreateEnum
CREATE TYPE "ExternalIdentityState" AS ENUM ('ACTIVE', 'STALE', 'DISAPPEARED');

-- CreateEnum
CREATE TYPE "ResolutionOutcome" AS ENUM ('EXACT_MATCH', 'HIGH_CONFIDENCE_MATCH', 'AMBIGUOUS', 'NO_MATCH', 'CONFLICT');

-- CreateEnum
CREATE TYPE "IngestionErrorClass" AS ENUM ('TRANSIENT', 'PERMANENT', 'POLICY_REJECTED', 'AUTH_ERROR', 'VALIDATION_ERROR');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


-- NOTE: `prisma migrate diff` also proposed re-adding 'FACT' to EntityKind
-- (already applied by an earlier migration) and dropping 17 trigram/PostGIS
-- GIST search indexes not representable in the Prisma schema DSL. Both are
-- the same known, pre-existing, unrelated drift artifact documented in
-- every prior Global V2 phase's final report (see docs/backend/
-- G05_FINAL_REPORT.md section "Defects found"). Manually stripped here,
-- exactly as every prior phase has done - not introduced or fixed by
-- G06.5.
ALTER TYPE "EntityKind" ADD VALUE 'INGESTION_SOURCE';
ALTER TYPE "EntityKind" ADD VALUE 'INGESTION_JOB';
ALTER TYPE "EntityKind" ADD VALUE 'INGESTION_RUN';
ALTER TYPE "EntityKind" ADD VALUE 'INGESTION_CANDIDATE';

-- CreateTable
CREATE TABLE "IngestionSource" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceClass" "IngestionSourceClass" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionSourcePolicy" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "transport" "IngestionTransport" NOT NULL,
    "authRequired" BOOLEAN NOT NULL DEFAULT false,
    "rateLimitPerSecond" INTEGER,
    "rateLimitPerDay" INTEGER,
    "concurrencyLimit" INTEGER NOT NULL DEFAULT 1,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "rawPayloadStorage" "RawPayloadStoragePolicy" NOT NULL DEFAULT 'PROHIBITED',
    "normalizedStorageRight" "ProviderRightState" NOT NULL DEFAULT 'UNKNOWN',
    "cacheMaxAgeSeconds" INTEGER,
    "retentionDays" INTEGER,
    "attributionRequirement" "ProviderAttributionRequirement" NOT NULL DEFAULT 'UNKNOWN',
    "licenseCode" TEXT,
    "licenseUrl" TEXT,
    "sourceUrl" TEXT,
    "commercialUseRight" "ProviderRightState" NOT NULL DEFAULT 'UNKNOWN',
    "mediaReusePolicy" "ProviderRightState",
    "conditionalNotes" TEXT,
    "lastPolicyReviewAt" TIMESTAMP(3),
    "policyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionSourcePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionSourcePolicyEvidence" (
    "id" TEXT NOT NULL,
    "sourcePolicyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "accessedAt" TIMESTAMP(3) NOT NULL,
    "sourceType" "ProviderPolicyEvidenceSourceType" NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionSourcePolicyEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionJob" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "scopeType" "IngestionScopeType" NOT NULL,
    "scopeParams" JSONB NOT NULL,
    "label" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionRun" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" "IngestionRunStatus" NOT NULL DEFAULT 'QUEUED',
    "trigger" "IngestionRunTrigger" NOT NULL DEFAULT 'MANUAL',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "adapterVersion" TEXT NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "counts" JSONB NOT NULL,
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionRecord" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "storageClassification" "RawPayloadStoragePolicy" NOT NULL,
    "rawPayload" JSONB,
    "normalizationStatus" "NormalizationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionCandidate" (
    "id" TEXT NOT NULL,
    "recordId" TEXT,
    "sourceId" TEXT NOT NULL,
    "candidateType" "IngestionCandidateType" NOT NULL,
    "normalizationVersion" INTEGER NOT NULL,
    "normalizedData" JSONB NOT NULL,
    "status" "IngestionCandidateStatus" NOT NULL DEFAULT 'UNRESOLVED',
    "mergedIntoCandidateId" TEXT,
    "resolvedEntityType" "EntityKind",
    "resolvedEntityId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalEntityIdentity" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "entityType" "EntityKind" NOT NULL,
    "candidateId" TEXT,
    "resolvedEntityId" TEXT,
    "state" "ExternalIdentityState" NOT NULL DEFAULT 'ACTIVE',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalEntityIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityResolution" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "outcome" "ResolutionOutcome" NOT NULL,
    "matchedEntityType" "EntityKind",
    "matchedEntityId" TEXT,
    "signals" JSONB NOT NULL,
    "confidenceScore" DOUBLE PRECISION,
    "autoResolved" BOOLEAN NOT NULL DEFAULT false,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityResolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionEvidence" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalRecordId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "retrievedAt" TIMESTAMP(3) NOT NULL,
    "licenseCode" TEXT,
    "licenseUrl" TEXT,
    "attributionText" TEXT,
    "adapterVersion" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionError" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "recordId" TEXT,
    "externalId" TEXT,
    "errorClass" "IngestionErrorClass" NOT NULL,
    "message" TEXT NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionCheckpoint" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "runId" TEXT,
    "cursor" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IngestionSource_code_key" ON "IngestionSource"("code");

-- CreateIndex
CREATE INDEX "IngestionSource_enabled_idx" ON "IngestionSource"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "IngestionSourcePolicy_sourceId_key" ON "IngestionSourcePolicy"("sourceId");

-- CreateIndex
CREATE INDEX "IngestionSourcePolicy_enabled_idx" ON "IngestionSourcePolicy"("enabled");

-- CreateIndex
CREATE INDEX "IngestionSourcePolicyEvidence_sourcePolicyId_idx" ON "IngestionSourcePolicyEvidence"("sourcePolicyId");

-- CreateIndex
CREATE INDEX "IngestionJob_sourceId_idx" ON "IngestionJob"("sourceId");

-- CreateIndex
CREATE INDEX "IngestionRun_jobId_idx" ON "IngestionRun"("jobId");

-- CreateIndex
CREATE INDEX "IngestionRun_sourceId_idx" ON "IngestionRun"("sourceId");

-- CreateIndex
CREATE INDEX "IngestionRun_status_idx" ON "IngestionRun"("status");

-- CreateIndex
CREATE INDEX "IngestionRecord_sourceId_externalId_idx" ON "IngestionRecord"("sourceId", "externalId");

-- CreateIndex
CREATE INDEX "IngestionRecord_runId_idx" ON "IngestionRecord"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "IngestionRecord_sourceId_externalId_payloadHash_key" ON "IngestionRecord"("sourceId", "externalId", "payloadHash");

-- CreateIndex
CREATE INDEX "IngestionCandidate_sourceId_idx" ON "IngestionCandidate"("sourceId");

-- CreateIndex
CREATE INDEX "IngestionCandidate_status_idx" ON "IngestionCandidate"("status");

-- CreateIndex
CREATE INDEX "IngestionCandidate_candidateType_idx" ON "IngestionCandidate"("candidateType");

-- CreateIndex
CREATE INDEX "IngestionCandidate_resolvedEntityType_resolvedEntityId_idx" ON "IngestionCandidate"("resolvedEntityType", "resolvedEntityId");

-- CreateIndex
CREATE INDEX "ExternalEntityIdentity_entityType_resolvedEntityId_idx" ON "ExternalEntityIdentity"("entityType", "resolvedEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalEntityIdentity_sourceId_externalId_key" ON "ExternalEntityIdentity"("sourceId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "EntityResolution_candidateId_key" ON "EntityResolution"("candidateId");

-- CreateIndex
CREATE INDEX "EntityResolution_outcome_idx" ON "EntityResolution"("outcome");

-- CreateIndex
CREATE INDEX "IngestionEvidence_candidateId_idx" ON "IngestionEvidence"("candidateId");

-- CreateIndex
CREATE INDEX "IngestionEvidence_sourceId_idx" ON "IngestionEvidence"("sourceId");

-- CreateIndex
CREATE INDEX "IngestionError_runId_idx" ON "IngestionError"("runId");

-- CreateIndex
CREATE INDEX "IngestionError_errorClass_idx" ON "IngestionError"("errorClass");

-- CreateIndex
CREATE UNIQUE INDEX "IngestionCheckpoint_jobId_key" ON "IngestionCheckpoint"("jobId");

-- CreateIndex
CREATE INDEX "IngestionCheckpoint_runId_idx" ON "IngestionCheckpoint"("runId");

-- AddForeignKey
ALTER TABLE "IngestionSourcePolicy" ADD CONSTRAINT "IngestionSourcePolicy_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IngestionSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionSourcePolicyEvidence" ADD CONSTRAINT "IngestionSourcePolicyEvidence_sourcePolicyId_fkey" FOREIGN KEY ("sourcePolicyId") REFERENCES "IngestionSourcePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionJob" ADD CONSTRAINT "IngestionJob_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IngestionSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionRun" ADD CONSTRAINT "IngestionRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "IngestionJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionRun" ADD CONSTRAINT "IngestionRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IngestionSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionRecord" ADD CONSTRAINT "IngestionRecord_runId_fkey" FOREIGN KEY ("runId") REFERENCES "IngestionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionRecord" ADD CONSTRAINT "IngestionRecord_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IngestionSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionCandidate" ADD CONSTRAINT "IngestionCandidate_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "IngestionRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionCandidate" ADD CONSTRAINT "IngestionCandidate_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IngestionSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionCandidate" ADD CONSTRAINT "IngestionCandidate_mergedIntoCandidateId_fkey" FOREIGN KEY ("mergedIntoCandidateId") REFERENCES "IngestionCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalEntityIdentity" ADD CONSTRAINT "ExternalEntityIdentity_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IngestionSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalEntityIdentity" ADD CONSTRAINT "ExternalEntityIdentity_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "IngestionCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityResolution" ADD CONSTRAINT "EntityResolution_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "IngestionCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionEvidence" ADD CONSTRAINT "IngestionEvidence_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "IngestionCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionEvidence" ADD CONSTRAINT "IngestionEvidence_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IngestionSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionError" ADD CONSTRAINT "IngestionError_runId_fkey" FOREIGN KEY ("runId") REFERENCES "IngestionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionError" ADD CONSTRAINT "IngestionError_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "IngestionRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionCheckpoint" ADD CONSTRAINT "IngestionCheckpoint_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "IngestionJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionCheckpoint" ADD CONSTRAINT "IngestionCheckpoint_runId_fkey" FOREIGN KEY ("runId") REFERENCES "IngestionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

