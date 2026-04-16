/**
 * Billing cycle calculation.
 * Pure functions for computing billing periods, proration, and due dates.
 */

import { match } from 'ts-pattern';

export type BillingInterval = 'monthly' | 'quarterly' | 'yearly';

export type BillingPeriod = {
  start: Date;
  end: Date;
  interval: BillingInterval;
};

export type ProratedAmount = {
  amount: number;
  daysUsed: number;
  totalDays: number;
  ratio: number;
};

/**
 * Get the number of days in a given month (1-indexed).
 */
export function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) {
    throw new RangeError(`Month must be between 1 and 12, got ${month}`);
  }
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new TypeError('Year and month must be integers');
  }
  return new Date(year, month, 0).getDate();
}

/**
 * Calculate the next billing date from a given anchor date and interval.
 */
export function nextBillingDate(anchor: Date, interval: BillingInterval): Date {
  const result = new Date(anchor);

  match(interval)
    .with('monthly', () => { result.setMonth(result.getMonth() + 1); })
    .with('quarterly', () => { result.setMonth(result.getMonth() + 3); })
    .with('yearly', () => { result.setFullYear(result.getFullYear() + 1); })
    .otherwise(() => { throw new Error(`Unknown billing interval: "${interval}"`); });

  return result;
}

/**
 * Compute the billing period that contains the given date.
 */
export function currentBillingPeriod(anchor: Date, asOf: Date, interval: BillingInterval): BillingPeriod {
  let periodStart = new Date(anchor);

  if (asOf < anchor) {
    throw new RangeError('asOf date must not be before the anchor date');
  }

  while (true) {
    const periodEnd = nextBillingDate(periodStart, interval);
    if (asOf < periodEnd) {
      return {
        start: periodStart,
        end: periodEnd,
        interval,
      };
    }
    periodStart = periodEnd;
  }
}

/**
 * Calculate a prorated amount based on days used within a billing period.
 */
export function prorateAmount(fullAmount: number, periodStart: Date, periodEnd: Date, usageStart: Date): ProratedAmount {
  if (fullAmount < 0) {
    throw new RangeError('Full amount must not be negative');
  }

  if (periodEnd <= periodStart) {
    throw new RangeError('Period end must be after period start');
  }

  if (usageStart < periodStart) {
    throw new RangeError('Usage start must not be before period start');
  }

  if (usageStart >= periodEnd) {
    return { amount: 0, daysUsed: 0, totalDays: diffDays(periodStart, periodEnd), ratio: 0 };
  }

  const totalDays = diffDays(periodStart, periodEnd);
  const daysUsed = diffDays(usageStart, periodEnd);
  const ratio = totalDays === 0 ? 0 : daysUsed / totalDays;
  const amount = Math.round(fullAmount * ratio * 100) / 100;

  return { amount, daysUsed, totalDays, ratio };
}

/**
 * Calculate the difference in days between two dates (ignoring time).
 */
export function diffDays(from: Date, to: Date): number {
  const msPerDay = 86_400_000;
  const fromUTC = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toUTC = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toUTC - fromUTC) / msPerDay);
}
