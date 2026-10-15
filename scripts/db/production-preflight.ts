import { PrismaClient, PublicationStatus, StoryEditorialStatus } from '@prisma/client';
import { GOLDEN_COUNTRIES, GOLDEN_REGIONS, GOLDEN_CITIES, GOLDEN_DESTINATIONS, GOLDEN_PLACES, GOLDEN_JOURNEYS, GOLDEN_STORIES } from '../../prisma/golden';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('db:preflight:production must run outside a production runtime. This command is read-only.');
  const [countries,regions,cities,destinations,places,journeys,stories,searchDocs,queue] = await Promise.all([
    prisma.country.count({ where:{ status:PublicationStatus.PUBLISHED } }),
    prisma.region.count({ where:{ status:PublicationStatus.PUBLISHED } }),
    prisma.city.count({ where:{ status:PublicationStatus.PUBLISHED } }),
    prisma.destination.count({ where:{ status:PublicationStatus.PUBLISHED } }),
    prisma.place.count({ where:{ publicationStatus:PublicationStatus.PUBLISHED } }),
    prisma.journey.count({ where:{ editorialStatus:PublicationStatus.PUBLISHED } }),
    prisma.story.count({ where:{ editorialStatus:StoryEditorialStatus.PUBLISHED } }),
    prisma.searchDocument.count(),
    prisma.searchProjectionQueue.count(),
  ]);
  const expected={countries:GOLDEN_COUNTRIES.length,regions:GOLDEN_REGIONS.length,cities:GOLDEN_CITIES.length,destinations:GOLDEN_DESTINATIONS.length,places:GOLDEN_PLACES.length,journeys:GOLDEN_JOURNEYS.length,stories:GOLDEN_STORIES.length};
  const actual={countries,regions,cities,destinations,places,journeys,stories,searchDocuments:searchDocs,searchQueue:queue};
  console.log(JSON.stringify({readOnly:true,expected,actual,projectionHealthy:searchDocs>0 || queue>0},null,2));
  if (countries<expected.countries || regions<expected.regions || cities<expected.cities || destinations<expected.destinations || places<expected.places || journeys<expected.journeys || stories<expected.stories) process.exitCode=2;
}

main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>prisma.$disconnect());
