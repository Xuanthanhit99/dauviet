/**
 * G03 - Global Historical Knowledge Extension. Small, deliberately
 * conservative Japan historical fixture proving the G03 model
 * (DateEra/chronology ordinals, EventCountry, EraCountry) with real content,
 * not just Vietnam. Same sourcing discipline as `docs/backend/golden-data/
 * sources-manifest.md`: Tier A (`credibilityLevel: PRIMARY`) = an official
 * government/institutional/UNESCO record; Tier A/B (`SECONDARY`) =
 * Encyclopaedia Britannica. No Wikipedia/Fandom/blog/travel-guide page is
 * cited as a Source. Research performed 2026-09-10; full claim-by-claim
 * reasoning (including why Emperor Jimmu's traditional 660 BCE founding date
 * is deliberately NOT seeded here - its only available source states the
 * date/genealogy is legendary, not historical, the same reasoning this
 * repo's own `FACT_CO_LOA_CAPITAL` already applies to Co Loa's founding via
 * `date: UNKNOWN_DATE` - see prisma/golden/facts.ts) is preserved in the
 * research notes for this phase. Deliberately does NOT seed a Japan `Place`
 * row (kept small; no historical-site geometry/data was researched this
 * phase) - Person/Event/Fact/Era rows are enough to exercise the G03 model
 * end-to-end.
 */
import { EventCountryRole, FactCertainty, FactType, SourceCredibility, SourceType } from '@prisma/client';
import { FactCitationSeed, FactSeedSpec } from './facts';
import { HistoricalDateSeed, circaYear, exactDate, yearOnly } from './helpers';
import { EraSeedSpec } from './eras';
import { PersonSeedSpec } from './people';
import { SourceSeedSpec } from './sources';

const verified = (sourceKey: string, extra: Partial<FactCitationSeed> = {}): FactCitationSeed => ({
  sourceKey,
  verificationState: 'VERIFIED',
  ...extra,
});

export const JAPAN_COUNTRY_KEY = 'COUNTRY_JP';

// -----------------------------------------------------------------------
// Eras (reuses the exact Vietnam `EraSeedSpec` shape - merged into the same
// GOLDEN_ERAS upsert loop in prisma/seed.ts; linked to Country separately
// via EraCountry once countriesByKey exists, see JAPAN_ERA_KEYS below).
// -----------------------------------------------------------------------
export const JAPAN_ERAS: EraSeedSpec[] = [
  {
    key: 'ERA_JP_NARA',
    vi: { name: 'Thời kỳ Nara (Nhật Bản)', summary: 'Kinh đô Nhật Bản đặt tại Heijō-kyō (Nara), năm 710-784.' },
    en: { name: 'Nara Period (Japan)' },
    start: yearOnly(710),
    end: yearOnly(784),
  },
  {
    key: 'ERA_JP_HEIAN',
    vi: { name: 'Thời kỳ Heian (Nhật Bản)', summary: 'Kinh đô Nhật Bản đặt tại Heian-kyō (Kyoto), bắt đầu năm 794.' },
    en: { name: 'Heian Period (Japan)' },
    start: yearOnly(794),
    // End c. 1185 (rise of the Kamakura shogunate) is a well-known but
    // historiographically approximate boundary, not an exact-dated event -
    // qualifier says so honestly rather than asserting false precision.
    end: circaYear(1185),
  },
  {
    key: 'ERA_JP_EDO',
    vi: { name: 'Thời kỳ Edo (Mạc phủ Tokugawa)', summary: 'Mạc phủ Tokugawa cai trị Nhật Bản, năm 1603-1867.' },
    en: { name: 'Edo (Tokugawa) Period' },
    start: yearOnly(1603),
    end: yearOnly(1867),
  },
];
export const JAPAN_ERA_KEYS = JAPAN_ERAS.map((e) => e.key);

// -----------------------------------------------------------------------
// Events - own shape (eraKey optional: Sekigahara/the Meiji Restoration are
// transition-marking events that do not sit inside either listed period;
// countryRole feeds the EventCountry link created after Global Geography).
// -----------------------------------------------------------------------
export interface JapanEventSeedSpec {
  key: string;
  vi: { title: string; summary?: string };
  en: { title: string; summary?: string };
  date: HistoricalDateSeed;
  importance?: number;
  eraKey?: string;
  themeKeys: string[];
  personKeys?: string[];
  countryRole: EventCountryRole;
}

