import { addDays, isWeekend, isBefore, startOfDay } from 'date-fns';

/**
 * Add business days to a date (skips weekends)
 * This is critical for the 3B7 routine
 */
export function addBusinessDays(date: Date, days: number): Date {
  let result = new Date(date);
  let addedDays = 0;

  while (addedDays < days) {
    result = addDays(result, 1);
    if (!isWeekend(result)) {
      addedDays++;
    }
  }

  return result;
}

/**
 * Get the effective start date for 3B/7B counting.
 * If sent at noon or later (in the given timezone), counting starts
 * from the next business day since half the day is already over.
 */
function getEffectiveStartDate(sentDate: Date, timezone: string = 'America/New_York'): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    hour12: false,
    timeZone: timezone,
  }).formatToParts(sentDate);

  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? '0', 10);
  const hour = get('hour');
  // Build a UTC midnight Date for the local calendar date
  const localDate = new Date(Date.UTC(get('year'), get('month') - 1, get('day')));

  // If sent on a weekend or at/after noon, start counting from next business day
  if (isWeekend(localDate) || hour >= 12) {
    let next = addDays(localDate, 1);
    while (isWeekend(next)) {
      next = addDays(next, 1);
    }
    return next;
  }
  return localDate;
}

/**
 * Calculate the 3B (3 business days) date from sent date
 */
export function calculate3BDate(sentDate: Date, timezone: string = 'America/New_York'): Date {
  return addBusinessDays(getEffectiveStartDate(sentDate, timezone), 3);
}

/**
 * Calculate the 7B (7 business days) date from sent date
 */
export function calculate7BDate(sentDate: Date, timezone: string = 'America/New_York'): Date {
  return addBusinessDays(getEffectiveStartDate(sentDate, timezone), 7);
}

/**
 * Check if a date is past 3B
 */
export function isPast3B(sentDate: Date): boolean {
  const threeBDate = calculate3BDate(sentDate);
  return isBefore(startOfDay(threeBDate), startOfDay(new Date()));
}

/**
 * Check if a date is past 7B
 */
export function isPast7B(sentDate: Date): boolean {
  const sevenBDate = calculate7BDate(sentDate);
  return isBefore(startOfDay(sevenBDate), startOfDay(new Date()));
}

/**
 * Check if today is the 3B date
 */
export function isToday3B(sentDate: Date): boolean {
  const threeBDate = calculate3BDate(sentDate);
  const today = startOfDay(new Date());
  return startOfDay(threeBDate).getTime() === today.getTime();
}

/**
 * Check if today is the 7B date
 */
export function isToday7B(sentDate: Date): boolean {
  const sevenBDate = calculate7BDate(sentDate);
  const today = startOfDay(new Date());
  return startOfDay(sevenBDate).getTime() === today.getTime();
}

/**
 * Get the count of business days between two dates
 */
export function getBusinessDaysBetween(startDate: Date, endDate: Date): number {
  let count = 0;
  let current = new Date(startDate);

  while (isBefore(current, endDate)) {
    current = addDays(current, 1);
    if (!isWeekend(current)) {
      count++;
    }
  }

  return count;
}

/**
 * Determine if response was within 3B (indicating Booster)
 */
export function wasResponseWithin3B(sentDate: Date, responseDate: Date): boolean {
  const businessDays = getBusinessDaysBetween(sentDate, responseDate);
  return businessDays <= 3;
}
