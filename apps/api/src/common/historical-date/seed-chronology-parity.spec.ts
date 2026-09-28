import { DateQualifier } from '@prisma/client';
// Cross-package relative import by design (same convention as golden-dataset.spec.ts): this
// asserts against the SAME Golden-Dataset specs prisma/seed.ts writes, not a copy.
import {
  CHRONOLOGY_FAR_FUTURE,
  CHRONOLOGY_FAR_PAST,
  chronologyForDate,
  chronologyForPeriod,
  GOLDEN_DYNASTIES,
  GOLDEN_ERAS,
  GOLDEN_EVENTS,
  GOLDEN_FACTS,
  GOLDEN_PEOPLE,
  HistoricalDateSeed,
  JAPAN_ERAS,
  JAPAN_EVENTS,
  JAPAN_FACTS,
  JAPAN_PEOPLE,
} from '../../../../../prisma/golden';
import { buildHistoricalDateColumns, buildHistoricalPeriodColumns, ORDINAL_FAR_FUTURE, ORDINAL_FAR_PAST } from './historical-date.util';

/**
 * G12 chronology remediation: the seed now writes the G03 authoritative chronology ordinals it
 * previously omitted. Its CE-only helper (prisma/golden/helpers.ts) must compute exactly what the
 * application's own validated utility computes for every Golden-Dataset row - otherwise a freshly
 * seeded database and an API-created entity with the same cited date would sort/filter
 * differently.
 */
describe('Golden-Dataset seed chronology == historical-date.util (G12)', () => {
  const asInput = (d: HistoricalDateSeed, rangeEndYear?: number) => ({
    year: d.year,
    month: d.month,
    day: d.day,
    precision: d.precision,
    qualifier: rangeEndYear != null ? DateQualifier.BETWEEN : d.qualifier ?? DateQualifier.EXACT,
    rangeEndYear,
  });

  it('sentinel constants equal the util constants', () => {
    expect(CHRONOLOGY_FAR_PAST).toBe(ORDINAL_FAR_PAST);
    expect(CHRONOLOGY_FAR_FUTURE).toBe(ORDINAL_FAR_FUTURE);
  });

  it.each([...GOLDEN_ERAS, ...JAPAN_ERAS, ...GOLDEN_DYNASTIES].map((s) => [s.key, s] as const))('period %s', (_key, spec) => {
    const util = buildHistoricalPeriodColumns(asInput(spec.start), spec.end ? asInput(spec.end) : null);
    expect(chronologyForPeriod(spec.start, spec.end)).toEqual({ start: util.chronologyStart, end: util.chronologyEnd });
  });

  it.each(GOLDEN_EVENTS.map((s) => [s.key, s] as const))('Vietnam event %s', (_key, spec) => {
    const util = buildHistoricalDateColumns(asInput(spec.date, spec.rangeEndYear));
    expect(chronologyForDate(spec.date, spec.rangeEndYear)).toEqual({ start: util.chronologyStart, end: util.chronologyEnd });
  });

  it.each([...JAPAN_EVENTS, ...GOLDEN_FACTS, ...JAPAN_FACTS].map((s) => [s.key, s] as const))('event/fact %s', (_key, spec) => {
    const util = buildHistoricalDateColumns(asInput(spec.date));
    expect(chronologyForDate(spec.date)).toEqual({ start: util.chronologyStart, end: util.chronologyEnd });
  });

  it.each([...GOLDEN_PEOPLE, ...JAPAN_PEOPLE].map((s) => [s.key, s] as const))('person %s birth/death', (_key, spec) => {
    for (const d of [spec.birth, spec.death]) {
      if (!d) continue;
      const util = buildHistoricalDateColumns(asInput(d));
      expect(chronologyForDate(d)).toEqual({ start: util.chronologyStart, end: util.chronologyEnd });
    }
  });

  it('an UNKNOWN date stays unknown (never "active in every period")', () => {
    expect(chronologyForDate({ precision: 'UNKNOWN', qualifier: 'UNCERTAIN' })).toEqual({ start: null, end: null });
  });

  it('an ongoing period (no end) is open-ended, an explicitly UNKNOWN end is not', () => {
    const start: HistoricalDateSeed = { year: 1945, precision: 'YEAR' };
    expect(chronologyForPeriod(start).end).toBe(CHRONOLOGY_FAR_FUTURE);
    expect(chronologyForPeriod(start, { precision: 'UNKNOWN' }).end).toBeNull();
  });

  it('refuses to derive a CE ordinal for a non-CE year', () => {
    expect(() => chronologyForDate({ year: 0, precision: 'YEAR' })).toThrow(/CE-only/);
  });
});
