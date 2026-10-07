/* Day 20 - formatting.

   Pulled out of render.js because these are pure functions of their input:
   same argument in, same string out, nothing touched on the way. That makes
   them the only part of the app that is trivially testable, and it keeps
   render.js about structure rather than wording.

   Intl does the locale work. Hand-rolling "3 days ago" and month names is how
   you end up with an app that only reads correctly in one language. */

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

const dateFormat = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
});


export function plural(count, singular, pluralForm = `${singular}s`) {
    return `${count} ${count === 1 ? singular : pluralForm}`;
}


export function authorLine(authors) {
    if (!authors || authors.length === 0) return "Author unknown";
    if (authors.length === 1) return authors[0];
    if (authors.length === 2) return `${authors[0]} and ${authors[1]}`;
    return `${authors[0]} and ${plural(authors.length - 1, "other")}`;
}


export function formatDate(isoString) {
    const date = new Date(isoString);
    // An invalid Date is not an error and does not throw. It has to be tested
    // for, and NaN is not equal to itself, so isNaN is the only check.
    if (Number.isNaN(date.getTime())) return "unknown date";
    return dateFormat.format(date);
}


/* "yesterday", "3 days ago", "last month". The unit is chosen by size so the
   number stays small and readable. */
export function timeAgo(isoString) {
    const then = new Date(isoString).getTime();
    if (Number.isNaN(then)) return "";

    const seconds = Math.round((then - Date.now()) / 1000);
    const units = [
        ["year", 60 * 60 * 24 * 365],
        ["month", 60 * 60 * 24 * 30],
        ["week", 60 * 60 * 24 * 7],
        ["day", 60 * 60 * 24],
        ["hour", 60 * 60],
        ["minute", 60]
    ];

    for (const [unit, secondsPerUnit] of units) {
        if (Math.abs(seconds) >= secondsPerUnit) {
            return relative.format(Math.round(seconds / secondsPerUnit), unit);
        }
    }

    return relative.format(seconds, "second");
}


export function percent(part, whole) {
    if (whole === 0) return "0%";
    return `${Math.round((part / whole) * 100)}%`;
}
