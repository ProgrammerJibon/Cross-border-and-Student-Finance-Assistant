export function formatDate(value: string, locale: string, timeZone = "UTC") {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(
    dateOnly
      ? value + "T12:00:00Z"
      : /[zZ]|[+-]\d{2}:\d{2}$/.test(value)
        ? value
        : value.replace(" ", "T") + "Z",
  );
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    ...(dateOnly ? {} : { timeStyle: "short" }),
    timeZone: dateOnly ? "UTC" : timeZone,
  }).format(date);
}
