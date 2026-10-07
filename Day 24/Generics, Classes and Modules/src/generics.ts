/* Day 24 - generics, classes and modules.

   Ten sections. The two pieces of real code are result.ts and repository.ts;
   this file is the exercises around them. */

import {
    type Book,
    type SavedBook,
    type Status,
    isSavedBook,
    toBook
} from "./model";

import { type Result, err, map, ok, safeJsonParse, unwrapOr } from "./result";
import { Repository, describeFailure } from "./repository";

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

const books: readonly Book[] = [
    toBook({ key: "/works/OL1W", title: "Things Fall Apart", author_name: ["Chinua Achebe"], first_publish_year: 1958, edition_count: 142 }),
    toBook({ key: "/works/OL2W", title: "Beloved", author_name: ["Toni Morrison"], first_publish_year: 1987, edition_count: 95 }),
    toBook({ key: "/works/OL3W", title: "NW", author_name: ["Zadie Smith"], first_publish_year: 2012, edition_count: 21 }),
    toBook({ key: "/works/OL4W", title: "Song of Solomon", author_name: ["Toni Morrison"], first_publish_year: 1977, edition_count: 60 })
];


/* ---------------------------------------------------------------
   1. The problem a generic solves
   --------------------------------------------------------------- */

// Three ways to write "give me the first item", and only one of them is right.

// `any` - compiles, and the return type is a lie by omission. Every caller
// loses the type of their own data.
function firstAny(items: readonly any[]): any {
    return items[0];
}

// `unknown` - honest and useless. The caller has to narrow a type they already
// knew before they called.
function firstUnknown(items: readonly unknown[]): unknown {
    return items[0];
}

// Generic - the relationship between the argument and the return value is
// written down. `T` is not a type; it is a placeholder filled in per call.
function first<T>(items: readonly T[]): T | undefined {
    return items[0];
}

function section1(): void {
    heading("1. What a generic is for");

    const a = firstAny(books);
    //    ^? any - and `a.notAProperty` would compile
    const b = firstUnknown(books);
    //    ^? unknown
    const c = first(books);
    //    ^? Book | undefined

    console.log("any:", a.title, "(and a.nonsense would also compile)");

    // @ts-expect-error - b is unknown
    console.log(b.title);

    console.log("generic:", c?.title);

    // `T | undefined` rather than `T` because of `noUncheckedIndexedAccess`,
    // and it is correct: an empty array has no first item, and saying so in the
    // return type is the difference between this helper and a crash.
    console.log("empty:", first([]));
}


/* ---------------------------------------------------------------
   2. Inference
   --------------------------------------------------------------- */

function section2(): void {
    heading("2. Inference");

    // Nothing in angle brackets at any call site. The type parameter is
    // inferred from the argument.
    console.log(first([1, 2, 3]));
    console.log(first(["a", "b"]));
    console.log(first(books)?.title);

    // Explicit when inference cannot work - there is no argument to infer from.
    const nothing = first<Status>([]);
    console.log("explicit:", nothing);

    // Explicit also when the inferred type is wider than wanted. Inference
    // from a mixed array gives the union.
    const mixed = first([1, "two"]);
    //    ^? string | number | undefined
    console.log("inferred union:", mixed);

    // And this is the thing to be careful about: a generic will happily infer
    // a union and carry on, so a type parameter does not stop a mixed array
    // from going in. It only guarantees that what comes out matches what went
    // in.
}


/* ---------------------------------------------------------------
   3. Constraints
   --------------------------------------------------------------- */

// Unconstrained `T` can be anything, so nothing can be done with it.
function brokenLongest<T>(items: readonly T[]): T | undefined {
    // @ts-expect-error - property length does not exist on type T
    return items.toSorted((a, b) => b.length - a.length)[0];
}

// `extends { length: number }` is the constraint: T may be anything that has a
// numeric length. Strings and arrays both qualify.
function longest<T extends { length: number }>(items: readonly T[]): T | undefined {
    return items.toSorted((a, b) => b.length - a.length)[0];
}

function section3(): void {
    heading("3. Constraints");

    console.log("longest string:", longest(["NW", "Beloved", "Things Fall Apart"]));
    console.log("longest array: ", longest([[1], [1, 2, 3], [1, 2]]));

    // @ts-expect-error - number has no length
    longest([1, 2, 3]);

    void brokenLongest;

    // A constraint is what turns a type parameter from "I know nothing about
    // this" into "I know this much and no more", which is the amount of
    // knowledge the body actually needs.
}


/* ---------------------------------------------------------------
   4. keyof as a constraint
   --------------------------------------------------------------- */

/* Two parameters with a relationship: K must be a key of T, and the return type
   is the type of that key. This is the signature that makes a generic worth it. */
