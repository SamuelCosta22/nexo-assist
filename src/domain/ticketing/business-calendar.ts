/**
 * Business-time arithmetic for SLA deadlines.
 *
 * Business hours: Monday to Friday, 08:00-18:00 (Anexo B: horário do service
 * desk). Brazil has no daylight saving time since 2019, so a fixed UTC offset
 * is exact for America/Sao_Paulo and keeps the domain free of tz databases.
 * Holidays are intentionally ignored (see README, decision 16).
 */
export interface BusinessCalendarConfig {
  readonly utcOffsetMinutes: number;
  readonly openHour: number;
  readonly closeHour: number;
}

export const SAO_PAULO_CALENDAR: BusinessCalendarConfig = {
  utcOffsetMinutes: -180,
  openHour: 8,
  closeHour: 18,
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export class BusinessCalendar {
  constructor(private readonly config: BusinessCalendarConfig = SAO_PAULO_CALENDAR) {}

  /** A Date whose UTC getters read as the calendar's local wall clock. */
  private toLocal(date: Date): Date {
    return new Date(date.getTime() + this.config.utcOffsetMinutes * MINUTE);
  }

  private fromLocal(local: Date): Date {
    return new Date(local.getTime() - this.config.utcOffsetMinutes * MINUTE);
  }

  private isWeekend(local: Date): boolean {
    const day = local.getUTCDay();
    return day === 0 || day === 6;
  }

  private atHour(local: Date, hour: number): Date {
    const copy = new Date(local);
    copy.setUTCHours(hour, 0, 0, 0);
    return copy;
  }

  private nextBusinessOpening(local: Date): Date {
    const next = this.atHour(local, this.config.openHour);
    do {
      next.setUTCDate(next.getUTCDate() + 1);
    } while (this.isWeekend(next));
    return next;
  }

  /** Moves a local instant forward to the nearest instant inside business hours. */
  private normalizeLocal(local: Date): Date {
    if (this.isWeekend(local)) {
      const monday = this.atHour(local, this.config.openHour);
      while (this.isWeekend(monday)) monday.setUTCDate(monday.getUTCDate() + 1);
      return monday;
    }
    const open = this.atHour(local, this.config.openHour);
    const close = this.atHour(local, this.config.closeHour);
    if (local < open) return open;
    if (local >= close) return this.nextBusinessOpening(local);
    return local;
  }

  isWithinBusinessHours(date: Date): boolean {
    const local = this.toLocal(date);
    return this.normalizeLocal(local).getTime() === local.getTime();
  }

  /** Adds `hours` of working time (e.g. 4 "horas úteis"). */
  addBusinessHours(from: Date, hours: number): Date {
    let cursor = this.normalizeLocal(this.toLocal(from));
    let remaining = hours * HOUR;
    for (;;) {
      const close = this.atHour(cursor, this.config.closeHour);
      const available = close.getTime() - cursor.getTime();
      if (remaining <= available) {
        return this.fromLocal(new Date(cursor.getTime() + remaining));
      }
      remaining -= available;
      cursor = this.nextBusinessOpening(cursor);
    }
  }

  /** Adds whole working days (e.g. 3 "dias úteis"), keeping the time of day. */
  addBusinessDays(from: Date, days: number): Date {
    const cursor = this.normalizeLocal(this.toLocal(from));
    let remaining = days;
    while (remaining > 0) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      if (!this.isWeekend(cursor)) remaining -= 1;
    }
    return this.fromLocal(cursor);
  }
}
