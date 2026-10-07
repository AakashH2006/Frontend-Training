/* Day 23 - object types, aliases and interfaces.

   Ten sections. The model lives in model.ts, because the point of the day is
   that the API's shape and the app's shape are two different things that happen
   to be related by one function. */

import {
    type Book,
    type OpenLibraryDoc,
    type SavedBook,
    type Status,
    STATUSES,
    isSavedBook,
    toBook
} from "./model";

export function run(): void {
    section1();
    section2();
    section3();
    section4();
    section5();
    section6();
    section7();
    section8();
    section9();
    section10();
}

function heading(title: string): void {
    console.log(`\n--- ${title} ---`);
}

/* A real doc, copied out of an actual Open Library response and trimmed. */
const sampleDoc: OpenLibraryDoc = {
    key: "/works/OL1234W",
    title: "Things Fall Apart",
    author_name: ["Chinua Achebe"],
    first_publish_year: 1958,
    cover_i: 8231856,
    edition_count: 142
};

/* A real one with the holes in it. Both of these shapes come back from the
   same endpoint, which is the whole argument for the optional fields. */
const sparseDoc: OpenLibraryDoc = {
    key: "/works/OL9999W",
    title: "   ",
    edition_count: 1
};


/* ---------------------------------------------------------------
   1. type against interface
   --------------------------------------------------------------- */

type BookAlias = {
    title: string;
    year: number;
};

interface BookInterface {
    title: string;
    year: number;
}

function section1(): void {
    heading("1. type against interface");

    // Structurally identical and mutually assignable. Neither is "the object
    // one" - a type alias can describe an object perfectly well.
    const a: BookAlias = { title: "Beloved", year: 1987 };
    const b: BookInterface = a;
    const c: BookAlias = b;

    console.log(a.title, b.year, c.title);

    // The differences that are real:
    //
    //   interface  - can be reopened (declaration merging), can only describe
    //                an object shape, extends is cheap for the compiler
    //   type       - cannot be reopened, can describe anything at all: unions,
    //                tuples, primitives, functions, mapped and conditional
    //                types
    //
    // Which is why `Status` has to be a type - a union of string literals is
    // not an object shape and an interface cannot express it.
    const status: Status = "reading";
    console.log("Status must be a type alias:", status);

    // The convention I settled on, and it is a convention rather than a rule:
    // interface for an object that something implements or extends, type for
    // everything else. Being reopenable is the deciding factor, and it cuts
    // both ways - see section 2.
}


/* ---------------------------------------------------------------
   2. Declaration merging
   --------------------------------------------------------------- */

interface Mergeable {
    title: string;
}

// The same name again. This does not redeclare it - it adds to it.
interface Mergeable {
    year: number;
}

function section2(): void {
    heading("2. Declaration merging");

    // Both properties are required now, from two declarations.
    const merged: Mergeable = { title: "NW", year: 2012 };
    console.log(merged);

    // @ts-expect-error - year is missing, and it came from the second block
    const incomplete: Mergeable = { title: "NW" };
    void incomplete;

    // This is why a duplicate type alias is an error and a duplicate interface
    // is not. The alias version says "Duplicate identifier", which is the more
    // helpful behaviour most of the time.

    // Merging exists for extending types you do not own - adding a property to
    // `Window`, declaring a module's missing types. For my own types it is a
    // way to accidentally define a thing twice and never find out.
    //
    // Inside my own code the inability to merge is a feature, so a type alias
    // is the safer default and interface is the deliberate choice.
}


/* ---------------------------------------------------------------
   3. extends against an intersection
   --------------------------------------------------------------- */

interface WithTimestamps {
    readonly addedAt: string;
}

// Two ways to say nearly the same thing.
interface SavedViaExtends extends Book, WithTimestamps {
    readonly status: Status;
}

type SavedViaIntersection = Book & WithTimestamps & { readonly status: Status };

