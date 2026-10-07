/* Day 23 - the model.

   Two sets of types in here, and keeping them apart is the point of the day.

   `OpenLibraryDoc` and `SearchResponse` describe what the API sends. I did not
   design them and I cannot change them. Almost every field is optional, because
   almost every field is genuinely missing on some records - I checked against
   real responses rather than guessing.

   `Book` and `SavedBook` describe what this app works with. I did design them,
   and nothing in them is optional unless the app has a real answer for the
   missing case.

   `toBook` is the only crossing point. Everything upstream of it deals in the
   API's shape; everything downstream deals in mine. Week 4 had this mapping
   too, buried in api.js - what is new is that the two shapes now have names,
   so the boundary is visible instead of implied. */


/* ---------------------------------------------------------------
   What the API sends
   --------------------------------------------------------------- */

/* `readonly` on every property, because nothing should ever write to a parsed
   response. It is a record of what arrived. */
export interface OpenLibraryDoc {
    readonly key: string;
    readonly title: string;

    /* All optional, and all of these really do go missing:
       - author_name is absent on some anthologies and on bad records
       - first_publish_year is absent on anything undated
       - cover_i is absent whenever there is no scanned cover
       - subject is absent on sparse records, and can be enormous */
    readonly author_name?: readonly string[];
    readonly first_publish_year?: number;
    readonly cover_i?: number;
    readonly edition_count?: number;
    readonly subject?: readonly string[];
    readonly language?: readonly string[];
}

export interface SearchResponse {
    readonly numFound: number;
    readonly start: number;
    readonly docs: readonly OpenLibraryDoc[];
}


/* ---------------------------------------------------------------
   What the app works with
   --------------------------------------------------------------- */

/* Derived from the array rather than written twice, so the list and the type
   cannot disagree. Day 21, section 10. */
export const STATUSES = ["unread", "reading", "finished"] as const;
export type Status = (typeof STATUSES)[number];

export const SORTS = ["added", "title", "author", "year"] as const;
export type Sort = (typeof SORTS)[number];

export const FILTERS = ["all", ...STATUSES] as const;
export type Filter = (typeof FILTERS)[number];


/* The domain book. Compare field by field with OpenLibraryDoc:

   - `authors` is `readonly string[]`, never missing. An empty array is a real
     answer and `undefined` is not, so the mapper substitutes one.
   - `title` is a string, never missing, with a placeholder if it has to be.
   - `year` and `coverId` stay optional, because "unknown year" is genuinely
     different from any number I could invent. The UI renders that difference.

   The rule I settled on: a field is optional here only when the app has
   something real to display for the missing case. */
export interface Book {
    readonly id: string;
    readonly title: string;
    readonly authors: readonly string[];
    readonly year?: number;
    readonly coverId?: number;
    readonly editionCount: number;
}

/* A saved book is a book plus the fields this app adds. `extends` rather than
   repeating the six properties, so a change to Book reaches both. */
export interface SavedBook extends Book {
    readonly status: Status;
    readonly note: string;
    readonly addedAt: string;        // ISO 8601 - sorts lexicographically
    readonly finishedAt?: string;
}


/* ---------------------------------------------------------------
   The crossing point
   --------------------------------------------------------------- */

export function toBook(doc: OpenLibraryDoc): Book {
    /* Every `??` here is a decision about a missing field, and writing the
       types out is what forced each one to be made explicitly rather than
       discovered later as a blank space on a card. */
    return {
        // "/works/OL12345W" -> "OL12345W". The key is the only stable id the
        // API offers; there is no numeric one.
        id: doc.key.replace("/works/", ""),

        // Non-empty in practice, but the type says `string` and a blank title
        // would render as an invisible card, so it gets a placeholder.
        title: doc.title.trim() || "Untitled",

        // The important one. `undefined` would push the missing-author check
        // into every consumer; an empty array lets them all just map over it.
        authors: doc.author_name ?? [],

        // Deliberately left optional - see the comment on Book.
        ...(doc.first_publish_year === undefined
            ? {}
            : { year: doc.first_publish_year }),
        ...(doc.cover_i === undefined ? {} : { coverId: doc.cover_i }),

        editionCount: doc.edition_count ?? 1
    };
}

/* Those two conditional spreads are ugly and they are what
   `exactOptionalPropertyTypes` requires. With that option on,
   `year?: number` means the property is either absent or a number - writing
   `year: undefined` is an error, because "present and undefined" is a third
   state the type did not ask for.

   The alternatives were to drop the option, or to widen the type to
   `year?: number | undefined`. Both put `undefined` back into a field that is
   supposed to mean "this book has no known year", and then `"year" in book`
   stops being a reliable question. The spread keeps the type honest. */


/* A type guard for data coming back out of localStorage, which is the other
   boundary. Day 22's section 12, applied to something real. */
export function isSavedBook(value: unknown): value is SavedBook {
    if (typeof value !== "object" || value === null) return false;

    const candidate = value as Record<string, unknown>;

    return (
        typeof candidate["id"] === "string" &&
        typeof candidate["title"] === "string" &&
        Array.isArray(candidate["authors"]) &&
        candidate["authors"].every((name) => typeof name === "string") &&
        typeof candidate["note"] === "string" &&
        typeof candidate["addedAt"] === "string" &&
        typeof candidate["editionCount"] === "number" &&
        isStatus(candidate["status"])
    );
}

export function isStatus(value: unknown): value is Status {
    // `includes` on a readonly tuple of literals needs the widening, because
    // its parameter type is the literal union and `value` is unknown.
    return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}
