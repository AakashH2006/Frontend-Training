/* Day 25 - formatting, typed.

   Day 20's format.js, which needed the least changing of any file in the app -
   pure functions of their input were already the easiest thing to type.

   The one real change is `formatDate`: Day 20 took an ISO string and returned
   "unknown date" for anything unparseable. That is still what it does, but the
   signature now says the input may be absent, because `finishedAt` is optional
   and the caller was checking for that separately. */

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

const dateFormat = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
});


export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
    return `${count} ${count === 1 ? singular : pluralForm}`;
}


export function authorLine(authors: readonly string[]): string {
    /* Day 20 began `if (!authors || authors.length === 0)`. The `!authors`
       half is gone, because `authors` is `readonly string[]` and cannot be
       undefined - model.ts guarantees it with `?? []`. One decision made at
       the boundary removes a check here and in two other places. */
    if (authors.length === 0) return "Author unknown";

    const [first, second] = authors;
    if (authors.length === 1) return first ?? "Author unknown";
    if (authors.length === 2) return `${first} and ${second}`;
    return `${first} and ${plural(authors.length - 1, "other")}`;
}


export function formatDate(isoString: string | undefined): string {
    if (isoString === undefined) return "unknown date";

    const date = new Date(isoString);
    // An invalid Date does not throw. It has to be tested for, and NaN is not
    // equal to itself, so this is the only check that works.
    if (Number.isNaN(date.getTime())) return "unknown date";

    return dateFormat.format(date);
}


const UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60]
];

/* `Intl.RelativeTimeFormatUnit` is a union of the strings Intl accepts, and
   annotating the table with it is what caught a typo here: I had written
   "weeks" in the plural, which Intl accepts at runtime and which the type
   rejects. Day 20's version had the same table with no type, and it worked by
   luck. */
export function timeAgo(isoString: string): string {
    const then = new Date(isoString).getTime();
    if (Number.isNaN(then)) return "";

    const seconds = Math.round((then - Date.now()) / 1000);

    for (const [unit, secondsPerUnit] of UNITS) {
        if (Math.abs(seconds) >= secondsPerUnit) {
            return relative.format(Math.round(seconds / secondsPerUnit), unit);
        }
    }

    return relative.format(seconds, "second");
}


export function percent(part: number, whole: number): string {
    if (whole === 0) return "0%";
    return `${Math.round((part / whole) * 100)}%`;
}