function section3(): void {
    heading("3. extends against intersection");

    const base: Book = toBook(sampleDoc);

    const viaExtends: SavedViaExtends = { ...base, addedAt: "2026-10-06", status: "unread" };
    const viaIntersection: SavedViaIntersection = viaExtends;

    console.log(viaExtends.title, "|", viaIntersection.status);

    // The difference shows up on a conflict.
    //
    // `extends` with an incompatible property is an error at the point of
    // declaration - the interface is rejected, and the message says which
    // property and why.
    //
    // An intersection silently produces the intersection of the two property
    // types, which for `string & number` is `never`. No error at the
    // declaration; an impossible-to-satisfy error later, wherever someone tries
    // to build one.
    type Conflicting = { count: string } & { count: number };

    // @ts-expect-error - count is `never` here, so nothing can be assigned
    const impossible: Conflicting = { count: 1 };
    void impossible;

    // So `extends` fails where the mistake is and an intersection fails where
    // the mistake is noticed. That is the reason SavedBook in model.ts extends
    // Book rather than intersecting with it.
}


/* ---------------------------------------------------------------
   4. Optional properties
   --------------------------------------------------------------- */

function section4(): void {
    heading("4. Optional properties");

    const book = toBook(sparseDoc);

    // `year` is optional, so reading it gives `number | undefined`.
    console.log("year:", book.year ?? "unknown");
    console.log("title fell back to:", book.title);
    console.log("authors is an array, not undefined:", JSON.stringify(book.authors));

    // `exactOptionalPropertyTypes` is on, and this is what it changes.
    // `year?: number` means absent-or-number. Present-and-undefined is a third
    // state, and it is now an error.
    // @ts-expect-error - undefined is not assignable to an exact optional property
    const explicitUndefined: Book = { ...book, year: undefined };
    void explicitUndefined;

    // Which is why toBook uses a conditional spread instead:
    //     ...(doc.first_publish_year === undefined ? {} : { year: ... })
    //
    // It is ugly. The alternative is a type where `"year" in book` can be true
    // for a book with no year, and that made the UI check two things for one
    // question.

    // The difference is observable, which is the part I wanted to see:
    const absent: Record<string, unknown> = { title: "x" };
    const present: Record<string, unknown> = { title: "x", year: undefined };

    console.log('"year" in absent: ', "year" in absent);
    console.log('"year" in present:', "year" in present);
    console.log("both read as:", absent["year"], present["year"]);
}


/* ---------------------------------------------------------------
   5. readonly
   --------------------------------------------------------------- */

function section5(): void {
    heading("5. readonly");

    const book: Book = toBook(sampleDoc);

    // @ts-expect-error - cannot assign to a readonly property
    book.title = "changed";

    // And - the Day 21 lesson again - that assignment went through at runtime.
    console.log("title is now:", book.title);

    // `readonly` is shallow. The array is readonly as a property, and because
    // its type is `readonly string[]` the array itself is protected too. Had
    // it been `string[]`, this push would have been legal:
    // @ts-expect-error - push does not exist on a readonly array
    book.authors.push("someone");

    // `Readonly<T>` makes every property readonly in one go, one level deep.
    type MutableBook = { title: string; tags: string[] };
    const frozen: Readonly<MutableBook> = { title: "NW", tags: ["fiction"] };

    // @ts-expect-error - title is readonly
    frozen.title = "x";

    // But `tags` is still a mutable array. Readonly<T> did not reach inside it.
    frozen.tags.push("literary");
    console.log("Readonly<T> is one level deep:", frozen.tags);

    // Which is the argument for `readonly string[]` written out by hand in
    // model.ts rather than relying on a wrapper.
}


/* ---------------------------------------------------------------
   6. Index signatures and Record
   --------------------------------------------------------------- */