function pluck<T, K extends keyof T>(items: readonly T[], key: K): readonly T[K][] {
    return items.map((item) => item[key]);
}

/* A grouping helper. The key has to produce something usable as an object key,
   so the constraint is on the return type of the callback rather than on T. */
function groupBy<T, K extends string>(
    items: readonly T[],
    keyOf: (item: T) => K
): Record<K, readonly T[]> {
    // The accumulator has to start life partial, because no key exists yet.
    const groups = {} as Record<K, T[]>;

    for (const item of items) {
        const key = keyOf(item);
        (groups[key] ??= []).push(item);
    }

    return groups;
}

function section4(): void {
    heading("4. keyof constraints");

    const titles = pluck(books, "title");
    //    ^? readonly string[]
    const years = pluck(books, "year");
    //    ^? readonly (number | undefined)[]

    console.log("titles:", titles);
    console.log("years: ", years);

    // @ts-expect-error - "publisher" is not a key of Book
    pluck(books, "publisher");

    // The return type tracks the key, so this is an error rather than a runtime
    // surprise: titles are strings, not numbers.
    // @ts-expect-error - string is not assignable to number
    const wrong: readonly number[] = pluck(books, "title");
    void wrong;

    const byAuthor = groupBy(books, (book) => book.authors[0] ?? "Unknown");
    for (const [author, group] of Object.entries(byAuthor)) {
        console.log(`${author}: ${group.map((book) => book.title).join(", ")}`);
    }

    // `{} as Record<K, T[]>` inside groupBy is the one assertion in this file.
    // It is a lie for exactly as long as the loop takes, and the honest
    // alternative - `Partial<Record<K, T[]>>` - would push an undefined check
    // onto every caller for a value that is always there by the time they see
    // it. Written down because that is the rule: no unexplained assertion.
}


/* ---------------------------------------------------------------
   5. Generic classes
   --------------------------------------------------------------- */

/* The store from Week 4, with the state type as a parameter. One
   implementation, any shape of state. */
class Store<S> {
    #state: S;
    readonly #listeners = new Set<(state: S) => void>();

    constructor(initial: S) {
        this.#state = initial;
    }

    getState(): S {
        return this.#state;
    }

    subscribe(listener: (state: S) => void): () => void {
        this.#listeners.add(listener);
        // Returning the unsubscriber is the pattern from Day 19, now typed.
        return () => this.#listeners.delete(listener);
    }

    /* `Partial<S>` as the patch type, which is Day 23's lesson: a patch is
       partial, the state is not. */
    commit(changes: Partial<S>): void {
        this.#state = { ...this.#state, ...changes };
        for (const listener of this.#listeners) listener(this.#state);
    }
}

function section5(): void {
    heading("5. Generic classes");

    interface AppState {
        query: string;
        phase: "idle" | "loading" | "success";
        results: readonly Book[];
    }

    const store = new Store<AppState>({ query: "", phase: "idle", results: [] });

    const unsubscribe = store.subscribe((state) => {
        // `state` is AppState with no annotation - inferred from the class's
        // type parameter.
        console.log(`[subscriber] phase=${state.phase} results=${state.results.length}`);
    });

    store.commit({ phase: "loading" });
    store.commit({ phase: "success", results: books });

    // @ts-expect-error - "done" is not a member of the phase union
    store.commit({ phase: "done" });

    unsubscribe();
    store.commit({ query: "ignored - nobody is listening" });

    console.log("final query:", store.getState().query);
}


/* ---------------------------------------------------------------
   6. Classes: fields, modifiers and parameter properties
   --------------------------------------------------------------- */

interface Describable {
    describe(): string;
}

/* `implements` is checked but adds nothing to the type - it is an assertion
   that this class satisfies the interface, verified at the declaration. */
class ReadingEntry implements Describable {
    /* A parameter property: declares the field, assigns it, and marks it
       readonly, all in the parameter list. */
    constructor(
        readonly book: Book,
        private status: Status = "unread",
        protected readonly addedAt: string = new Date().toISOString()
    ) {}

    /* `#progress` is genuinely private - enforced by the runtime. `private` is
       a compile-time-only marker that is erased, so `entry["status"]` reaches
       it from JavaScript and `entry.#progress` cannot be reached at all. */
    #progress = 0;

    get currentStatus(): Status {
        return this.status;
    }

    advance(to: Status, progress: number): this {
        this.status = to;
        this.#progress = Math.max(0, Math.min(100, progress));
        // Returning `this` rather than ReadingEntry is what makes the method
        // chainable from a subclass without losing the subclass's type.
        return this;
    }

    describe(): string {
        return `${this.book.title} - ${this.status} (${this.#progress}%)`;
    }
}

class AnnotatedEntry extends ReadingEntry {
    constructor(book: Book, private note = "") {
        super(book);
    }

