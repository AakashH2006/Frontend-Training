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