function section6(): void {
    heading("6. Index signatures and Record");

    // An index signature: any string key, values of one type.
    const countsBySubject: { [subject: string]: number } = {
        fiction: 12,
        history: 3
    };

    // `Record<K, V>` is the same thing, and it is the one I reach for.
    const countsByStatus: Record<Status, number> = {
        unread: 4,
        reading: 1,
        finished: 7
    };

    console.log(countsBySubject, countsByStatus);

    // The difference that matters: a Record over a literal union is *closed*.
    // Every key must be present, and no other key is allowed.
    // @ts-expect-error - "abandoned" is not a Status
    const wrongKey: Record<Status, number> = { unread: 0, reading: 0, finished: 0, abandoned: 0 };
    void wrongKey;

    // @ts-expect-error - finished is missing
    const incomplete: Record<Status, number> = { unread: 0, reading: 0 };
    void incomplete;

    // That closedness is the useful part. Add a fourth status to STATUSES and
    // every Record<Status, ...> in the codebase becomes an error until it is
    // filled in - the same exhaustiveness guarantee as Day 22's `never`
    // default, applied to a lookup table.

    // With `string` keys there is no such guarantee, and
    // `noUncheckedIndexedAccess` is what keeps that honest:
    const value = countsBySubject["philosophy"];
    //    ^? number | undefined
    console.log("a key that is not there:", value);

    // The compile error and the runtime error are the same mistake. An open
    // index signature claims every string key returns a number, and this is
    // the one that does not.
    try {
        // @ts-expect-error - value is possibly undefined
        console.log(value.toFixed(0));
    } catch (error) {
        console.log("threw, as the type said:", (error as Error).message);
    }

    // Indexing the closed Record needs no such check, because the key is
    // guaranteed to exist.
    console.log("closed record needs no guard:", countsByStatus.reading.toFixed(0));
}


/* ---------------------------------------------------------------
   7. Structural typing
   --------------------------------------------------------------- */

function section7(): void {
    heading("7. Structural typing");

    // TypeScript compares shapes, not names. This object was never declared as
    // a Book and is a perfectly good one.
    const anonymous = {
        id: "OL1W",
        title: "Beloved",
        authors: ["Toni Morrison"],
        editionCount: 9
    };

    const asBook: Book = anonymous;
    console.log("structurally a Book:", asBook.title);

    // Extra properties are fine through a variable, because the object has
    // everything a Book needs.
    const extra = { ...anonymous, publisher: "Knopf" };
    const stillABook: Book = extra;
    console.log("extra properties are fine:", stillABook.title);

    // Not fine as a fresh literal - the excess property check from Day 21.
    // @ts-expect-error - publisher is not a property of Book
    const literal: Book = { ...anonymous, publisher: "Knopf" };
    void literal;

    // Where structural typing bites: two types that are the same shape and
    // mean different things are interchangeable. Both of these are `string`,
    // so nothing stops them being swapped.
    type BookId = string;
    type UserId = string;

    function fetchBook(id: BookId): string { return `book ${id}`; }
    const userId: UserId = "U-42";

    console.log("no error, and it is wrong:", fetchBook(userId));

    // The fix is a branded type - an intersection with something impossible to
    // produce by accident, so the two stop being interchangeable.
    type Branded<T, B extends string> = T & { readonly __brand: B };
    type SafeBookId = Branded<string, "BookId">;

    function fetchBookSafely(id: SafeBookId): string { return `book ${id}`; }

    // @ts-expect-error - a plain string is not a SafeBookId
    fetchBookSafely("U-42");

    // The brand exists only in the type. Making one requires an assertion,
    // which is the point: it marks the one place the claim is made.
    const checked = "OL1234W" as SafeBookId;
    console.log("branded:", fetchBookSafely(checked));
}


/* ---------------------------------------------------------------
   8. The API shape against the domain shape
   --------------------------------------------------------------- */

function section8(): void {
    heading("8. API shape against domain shape");

    // This is the day's actual lesson, and model.ts is where it lives.

    // The raw doc: snake_case, nearly everything optional, fields this app has
    // no use for.
    console.log("doc keys:  ", Object.keys(sampleDoc).join(", "));

    // The domain book: camelCase, nothing optional unless the UI renders the
    // missing case, nothing the app does not use.
    const book = toBook(sampleDoc);
    console.log("book keys: ", Object.keys(book).join(", "));

    // What that boundary buys, on the sparse record:
    const sparse = toBook(sparseDoc);
    console.log("sparse doc had no author_name; book has:", JSON.stringify(sparse.authors));
    console.log("sparse doc had a blank title; book has: ", JSON.stringify(sparse.title));
    console.log("sparse doc had no year; book has:       ", sparse.year ?? "(absent)");

    // Three decisions, all made in one function, all visible there. In Week 4
    // the same three decisions existed and were spread across api.js and
    // render.js, so "Author unknown" was a rendering concern and `?? []` was a
    // fetching concern, and neither file said why.

    // The cost of skipping the mapping: every component downstream would take
    // `author_name?: readonly string[]` and handle undefined itself. One
    // optional field in the API becomes an optional check in every consumer.
    function renderWithoutMapping(doc: OpenLibraryDoc): string {
        return (doc.author_name ?? ["Author unknown"]).join(", ");
    }
    function renderWithMapping(mapped: Book): string {
        return mapped.authors.length > 0 ? mapped.authors.join(", ") : "Author unknown";
    }

    console.log("without mapping:", renderWithoutMapping(sparseDoc));
    console.log("with mapping:   ", renderWithMapping(sparse));

    // Both work. The second one is the only one that still works when the API
    // renames the field.
}


