import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { IsCalendarDate, isCalendarDate } from './is-calendar-date';

describe('IsCalendarDate (G12)', () => {
  it.each(['2026-12-01', '2024-02-29', '2000-02-29', '0001-01-01', '9999-12-31', '2026-03-08'])('accepts %s', (v) => expect(isCalendarDate(v)).toBe(true));
  it.each(['2026-02-30', '2025-02-29', '1900-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '2026-12-00', '26-12-01', '2026-1-01', '2026-12-01T00:00:00Z', '', 'yesterday', 20261201, null])(
    'rejects %p',
    (v) => expect(isCalendarDate(v)).toBe(false),
  );

  it('works as a class-validator decorator with a custom message', () => {
    class Dto {
      @IsCalendarDate({ message: 'startDate must be YYYY-MM-DD' })
      startDate!: string;
    }
    expect(validateSync(plainToInstance(Dto, { startDate: '2026-12-01' }))).toHaveLength(0);
    const errors = validateSync(plainToInstance(Dto, { startDate: '2026-02-30' }));
    expect(errors[0].constraints).toEqual({ isCalendarDate: 'startDate must be YYYY-MM-DD' });
  });
});