export const JAPAN_EVENTS: JapanEventSeedSpec[] = [
  {
    key: 'EVENT_JP_NARA_CAPITAL',
    vi: { title: 'Dời đô về Heijō-kyō (Nara), năm 710', summary: 'Nhật Bản dời kinh đô về Heijō-kyō, mở đầu thời kỳ Nara.' },
    en: { title: 'Capital Moved to Heijō-kyō / Nara (710)', summary: "Japan's capital moved to Heijō-kyō, beginning the Nara period." },
    date: yearOnly(710),
    importance: 6,
    eraKey: 'ERA_JP_NARA',
    themeKeys: ['political', 'heritage'],
    countryRole: EventCountryRole.OCCURRED_IN,
  },
  {
    key: 'EVENT_JP_HEIAN_CAPITAL',
    vi: { title: 'Dời đô về Heian-kyō (Kyoto), năm 794', summary: 'Nhật Bản dời kinh đô về Heian-kyō, mở đầu thời kỳ Heian.' },
    en: { title: 'Capital Moved to Heian-kyō / Kyoto (794)', summary: "Japan's capital moved to Heian-kyō, beginning the Heian period." },
    date: yearOnly(794),
    importance: 6,
    eraKey: 'ERA_JP_HEIAN',
    themeKeys: ['political', 'heritage'],
    countryRole: EventCountryRole.OCCURRED_IN,
  },
  {
    key: 'EVENT_JP_SEKIGAHARA_1600',
    vi: {
      title: 'Trận Sekigahara, năm 1600',
      summary: 'Tokugawa Ieyasu giành chiến thắng quyết định tại Sekigahara, mở đường cho việc thành lập Mạc phủ Tokugawa.',
    },
    en: { title: 'Battle of Sekigahara (1600)', summary: "Tokugawa Ieyasu's decisive victory at Sekigahara, paving the way for the Tokugawa shogunate." },
    date: exactDate(1600, 10, 21),
    importance: 7,
    themeKeys: ['military'],
    personKeys: ['PERSON_JP_TOKUGAWA_IEYASU'],
    countryRole: EventCountryRole.OCCURRED_IN,
  },
  {
    key: 'EVENT_JP_TOKUGAWA_SHOGUNATE_FOUNDED',
    vi: {
      title: 'Thành lập Mạc phủ Tokugawa, năm 1603',
      summary: 'Tokugawa Ieyasu được phong Chinh di Đại tướng quân, lập ra Mạc phủ Tokugawa (thời kỳ Edo).',
    },
    en: { title: 'Tokugawa Shogunate Founded (1603)', summary: 'Tokugawa Ieyasu founded the Tokugawa (Edo) shogunate.' },
    date: yearOnly(1603),
    importance: 8,
    eraKey: 'ERA_JP_EDO',
    themeKeys: ['political'],
    personKeys: ['PERSON_JP_TOKUGAWA_IEYASU'],
    countryRole: EventCountryRole.OCCURRED_IN,
  },
  {
    key: 'EVENT_JP_MEIJI_RESTORATION_1868',
    vi: {
      title: 'Minh Trị Duy Tân, năm 1868',
      summary: 'Chấm dứt Mạc phủ Tokugawa, khôi phục quyền lực cho Thiên hoàng, mở đầu thời kỳ Minh Trị.',
    },
    en: { title: 'Meiji Restoration (1868)', summary: 'End of the Tokugawa shogunate and restoration of imperial rule under Emperor Meiji.' },
    date: exactDate(1868, 1, 3),
    importance: 9,
    themeKeys: ['political'],
    personKeys: ['PERSON_JP_EMPEROR_MEIJI'],
    countryRole: EventCountryRole.OCCURRED_IN,
  },
];

