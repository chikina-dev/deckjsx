function integerInRange(value: string, min: number, max: number): boolean {
  const integer = Number(value);
  return Number.isInteger(integer) && integer >= min && integer <= max;
}

function yearIsLeap(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return yearIsLeap(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

function dateTimePartsAreValid(
  yearValue: string,
  monthValue: string,
  dayValue: string,
  hourValue: string,
  minuteValue: string,
  secondValue: string,
): boolean {
  if (
    !integerInRange(yearValue, 0, 9999) ||
    !integerInRange(monthValue, 1, 12) ||
    !integerInRange(hourValue, 0, 23) ||
    !integerInRange(minuteValue, 0, 59) ||
    !integerInRange(secondValue, 0, 59)
  ) {
    return false;
  }

  const year = Number(yearValue);
  const month = Number(monthValue);
  return integerInRange(dayValue, 1, daysInMonth(year, month));
}

function offsetPartsAreValid(
  offsetHour: string | undefined,
  offsetMinute: string | undefined,
): boolean {
  return (
    (offsetHour === undefined && offsetMinute === undefined) ||
    (offsetHour !== undefined &&
      offsetMinute !== undefined &&
      integerInRange(offsetHour, 0, 23) &&
      integerInRange(offsetMinute, 0, 59))
  );
}

export function normalizedPdfDateValue(value: string): string | undefined {
  const pdfDate = /^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:Z|[+-](\d{2})'(\d{2})')?$/u.exec(
    value,
  );
  if (pdfDate) {
    const [, year, month, day, hour, minute, second, offsetHour, offsetMinute] = pdfDate;
    return dateTimePartsAreValid(year, month, day, hour, minute, second) &&
      offsetPartsAreValid(offsetHour, offsetMinute)
      ? value
      : undefined;
  }

  const isoDate =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):?(\d{2}))$/u.exec(
      value,
    );
  if (!isoDate) {
    return undefined;
  }

  const [, year, month, day, hour, minute, second, zone, sign, offsetHour, offsetMinute] = isoDate;
  if (
    !dateTimePartsAreValid(year, month, day, hour, minute, second) ||
    !offsetPartsAreValid(offsetHour, offsetMinute)
  ) {
    return undefined;
  }

  if (zone === "Z") {
    return `D:${year}${month}${day}${hour}${minute}${second}Z`;
  }
  return `D:${year}${month}${day}${hour}${minute}${second}${sign}${offsetHour}'${offsetMinute}'`;
}

export function pdfMetadataDateStringIsValid(value: unknown): value is string {
  return typeof value === "string" && normalizedPdfDateValue(value) !== undefined;
}