/* ---------------------------------------------------------------
   9. Utility types
   --------------------------------------------------------------- */

function section9(): void {
    heading("9. Utility types");

    // All four derive a new type from Book rather than restating it, so a
    // change to Book reaches every one of them.

    // Pick - just the fields a card needs.
    type BookCard = Pick<Book, "id" | "title" | "authors">;
    const card: BookCard = { id: "OL1W", title: "Beloved", authors: ["Morrison"] };

    // Omit - everything except the generated field.
    type NewBook = Omit<SavedBook, "addedAt">;
    const draft: NewBook = {
        ...toBook(sampleDoc),
        status: "unread",
        note: ""
    };

    // Partial - every field optional. The shape of a patch.
    type BookPatch = Partial<Pick<SavedBook, "status" | "note">>;
    const patch: BookPatch = { status: "reading" };

    console.log(card.title, "|", draft.status, "|", JSON.stringify(patch));

    // Partial is the right type for an update and the wrong type for storage.
    // A `Partial<SavedBook>` in the store means every read needs a guard, which
    // is how an optional field spreads through a codebase.

    function applyPatch(book: SavedBook, changes: BookPatch): SavedBook {
        return { ...book, ...changes };
    }

    const saved: SavedBook = { ...toBook(sampleDoc), status: "unread", note: "", addedAt: "2026-10-06" };
    console.log("patched:", applyPatch(saved, { status: "finished" }).status);

    // @ts-expect-error - Partial<Pick<...>> does not include title
    applyPatch(saved, { title: "nope" });

    // `keyof` and `typeof`, which are what the utility types are built out of.
    type BookKey = keyof Book;
    const key: BookKey = "title";
    console.log("keyof Book includes:", key);

    // A lookup table keyed by the union, closed the same way as section 6.
    const labels: Record<Status, string> = {
        unread: "Not started",
        reading: "In progress",
        finished: "Done"
    };
    console.log("labels:", STATUSES.map((status) => labels[status]).join(" / "));
}


/* ---------------------------------------------------------------
   10. The other boundary: storage
   --------------------------------------------------------------- */

function section10(): void {
    heading("10. Validating at the storage boundary");

    // `JSON.parse` returns `any` in the standard library, which is the one
    // place the course rule about `any` is not mine to enforce. Annotating the
    // result as `unknown` is how to take it back.
    const stored = '[{"id":"OL1W","title":"Beloved","authors":["Morrison"],"status":"reading","note":"","addedAt":"2026-10-01","editionCount":9}]';

    const parsed: unknown = JSON.parse(stored);

    if (!Array.isArray(parsed)) {
        console.log("not an array - starting empty");
        return;
    }

    // The guard from model.ts, used as a filter predicate. Anything that does
    // not match is dropped rather than crashing the app.
    const books: SavedBook[] = parsed.filter(isSavedBook);
    console.log("recovered", books.length, "of", parsed.length, "entries");
    console.log("first:", books[0]?.title, "-", books[0]?.status);

    // The same parse with a corrupted entry, which is Week 4's actual failure.
    const damaged: unknown = JSON.parse(
        '[{"id":"OL1W","title":"Beloved","authors":["Morrison"],"status":"readng","note":"","addedAt":"x","editionCount":9},' +
        '{"id":"OL2W","title":"NW","authors":[],"status":"unread","note":"","addedAt":"y","editionCount":1}]'
    );

    const survivors = Array.isArray(damaged) ? damaged.filter(isSavedBook) : [];
    console.log("one entry had status 'readng'; kept", survivors.length, "of 2");

    // Week 4 stored that typo happily and rendered a card with no badge. The
    // types cannot reach data that has already been written to disk - but a
    // guard at the boundary turns it into one dropped row instead of a silently
    // broken card.
}
