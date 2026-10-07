/* Day 41 - the model.

   Named `domain.ts` rather than `data.ts`, which is the one thing I carried
   over from Day 40's review: in the React app this file was called `data.ts`,
   the `Book` type moved out of it on Day 31, and the name stopped describing
   the contents four days before I noticed. Starting the Angular version with
   the right name costs nothing.

   The content is Week 5's model. Angular has no opinion about plain
   TypeScript, so this file is identical in shape to the React one - which is
   worth knowing: the parts of the app that are not framework code do not
   change when the framework does. */

export const STATUSES = ['unread', 'reading', 'finished'] as const;
export type Status = (typeof STATUSES)[number];

export const SORTS = ['added', 'title', 'author', 'year'] as const;
export type Sort = (typeof SORTS)[number];

export const FILTERS = ['all', ...STATUSES] as const;
export type Filter = (typeof FILTERS)[number];

export const STATUS_LABELS: Record<Status, string> = {
    unread: 'Unread',
    reading: 'Reading',
    finished: 'Finished'
};

export interface Book {
    readonly id: string;
    readonly title: string;
    readonly authors: readonly string[];
    readonly year?: number;
    readonly status: Status;
    readonly note?: string;
    readonly addedAt: string;
}

export function isStatus(value: unknown): value is Status {
    return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

/* Seven books, so filtering and sorting have something to do. Two of them
   have deliberate holes - no author, no year - because the missing cases are
   the ones that render badly. */
export const SEED_BOOKS: readonly Book[] = [
    { id: 'OL1W', title: 'Things Fall Apart', authors: ['Chinua Achebe'], year: 1958, status: 'finished', note: 'Read for the reading group.', addedAt: '2026-10-01T09:00:00.000Z' },
    { id: 'OL2W', title: 'Beloved', authors: ['Toni Morrison'], year: 1987, status: 'reading', addedAt: '2026-10-02T09:00:00.000Z' },
    { id: 'OL3W', title: 'An Undated Anthology', authors: [], status: 'unread', addedAt: '2026-10-03T09:00:00.000Z' },
    { id: 'OL4W', title: 'Neuromancer', authors: ['William Gibson'], year: 1984, status: 'unread', addedAt: '2026-10-04T09:00:00.000Z' },
    { id: 'OL5W', title: 'The Left Hand of Darkness', authors: ['Ursula K. Le Guin'], year: 1969, status: 'finished', addedAt: '2026-10-05T09:00:00.000Z' },
    { id: 'OL6W', title: 'Song of Solomon', authors: ['Toni Morrison'], year: 1977, status: 'unread', note: 'Lent from the library.', addedAt: '2026-10-06T09:00:00.000Z' },
    { id: 'OL7W', title: 'Kindred', authors: ['Octavia E. Butler'], year: 1979, status: 'reading', addedAt: '2026-10-07T09:00:00.000Z' }
];