// -----------------------------------------------------------------------
// People (reuses the exact Vietnam `PersonSeedSpec` shape).
// -----------------------------------------------------------------------
export const JAPAN_PEOPLE: PersonSeedSpec[] = [
  {
    key: 'PERSON_JP_TOKUGAWA_IEYASU',
    vi: { name: 'Tokugawa Ieyasu', summary: 'Người sáng lập và Chinh di Đại tướng quân đầu tiên của Mạc phủ Tokugawa.' },
    en: { name: 'Tokugawa Ieyasu', summary: 'Founder and first shogun of the Tokugawa shogunate.' },
    birth: exactDate(1543, 1, 31),
    death: exactDate(1616, 6, 1),
  },
  {
    key: 'PERSON_JP_EMPEROR_MEIJI',
    vi: { name: 'Thiên hoàng Minh Trị (Mutsuhito)', summary: 'Thiên hoàng thứ 122 của Nhật Bản, trị vì trong thời kỳ Minh Trị Duy Tân.' },
    en: { name: 'Emperor Meiji (Mutsuhito)', summary: '122nd Emperor of Japan, who reigned during the Meiji Restoration era.' },
    birth: exactDate(1852, 11, 3),
    death: exactDate(1912, 7, 30),
  },
];

// -----------------------------------------------------------------------
// Sources - two genuine Japanese-language (originalLanguage: "ja") official
// government sources included per the G03 requirement, alongside
// Encyclopaedia Britannica (SECONDARY) and one UNESCO record (PRIMARY).
// -----------------------------------------------------------------------
export const JAPAN_SOURCES: SourceSeedSpec[] = [
  {
    key: 'SRC_JP_BUNKACHO_NARA',
    sourceType: SourceType.GOVERNMENT_DOCUMENT,
    title: '古都奈良の文化財 (Cultural Properties of Ancient Nara)',
    organization: '文化庁 (Agency for Cultural Affairs, Japan)',
    url: 'https://online.bunka.go.jp/special_content/hlink7',
    originalLanguage: 'ja',
    credibilityLevel: SourceCredibility.PRIMARY,
    notes: 'States Nara was the capital of Japan from 710 to 784 ("710年から784年まで"), the founding year of the Nara period.',
  },
  {
    key: 'SRC_UNESCO_KYOTO',
    sourceType: SourceType.UNESCO_RECORD,
    title: 'Historic Monuments of Ancient Kyoto (Kyoto, Uji and Otsu Cities)',
    organization: 'UNESCO World Heritage Centre',
    publicationYear: 1994,
    url: 'https://whc.unesco.org/en/list/688/',
    originalLanguage: 'en',
    credibilityLevel: SourceCredibility.PRIMARY,
    notes: 'States Kyoto (Heian-kyō) was "built in A.D. 794", confirming the founding year of the Heian period.',
  },
  {
    key: 'SRC_BRITANNICA_SEKIGAHARA',
    sourceType: SourceType.WEBSITE,
    title: 'Battle of Sekigahara',
    organization: 'Encyclopaedia Britannica',
    url: 'https://www.britannica.com/event/Battle-of-Sekigahara',
    originalLanguage: 'en',
    credibilityLevel: SourceCredibility.SECONDARY,
  },
  {
    key: 'SRC_BRITANNICA_TOKUGAWA_PERIOD',
    sourceType: SourceType.WEBSITE,
    title: 'Tokugawa period',
    organization: 'Encyclopaedia Britannica',
    url: 'https://www.britannica.com/event/Tokugawa-period',
    originalLanguage: 'en',
    credibilityLevel: SourceCredibility.SECONDARY,
    notes: 'States the Tokugawa (Edo) period ran "1603 to 1867".',
  },
  {
    key: 'SRC_BRITANNICA_MEIJI_RESTORATION',
    sourceType: SourceType.WEBSITE,
    title: 'Meiji Restoration',
    organization: 'Encyclopaedia Britannica',
    url: 'https://www.britannica.com/event/Meiji-Restoration',
    originalLanguage: 'en',
    credibilityLevel: SourceCredibility.SECONDARY,
  },
  {
    key: 'SRC_BRITANNICA_HIROHITO',
    sourceType: SourceType.WEBSITE,
    title: 'Hirohito',
    organization: 'Encyclopaedia Britannica',
    url: 'https://www.britannica.com/biography/Hirohito',
    originalLanguage: 'en',
    credibilityLevel: SourceCredibility.SECONDARY,
    notes: "Confirms Japan's formal WWII surrender was signed aboard the USS Missouri on 2 September 1945.",
  },
  {
    key: 'SRC_BRITANNICA_TOKUGAWA_IEYASU',
    sourceType: SourceType.WEBSITE,
    title: 'Tokugawa Ieyasu',
    organization: 'Encyclopaedia Britannica',
    url: 'https://www.britannica.com/biography/Tokugawa-Ieyasu',
    originalLanguage: 'en',
    credibilityLevel: SourceCredibility.SECONDARY,
  },
  {
    key: 'SRC_BRITANNICA_MEIJI',
    sourceType: SourceType.WEBSITE,
    title: 'Meiji',
    organization: 'Encyclopaedia Britannica',
    url: 'https://www.britannica.com/biography/Meiji',
    originalLanguage: 'en',
    credibilityLevel: SourceCredibility.SECONDARY,
  },
  {
    key: 'SRC_JP_KUNAICHO_MEIJI',
    sourceType: SourceType.GOVERNMENT_DOCUMENT,
    title: '明治天皇 伏見桃山陵 (Emperor Meiji, Fushimi-Momoyama Mausoleum)',
    organization: '宮内庁 (Imperial Household Agency, Japan)',
    url: 'https://www.kunaicho.go.jp/visit/ryobo/122.html',
    originalLanguage: 'ja',
    credibilityLevel: SourceCredibility.PRIMARY,
    notes: 'Confirms Meiji as the 122nd Emperor of Japan and his parentage (Emperor Kōmei / Nakayama Yoshiko); corroborates identity, not the exact birth/death dates (Britannica used for those).',
  },
];

