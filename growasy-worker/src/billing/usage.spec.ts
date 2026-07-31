import { describe, expect, it } from 'vitest';
import { billingPeriodKey, currentPeriod } from './usage';

describe('billingPeriodKey', () => {
  it('falls back to the calendar month when there is no anchor', () => {
    const now = new Date(Date.UTC(2026, 6, 20)); // 2026-07-20
    expect(billingPeriodKey(null, now)).toBe('2026-07');
    expect(billingPeriodKey(undefined, now)).toBe(currentPeriod(now));
  });

  it('uses the current window when now is on/after the anchor day', () => {
    const anchor = new Date(Date.UTC(2026, 0, 15)); // subscribed Jan 15
    const now = new Date(Date.UTC(2026, 6, 20)); // Jul 20
    expect(billingPeriodKey(anchor, now)).toBe('2026-07-15');
  });

  it('rolls back to the previous window when now is before the anchor day', () => {
    const anchor = new Date(Date.UTC(2026, 0, 15)); // anchor day 15
    const now = new Date(Date.UTC(2026, 6, 10)); // Jul 10 (before the 15th)
    expect(billingPeriodKey(anchor, now)).toBe('2026-06-15');
  });

  it('clamps a high anchor day to short months', () => {
    const anchor = new Date(Date.UTC(2026, 0, 31)); // anchor day 31
    const now = new Date(Date.UTC(2026, 1, 15)); // Feb 15 (Feb has 28 days)
    // window started on the clamped last day of the prior month window
    expect(billingPeriodKey(anchor, now)).toBe('2026-01-31');
  });

  it('gives a stable key within the same window and a new key after it rolls', () => {
    const anchor = new Date(Date.UTC(2026, 0, 5));
    expect(billingPeriodKey(anchor, new Date(Date.UTC(2026, 2, 5)))).toBe('2026-03-05');
    expect(billingPeriodKey(anchor, new Date(Date.UTC(2026, 2, 28)))).toBe('2026-03-05');
    expect(billingPeriodKey(anchor, new Date(Date.UTC(2026, 3, 5)))).toBe('2026-04-05');
  });
});
