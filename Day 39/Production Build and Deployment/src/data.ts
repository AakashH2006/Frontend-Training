/* Day 26 - the data, static.

   Week 5's model, trimmed to what this day needs. Nothing fetches and nothing
   changes today: the point is the component tree, and static data is the
   quickest way to see whether the tree is right.

   `satisfies` rather than an annotation, so the array keeps its literal types
   and is still checked against the shape. Day 21, section 9. */

export const STATUSES = ["unread", "reading", "finished"] as const;
export type Status = (typeof STATUSES)[number];

export interface Book {
    readonly id: string;
    readonly title: string;
    readonly authors: readonly string[];
    readonly year?: number;
    readonly status: Status;
    readonly note?: string;
}

export const BOOKS = [
    {
        id: "OL1W",
        title: "Things Fall Apart",
        authors: ["Chinua Achebe"],
        year: 1958,
        status: "finished",
        note: "Read for the reading group."
    },
    {
        id: "OL2W",
        title: "Beloved",
        authors: ["Toni Morrison"],
        year: 1987,
        status: "reading"
    },
    {
        id: "OL3W",
        title: "NW",
        authors: ["Zadie Smith"],
        year: 2012,
        status: "unread"
    },
    {
        // No year and no author, on purpose. Week 5's lesson was that the
        // missing cases are the ones that render badly, so one record here has
        // the holes in it from the start.
        id: "OL4W",
        title: "An Undated Anthology",
        authors: [],
        status: "unread"
    }
] satisfies readonly Book[];

export const STATUS_LABELS: Record<Status, string> = {
    unread: "Unread",
    reading: "Reading",
    finished: "Finished"
};

/* ---------------------------------------------------------------
   Day 28 additions
   --------------------------------------------------------------- */

/* The guard that turns a DOM string into a Status. A <select> gives back
   `string`, and this is the one place that gap is closed - Day 25's lesson,
   and the reason Week 4's "readng" typo cannot get into state here. */
/* `unknown`, not `string`. Day 28 wrote this as `(value: string)` because the
   only caller was a <select>, whose value is a string. Day 35 added a second
   caller - the storage boundary, where the value came out of JSON.parse and is
   genuinely unknown.

   Widening the parameter costs nothing: a string is assignable to unknown, so
   the select callers still compile, and the typeof guard was already here
   because `includes` needs a string. This is the shape of a guard that works
   at every boundary rather than at one. */
export function isStatus(value: unknown): value is Status {
    return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

/* A standing-in-for-an-API catalogue. Week 7 replaces this with a fetch; today
   it is a constant so the day is about state and not about requests. */
export const CATALOGUE = [
    ...BOOKS,
    {
        id: "OL5W",
        title: "Song of Solomon",
        authors: ["Toni Morrison"],
        year: 1977,
        status: "unread"
    },
    {
        id: "OL6W",
        title: "The Left Hand of Darkness",
        authors: ["Ursula K. Le Guin"],
        year: 1969,
        status: "unread"
    }
] satisfies readonly Book[];

/* ---------------------------------------------------------------
   Day 29 additions
   --------------------------------------------------------------- */

/* "all" plus the three statuses. Spread from STATUSES so adding a status
   reaches the filter list automatically - one array, and the type derived from
   it, which is Day 21's `as const` lesson. */
export const FILTERS = ["all", ...STATUSES] as const;
export type Filter = (typeof FILTERS)[number];

export function isFilter(value: string): value is Filter {
    return (FILTERS as readonly string[]).includes(value);
}

/* ---------------------------------------------------------------
   Day 30 additions
   --------------------------------------------------------------- */

export const SORTS = ["added", "title", "author", "year"] as const;
export type Sort = (typeof SORTS)[number];

export function isSort(value: string): value is Sort {
    return (SORTS as readonly string[]).includes(value);
}

/* `addedAt` so "Recently added" can sort by something real rather than by
   array position. An ISO string, because those sort lexicographically in the
   same order as chronologically - Day 20's reason, unchanged. */
export interface SavedBook extends Book {
    readonly addedAt: string;
}