// -----------------------------------------------------------------------
// Facts (reuses the exact Vietnam `FactSeedSpec` shape - merged into the
// same GOLDEN_FACTS upsert loop in prisma/seed.ts, same publish gate: every
// citation below is VERIFIED).
// -----------------------------------------------------------------------
export const JAPAN_FACTS: FactSeedSpec[] = [
  {
    key: 'FACT_JP_NARA_CAPITAL_710',
    factType: FactType.ADMINISTRATIVE,
    date: yearOnly(710),
    certainty: FactCertainty.CONFIRMED,
    vi: 'Nhật Bản dời kinh đô về Heijō-kyō (Nara) năm 710, mở đầu thời kỳ Nara.',
    en: "Japan's capital moved to Heijō-kyō (Nara) in 710, beginning the Nara period.",
    eventKeys: ['EVENT_JP_NARA_CAPITAL'],
    eraKeys: ['ERA_JP_NARA'],
    citations: [verified('SRC_JP_BUNKACHO_NARA')],
    publish: true,
  },
  {
    key: 'FACT_JP_HEIAN_CAPITAL_794',
    factType: FactType.ADMINISTRATIVE,
    date: yearOnly(794),
    certainty: FactCertainty.CONFIRMED,
    vi: 'Nhật Bản dời kinh đô về Heian-kyō (Kyoto) năm 794, mở đầu thời kỳ Heian.',
    en: "Japan's capital moved to Heian-kyō (Kyoto) in 794, beginning the Heian period.",
    eventKeys: ['EVENT_JP_HEIAN_CAPITAL'],
    eraKeys: ['ERA_JP_HEIAN'],
    citations: [verified('SRC_UNESCO_KYOTO')],
    publish: true,
  },
  {
    key: 'FACT_JP_SEKIGAHARA_1600',
    factType: FactType.MILITARY,
    date: exactDate(1600, 10, 21),
    certainty: FactCertainty.HIGH_CONFIDENCE,
    vi: 'Tokugawa Ieyasu giành chiến thắng quyết định trong trận Sekigahara ngày 21/10/1600.',
    en: 'Tokugawa Ieyasu won a decisive victory at the Battle of Sekigahara on 21 October 1600.',
    eventKeys: ['EVENT_JP_SEKIGAHARA_1600'],
    personKeys: ['PERSON_JP_TOKUGAWA_IEYASU'],
    citations: [verified('SRC_BRITANNICA_SEKIGAHARA')],
    publish: true,
  },
  {
    key: 'FACT_JP_TOKUGAWA_SHOGUNATE_1603',
    factType: FactType.ADMINISTRATIVE,
    date: yearOnly(1603),
    certainty: FactCertainty.CONFIRMED,
    vi: 'Tokugawa Ieyasu lập ra Mạc phủ Tokugawa (thời kỳ Edo) năm 1603, kéo dài đến năm 1867.',
    en: 'Tokugawa Ieyasu founded the Tokugawa (Edo) shogunate in 1603, which lasted until 1867.',
    eventKeys: ['EVENT_JP_TOKUGAWA_SHOGUNATE_FOUNDED'],
    personKeys: ['PERSON_JP_TOKUGAWA_IEYASU'],
    eraKeys: ['ERA_JP_EDO'],
    citations: [verified('SRC_BRITANNICA_TOKUGAWA_PERIOD')],
    publish: true,
  },
  {
    key: 'FACT_JP_MEIJI_RESTORATION_1868',
    factType: FactType.ADMINISTRATIVE,
    date: exactDate(1868, 1, 3),
    certainty: FactCertainty.CONFIRMED,
    vi: 'Minh Trị Duy Tân năm 1868 chấm dứt Mạc phủ Tokugawa, khôi phục quyền lực cho Thiên hoàng Minh Trị.',
    en: 'The 1868 Meiji Restoration ended the Tokugawa shogunate and restored imperial rule under Emperor Meiji.',
    eventKeys: ['EVENT_JP_MEIJI_RESTORATION_1868'],
    personKeys: ['PERSON_JP_EMPEROR_MEIJI'],
    citations: [verified('SRC_BRITANNICA_MEIJI_RESTORATION')],
    publish: true,
  },
  {
    key: 'FACT_JP_WWII_SURRENDER_1945',
    factType: FactType.MILITARY,
    date: exactDate(1945, 9, 2),
    certainty: FactCertainty.CONFIRMED,
    vi: 'Nhật Bản ký văn kiện đầu hàng trên chiến hạm USS Missouri ngày 2/9/1945, chính thức kết thúc Thế chiến II.',
    en: 'Japan signed the instrument of surrender aboard the USS Missouri on 2 September 1945, formally ending World War II.',
    citations: [verified('SRC_BRITANNICA_HIROHITO')],
    publish: true,
  },
  {
    key: 'FACT_JP_TOKUGAWA_IEYASU_LIFE',
    factType: FactType.BIOGRAPHICAL,
    date: exactDate(1543, 1, 31),
    certainty: FactCertainty.CONFIRMED,
    vi: 'Tokugawa Ieyasu sinh ngày 31/1/1543 và mất ngày 1/6/1616, là người sáng lập Mạc phủ Tokugawa.',
    en: 'Tokugawa Ieyasu was born on 31 January 1543 and died on 1 June 1616; he founded the Tokugawa shogunate.',
    personKeys: ['PERSON_JP_TOKUGAWA_IEYASU'],
    citations: [verified('SRC_BRITANNICA_TOKUGAWA_IEYASU')],
    publish: true,
  },
  {
    key: 'FACT_JP_EMPEROR_MEIJI_IDENTITY',
    factType: FactType.BIOGRAPHICAL,
    date: exactDate(1852, 11, 3),
    certainty: FactCertainty.CONFIRMED,
    vi: 'Thiên hoàng Minh Trị (Mutsuhito), sinh ngày 3/11/1852, mất ngày 30/7/1912, là vị Thiên hoàng thứ 122 của Nhật Bản.',
    en: 'Emperor Meiji (Mutsuhito), born 3 November 1852 and died 30 July 1912, was the 122nd Emperor of Japan.',
    personKeys: ['PERSON_JP_EMPEROR_MEIJI'],
    citations: [verified('SRC_BRITANNICA_MEIJI'), verified('SRC_JP_KUNAICHO_MEIJI')],
    publish: true,
  },
];
