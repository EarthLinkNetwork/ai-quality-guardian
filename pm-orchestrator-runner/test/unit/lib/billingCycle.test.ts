import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import {
  daysInMonth,
  nextBillingDate,
  currentBillingPeriod,
  prorateAmount,
  diffDays,
} from '../../../src/lib/billingCycle';

function date(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d);
}

describe('billingCycle', () => {
  describe('daysInMonth', () => {
    it('returns 31 for January', () => {
      assert.equal(daysInMonth(2025, 1), 31);
    });

    it('returns 28 for February in a non-leap year', () => {
      assert.equal(daysInMonth(2025, 2), 28);
    });

    it('returns 29 for February in a leap year', () => {
      assert.equal(daysInMonth(2024, 2), 29);
    });

    it('returns 30 for April', () => {
      assert.equal(daysInMonth(2025, 4), 30);
    });

    it('returns 31 for December', () => {
      assert.equal(daysInMonth(2025, 12), 31);
    });

    describe('boundary: month range', () => {
      it('throws for month 0', () => {
        assert.throws(() => daysInMonth(2025, 0), RangeError);
      });

      it('throws for month 13', () => {
        assert.throws(() => daysInMonth(2025, 13), RangeError);
      });

      it('accepts month 1 (lower boundary)', () => {
        assert.equal(daysInMonth(2025, 1), 31);
      });

      it('accepts month 12 (upper boundary)', () => {
        assert.equal(daysInMonth(2025, 12), 31);
      });

      it('throws for non-integer month', () => {
        assert.throws(() => daysInMonth(2025, 1.5), TypeError);
      });

      it('throws for non-integer year', () => {
        assert.throws(() => daysInMonth(2025.5, 1), TypeError);
      });
    });

    describe('leap year rules', () => {
      it('2000 is a leap year (divisible by 400)', () => {
        assert.equal(daysInMonth(2000, 2), 29);
      });

      it('1900 is not a leap year (divisible by 100 but not 400)', () => {
        assert.equal(daysInMonth(1900, 2), 28);
      });

      it('2100 is not a leap year', () => {
        assert.equal(daysInMonth(2100, 2), 28);
      });
    });
  });

  describe('nextBillingDate', () => {
    it('adds 1 month for monthly interval', () => {
      const anchor = date(2025, 1, 15);
      const next = nextBillingDate(anchor, 'monthly');
      assert.equal(next.getFullYear(), 2025);
      assert.equal(next.getMonth(), 1); // Feb (0-indexed)
      assert.equal(next.getDate(), 15);
    });

    it('adds 3 months for quarterly interval', () => {
      const anchor = date(2025, 1, 1);
      const next = nextBillingDate(anchor, 'quarterly');
      assert.equal(next.getMonth(), 3); // April
      assert.equal(next.getDate(), 1);
    });

    it('adds 1 year for yearly interval', () => {
      const anchor = date(2025, 6, 15);
      const next = nextBillingDate(anchor, 'yearly');
      assert.equal(next.getFullYear(), 2026);
      assert.equal(next.getMonth(), 5); // June
      assert.equal(next.getDate(), 15);
    });

    describe('boundary: month-end overflow', () => {
      it('Jan 31 + 1 month wraps to Mar 3 (Feb has 28 days in 2025)', () => {
        const anchor = date(2025, 1, 31);
        const next = nextBillingDate(anchor, 'monthly');
        // JS Date rolls over: Feb 31 -> Mar 3
        assert.equal(next.getMonth(), 2); // March
        assert.equal(next.getDate(), 3);
      });

      it('Jan 31 + 1 month in leap year wraps to Mar 2', () => {
        const anchor = date(2024, 1, 31);
        const next = nextBillingDate(anchor, 'monthly');
        assert.equal(next.getMonth(), 2); // March
        assert.equal(next.getDate(), 2);
      });
    });

    describe('boundary: year rollover', () => {
      it('Dec 15 monthly -> Jan 15 next year', () => {
        const anchor = date(2025, 12, 15);
        const next = nextBillingDate(anchor, 'monthly');
        assert.equal(next.getFullYear(), 2026);
        assert.equal(next.getMonth(), 0); // January
        assert.equal(next.getDate(), 15);
      });

      it('Nov 1 quarterly -> Feb 1 next year', () => {
        const anchor = date(2025, 11, 1);
        const next = nextBillingDate(anchor, 'quarterly');
        assert.equal(next.getFullYear(), 2026);
        assert.equal(next.getMonth(), 1); // February
      });
    });

    it('throws for unknown interval', () => {
      assert.throws(
        () => nextBillingDate(date(2025, 1, 1), 'weekly' as any),
        /Unknown billing interval/,
      );
    });

    it('does not mutate the original anchor date', () => {
      const anchor = date(2025, 3, 10);
      const originalTime = anchor.getTime();
      nextBillingDate(anchor, 'monthly');
      assert.equal(anchor.getTime(), originalTime);
    });
  });

  describe('currentBillingPeriod', () => {
    it('returns the period containing asOf for monthly', () => {
      const anchor = date(2025, 1, 1);
      const asOf = date(2025, 3, 15);
      const period = currentBillingPeriod(anchor, asOf, 'monthly');
      assert.deepEqual(period.start, date(2025, 3, 1));
      assert.deepEqual(period.end, date(2025, 4, 1));
      assert.equal(period.interval, 'monthly');
    });

    it('returns the first period when asOf equals anchor', () => {
      const anchor = date(2025, 1, 1);
      const period = currentBillingPeriod(anchor, anchor, 'monthly');
      assert.deepEqual(period.start, date(2025, 1, 1));
      assert.deepEqual(period.end, date(2025, 2, 1));
    });

    it('returns quarterly period correctly', () => {
      const anchor = date(2025, 1, 1);
      const asOf = date(2025, 5, 1);
      const period = currentBillingPeriod(anchor, asOf, 'quarterly');
      assert.deepEqual(period.start, date(2025, 4, 1));
      assert.deepEqual(period.end, date(2025, 7, 1));
    });

    it('returns yearly period correctly', () => {
      const anchor = date(2025, 1, 1);
      const asOf = date(2026, 6, 15);
      const period = currentBillingPeriod(anchor, asOf, 'yearly');
      assert.deepEqual(period.start, date(2026, 1, 1));
      assert.deepEqual(period.end, date(2027, 1, 1));
    });

    describe('boundary: asOf before anchor', () => {
      it('throws when asOf is before anchor', () => {
        const anchor = date(2025, 6, 1);
        const asOf = date(2025, 1, 1);
        assert.throws(() => currentBillingPeriod(anchor, asOf, 'monthly'), RangeError);
      });
    });
  });

  describe('prorateAmount', () => {
    it('calculates full-period proration (usage from start)', () => {
      const start = date(2025, 1, 1);
      const end = date(2025, 2, 1); // 31 days
      const result = prorateAmount(100, start, end, start);
      assert.equal(result.daysUsed, 31);
      assert.equal(result.totalDays, 31);
      assert.equal(result.ratio, 1);
      assert.equal(result.amount, 100);
    });

    it('calculates half-period proration', () => {
      const start = date(2025, 1, 1);
      const end = date(2025, 1, 31); // 30 days
      const usageStart = date(2025, 1, 16); // 15 days used
      const result = prorateAmount(100, start, end, usageStart);
      assert.equal(result.daysUsed, 15);
      assert.equal(result.totalDays, 30);
      assert.equal(result.ratio, 0.5);
      assert.equal(result.amount, 50);
    });

    it('returns 0 when usage starts at period end', () => {
      const start = date(2025, 1, 1);
      const end = date(2025, 2, 1);
      const result = prorateAmount(100, start, end, end);
      assert.equal(result.amount, 0);
      assert.equal(result.daysUsed, 0);
      assert.equal(result.ratio, 0);
    });

    it('returns 0 when usage starts after period end', () => {
      const start = date(2025, 1, 1);
      const end = date(2025, 2, 1);
      const usageStart = date(2025, 3, 1);
      const result = prorateAmount(100, start, end, usageStart);
      assert.equal(result.amount, 0);
    });

    it('rounds to 2 decimal places', () => {
      const start = date(2025, 1, 1);
      const end = date(2025, 1, 4); // 3 days
      const usageStart = date(2025, 1, 2); // 2 days used
      const result = prorateAmount(100, start, end, usageStart);
      assert.equal(result.amount, 66.67); // 100 * 2/3 = 66.666... -> 66.67
    });

    describe('boundary: invalid inputs', () => {
      it('throws for negative amount', () => {
        assert.throws(
          () => prorateAmount(-10, date(2025, 1, 1), date(2025, 2, 1), date(2025, 1, 1)),
          RangeError,
        );
      });

      it('throws when period end is before period start', () => {
        assert.throws(
          () => prorateAmount(100, date(2025, 2, 1), date(2025, 1, 1), date(2025, 1, 15)),
          RangeError,
        );
      });

      it('throws when period end equals period start', () => {
        const d = date(2025, 1, 1);
        assert.throws(() => prorateAmount(100, d, d, d), RangeError);
      });

      it('throws when usage start is before period start', () => {
        assert.throws(
          () => prorateAmount(100, date(2025, 2, 1), date(2025, 3, 1), date(2025, 1, 1)),
          RangeError,
        );
      });
    });

    describe('boundary: zero amount', () => {
      it('returns 0 amount when full amount is 0', () => {
        const start = date(2025, 1, 1);
        const end = date(2025, 2, 1);
        const result = prorateAmount(0, start, end, start);
        assert.equal(result.amount, 0);
        assert.equal(result.ratio, 1);
      });
    });
  });

  describe('diffDays', () => {
    it('returns 0 for same date', () => {
      assert.equal(diffDays(date(2025, 1, 1), date(2025, 1, 1)), 0);
    });

    it('returns 1 for consecutive days', () => {
      assert.equal(diffDays(date(2025, 1, 1), date(2025, 1, 2)), 1);
    });

    it('returns 31 for January', () => {
      assert.equal(diffDays(date(2025, 1, 1), date(2025, 2, 1)), 31);
    });

    it('returns 365 for a non-leap year', () => {
      assert.equal(diffDays(date(2025, 1, 1), date(2026, 1, 1)), 365);
    });

    it('returns 366 for a leap year', () => {
      assert.equal(diffDays(date(2024, 1, 1), date(2025, 1, 1)), 366);
    });

    it('returns negative for reversed dates', () => {
      assert.equal(diffDays(date(2025, 1, 10), date(2025, 1, 1)), -9);
    });

    describe('boundary: month transitions', () => {
      it('Feb 28 -> Mar 1 in non-leap year is 1 day', () => {
        assert.equal(diffDays(date(2025, 2, 28), date(2025, 3, 1)), 1);
      });

      it('Feb 28 -> Mar 1 in leap year is 2 days', () => {
        assert.equal(diffDays(date(2024, 2, 28), date(2024, 3, 1)), 2);
      });

      it('Feb 29 -> Mar 1 in leap year is 1 day', () => {
        assert.equal(diffDays(date(2024, 2, 29), date(2024, 3, 1)), 1);
      });
    });
  });
});