    override describe(): string {
        // `protected addedAt` is reachable here and not from outside.
        const when = this.addedAt.slice(0, 10);
        return `${super.describe()} [${when}] ${this.note}`.trim();
    }
}

function section6(): void {
    heading("6. Classes");

    const entry = new ReadingEntry(books[1]!, "reading");
    console.log(entry.advance("reading", 40).describe());

    // @ts-expect-error - status is private
    console.log(entry.status);

    console.log("but the getter is public:", entry.currentStatus);

    // `private` is erased, so this reaches the field at runtime. A `#` field
    // could not be reached this way - it is a syntax error outside the class.
    console.log("private is compile-time only:", (entry as unknown as Record<string, unknown>)["status"]);

    const annotated = new AnnotatedEntry(books[2]!, "for the reading group");
    console.log(annotated.advance("finished", 100).describe());

    // @ts-expect-error - addedAt is protected
    console.log(annotated.addedAt);

    // `advance` returns `this`, so the chained call keeps the subclass type.
    const chained: AnnotatedEntry = annotated.advance("reading", 10);
    console.log("chaining preserved the subclass:", chained instanceof AnnotatedEntry);
}


/* ---------------------------------------------------------------
   7. Result<T, E>
   --------------------------------------------------------------- */

function section7(): void {
    heading("7. Result<T, E>");

    const good = safeJsonParse('{"title":"Beloved"}');
    const bad = safeJsonParse("{not json");

    // `.value` is only reachable after `.ok` has been checked, which is the
    // entire point. This is Day 22's discriminated union with the payload types
    // left as parameters.
    if (good.ok) console.log("parsed:", good.value);
    if (!bad.ok) console.log("failed:", bad.error.name, "-", bad.error.message);

    // @ts-expect-error - value does not exist on the failure member
    console.log(bad.value);

    // Transforming without unwrapping. The error type is carried through
    // untouched; only the success type changes.
    const length: Result<number, SyntaxError> = map(good, (value) => JSON.stringify(value).length);
    console.log("mapped to a length:", unwrapOr(length, -1));

    const mappedFailure = map(bad, (value) => JSON.stringify(value).length);
    console.log("mapping a failure does nothing:", unwrapOr(mappedFailure, -1));

    // `ok()` returns `Result<T, never>`, so it fits any error type. `never` has
    // no values, which makes the failure member uninhabitable and collapses it.
    const flexible: Result<number, string> = ok(1);
    const alsoFine: Result<number, Error> = ok(1);
    console.log("ok() fits any error type:", flexible.ok, alsoFine.ok);

    const failure: Result<number, string> = err("not a number");
    console.log("err():", unwrapOr(failure, 0));
}


/* ---------------------------------------------------------------
   8. The repository
   --------------------------------------------------------------- */

/* A Storage implementation backed by a Map, so this runs under Node as well as
   in a browser. It also makes the failure paths reachable on purpose, which is
   the Day 18 lesson: a path that is never exercised is a path that does not
   work. */
class MemoryStorage implements Storage {
    readonly #map = new Map<string, string>();
    #failOnWrite = false;

    get length(): number { return this.#map.size; }
    key(index: number): string | null { return [...this.#map.keys()][index] ?? null; }
    getItem(key: string): string | null { return this.#map.get(key) ?? null; }
    removeItem(key: string): void { this.#map.delete(key); }
    clear(): void { this.#map.clear(); }

    setItem(key: string, value: string): void {
        if (this.#failOnWrite) {
            throw new DOMException("quota", "QuotaExceededError");
        }
        this.#map.set(key, value);
    }

    failNextWrites(): void { this.#failOnWrite = true; }
}

function section8(): void {
    heading("8. The typed repository");

    const storage = new MemoryStorage();

    // One class, one type parameter, and the validator from model.ts. The
    // repository never learns what a SavedBook is.
    const repo = new Repository<SavedBook>("reading-list", 1, isSavedBook, storage);

    console.log("available:", repo.available);

    // Nothing stored yet - an empty list, not a failure.
    const empty = repo.load();
    console.log("first load:", empty.ok ? `${empty.value.length} items` : "failed");

    const saved: SavedBook[] = [
        { ...books[0]!, status: "finished", note: "", addedAt: "2026-10-01" },
        { ...books[1]!, status: "reading", note: "halfway", addedAt: "2026-10-04" }
    ];

    console.log("save:", repo.save(saved).ok ? "ok" : "failed");

    const loaded = repo.load();
    if (loaded.ok) {
        console.log("loaded:", loaded.value.map((book) => `${book.title} (${book.status})`));
    }

    // Failure 1: corrupt JSON.
    storage.setItem("reading-list", "{not json");
    const corrupt = repo.load();
    if (!corrupt.ok) console.log("corrupt ->", describeFailure(corrupt.error));

    // Failure 2: a version that does not match.
    storage.setItem("reading-list", JSON.stringify({ version: 99, savedAt: "", items: [] }));
    const wrongVersion = repo.load();
    if (!wrongVersion.ok) console.log("version ->", describeFailure(wrongVersion.error));

    // Failure 3: one bad row among good ones. Dropped, not fatal.
    storage.setItem(
        "reading-list",
        JSON.stringify({
            version: 1,
            savedAt: "",
            items: [saved[0], { ...saved[1], status: "readng" }]
        })
    );
    const partial = repo.load();
    if (partial.ok) console.log(`one row had a bad status; kept ${partial.value.length} of 2`);

    // Failure 4: quota.
    storage.failNextWrites();
    const full = repo.save(saved);
    if (!full.ok) console.log("quota ->", describeFailure(full.error));

    // Failure 5: storage blocked entirely. The probe runs in the constructor,
    // so a repository over broken storage reports it from the first call.
    const blocked = new MemoryStorage();
    blocked.failNextWrites();
    const deadRepo = new Repository<SavedBook>("x", 1, isSavedBook, blocked);
    console.log("available:", deadRepo.available);
    const dead = deadRepo.load();
    if (!dead.ok) console.log("unavailable ->", describeFailure(dead.error));
}


/* ---------------------------------------------------------------
   9. Generic defaults, and where generics are the wrong answer
   --------------------------------------------------------------- */

function section9(): void {
    heading("9. When not to use a generic");

    // `Result<T, E = Error>` has a default, so `Result<number>` means
    // `Result<number, Error>`.
    const withDefault: Result<number> = ok(42);
    console.log("default error type:", unwrapOr(withDefault, 0));

    // The mistake I nearly made: a type parameter used exactly once.
    function pointless<T>(value: T): string {
        return String(value);
    }

    // `T` appears in one position and nothing depends on it. It is `unknown`
    // with ceremony, and the signature below says the same thing more plainly.
    function plain(value: unknown): string {
        return String(value);
    }

    console.log(pointless(1), plain(1));

    // The test I settled on: a type parameter earns its place when it appears
    // in at least two positions, so it describes a *relationship*. `first<T>`
    // relates the array to the return value. `pluck<T, K>` relates the object,
    // the key and the result. `pointless<T>` relates nothing.

    // The other wrong answer - an overload where a union would do:
    function formatOverloaded(value: string): string;
    function formatOverloaded(value: number): string;
    function formatOverloaded(value: string | number): string {
        return typeof value === "string" ? value.trim() : value.toFixed(2);
    }

    function formatUnion(value: string | number): string {
        return typeof value === "string" ? value.trim() : value.toFixed(2);
    }

    console.log(formatOverloaded(1.5), formatUnion(" x "));

    // Three signatures for one behaviour. Overloads earn their place when the
    // return type depends on the argument type - which a union cannot express
    // and which is a conditional type, not today's problem.
}


/* ---------------------------------------------------------------
   10. Module boundaries
   --------------------------------------------------------------- */

function section10(): void {
    heading("10. Module boundaries");

    /* The import at the top of this file is the thing to look at:

           import { type Book, type SavedBook, isSavedBook, toBook } from "./model";

       `type` on each type-only name. With `verbatimModuleSyntax` on,
       TypeScript emits imports exactly as written, so a type imported without
       the keyword becomes a real runtime import of a module that may export
       nothing at runtime. Marking them means the emitted import only pulls in
       `isSavedBook` and `toBook`.

       The dependency direction, which is Day 19's rule with types added:

           model.ts       <- nothing. Types and pure functions only.
           result.ts      <- nothing.
           repository.ts  <- result.ts
           generics.ts    <- all three
           main.ts        <- generics.ts

       Nothing points back up. repository.ts does not know a Book exists - it
       takes a validator and a type parameter - which is why it could store
       anything else tomorrow without being edited. */

    const entry: SavedBook = { ...books[0]!, status: "unread", note: "", addedAt: "2026-10-06" };
    console.log("model exports a guard:", isSavedBook(entry));

    /* The circular import I hit and backed out of: I started to put
       `describeFailure` on the Repository class, which meant repository.ts
       needed the wording, and then a wording module that needed StorageFailure
       from repository.ts. Two modules importing each other.

       It would have run - ES modules hoist function declarations, so the cycle
       resolves for functions. But a `const` read during evaluation of a cycle
       is undefined, which is a failure with no error message, and the real
       problem is that a cycle means the boundary is in the wrong place.
       `describeFailure` is a free function in repository.ts now, and nothing
       imports backwards. */

    console.log("one-way dependencies, no cycles");
}
