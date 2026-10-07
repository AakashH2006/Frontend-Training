/* Day 22 - functions and narrowing.

   Two halves. The first is typing the things functions are made of: parameters,
   returns, optional arguments, callbacks. The second is narrowing - how a union
   stops being a locked box and turns into something usable.

   Narrowing is the part I actually came here for. Day 21 showed that a union
   only lets you touch what every member has in common, which is safe and
   useless. Narrowing is how you get the rest. */

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
    section11();
    section12();
}

function heading(title: string): void {
    console.log(`\n--- ${title} ---`);
}


/* ---------------------------------------------------------------
   1. Parameters and return types
   --------------------------------------------------------------- */

// Both parameters annotated, return type inferred as number. The return
// annotation is optional and I write it anyway on anything exported, because it
// pins the contract: if the body changes to return a string by accident, the
// error lands here rather than at every call site.
function totalPaise(unitPaise: number, quantity: number): number {
    return unitPaise * quantity;
}

// No annotation on the return, and this is the mistake it allows. The intent
// was a number; the body returns a string on one path. Inference obediently
// says `string | number` and reports nothing wrong.
function looseAverage(values: number[]) {
    if (values.length === 0) return "no data";
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function section1(): void {
    heading("1. Parameters and returns");

    console.log("total:", totalPaise(34900, 3));

    const result = looseAverage([1, 2, 3]);
    //    ^? string | number  - inferred, and not what was intended

    // So every caller now has to narrow a union that should not exist.
    console.log("average:", typeof result === "number" ? result.toFixed(2) : result);

    // Written with the return type declared, the compiler points at the `return
    // "no data"` line instead, which is the line that is actually wrong.
    console.log("strict version:", strictAverage([1, 2, 3]));
    console.log("empty:", strictAverage([]));
}

// `number | null` is deliberate and declared, so the caller knows there is a
// missing case and the compiler makes them handle it.
function strictAverage(values: number[]): number | null {
    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}


/* ---------------------------------------------------------------
   2. Optional and default parameters
   --------------------------------------------------------------- */

// `label?: string` means the argument may be left out, so inside the function
// its type is `string | undefined`.
function describeCount(count: number, label?: string): string {
    // Without the fallback this would print "undefined".
    const noun = label ?? "item";
    return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

// A default does the same job and gives a better type: inside the function
// `noun` is `string`, never undefined, because the default has already run.
function describeCountDefault(count: number, noun = "item"): string {
    return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

function section2(): void {
    heading("2. Optional and default parameters");

    console.log(describeCount(1));
    console.log(describeCount(3, "book"));
    console.log(describeCountDefault(3, "book"));

    // An optional parameter is not the same as one that accepts undefined.
    // `label?: string` can be omitted; `label: string | undefined` must be
    // passed, even if what is passed is undefined.
    function required(label: string | undefined): string {
        return label ?? "(none)";
    }

    // @ts-expect-error - expected 1 argument, got 0
    console.log(required());

    console.log(required(undefined));

    // Which matters for an options object, because the two produce different
    // call sites. `exactOptionalPropertyTypes` in tsconfig.json makes the
    // distinction real rather than cosmetic.
}


/* ---------------------------------------------------------------
   3. Rest parameters
   --------------------------------------------------------------- */

function joinNames(separator: string, ...names: string[]): string {
    return names.join(separator);
}

function section3(): void {
    heading("3. Rest parameters");

    console.log(joinNames(", ", "Achebe", "Morrison", "Smith"));
    console.log(joinNames(", "));            // zero rest arguments is fine

    // Spreading an array into a rest parameter works. Spreading into fixed
    // parameters does not, because an array's length is not in its type.
    const authors = ["Achebe", "Morrison"];
    console.log(joinNames(" and ", ...authors));

    function exactlyTwo(a: string, b: string): string {
        return `${a} / ${b}`;
    }

    // @ts-expect-error - a spread argument must have a tuple type
    console.log(exactlyTwo(...authors));

    // A tuple has a known length, so this version is allowed.
    const pair: [string, string] = ["Achebe", "Morrison"];
    console.log(exactlyTwo(...pair));
}


/* ---------------------------------------------------------------
   4. Function types and callbacks
   --------------------------------------------------------------- */

// A function type expression. `(book: Book) => boolean` is the whole type.
type Book = { title: string; year: number };
type BookPredicate = (book: Book) => boolean;

function filterBooks(books: readonly Book[], keep: BookPredicate): Book[] {
    return books.filter(keep);
}

function section4(): void {
    heading("4. Function types and callbacks");

    const books: Book[] = [
        { title: "Things Fall Apart", year: 1958 },
        { title: "Beloved", year: 1987 },
        { title: "NW", year: 2012 }
    ];

    // The callback's parameter needs no annotation. It is inferred from
    // BookPredicate - contextual typing, and it is why array methods never
    // need annotating either.
    console.log(filterBooks(books, (book) => book.year > 1980).map((b) => b.title));

    // Fewer parameters than the type declares is allowed. A callback that
    // ignores arguments is substitutable for one that uses them, which is why
    // `books.map((b) => b.title)` works when map passes three arguments.
    console.log(filterBooks(books, () => true).length, "with a zero-arg predicate");

    // More parameters is not allowed - the caller would never supply them.
    // @ts-expect-error - the predicate takes one argument, not two
    console.log(filterBooks(books, (book, extra: number) => extra > 0 && !!book));

    // The classic version of that mistake:
    const years = ["1958", "1987", "2012"];
    console.log("parseInt direct:", years.map(parseInt));
    console.log("wrapped:        ", years.map((year) => parseInt(year, 10)));

    // `map` passes (value, index, array). parseInt takes (string, radix), so
    // the index becomes the radix: radix 0, then 1, then 2. Radix 1 is invalid
    // and radix 2 reads "2012" as binary. TypeScript permits it because
    // parseInt's second parameter is optional, so the shapes are compatible.
}


/* ---------------------------------------------------------------
   5. void
   --------------------------------------------------------------- */

function section5(): void {
    heading("5. void");

    // `void` as a return type means "ignore whatever this returns", which is
    // not the same as `undefined`, meaning "this returns undefined".
    type Logger = (message: string) => void;

    // A function that returns something is assignable to a void-returning type.
    // That is deliberate: it is what makes `array.forEach(x => arr.push(x))`
    // legal, since push returns a number nobody looks at.
    const returnsSomething = (message: string): number => message.length;
    const logger: Logger = returnsSomething;

    // And the return value is genuinely unavailable through that type.
    const ignored = logger("hello");
    //    ^? void
    console.log("typeof the void result:", typeof ignored);

    // @ts-expect-error - a void result cannot be used as a number
    console.log(ignored + 1);

    // A declared `: undefined` return is stricter, and requires a return.
    function mustReturnUndefined(): undefined {
        return undefined;
    }
    console.log("explicit undefined:", mustReturnUndefined());
}


/* ---------------------------------------------------------------
   6. typeof narrowing
   --------------------------------------------------------------- */

function formatValue(value: string | number | boolean): string {
    // Inside each branch the type is narrowed to one member, so the methods of
    // that member become available.
    if (typeof value === "string") return value.trim().toUpperCase();
    if (typeof value === "number") return value.toFixed(2);
    return value ? "yes" : "no";
}

function section6(): void {
    heading("6. typeof narrowing");

    console.log(formatValue("  beloved  "));
    console.log(formatValue(1987));
    console.log(formatValue(true));

    // The trap. `typeof null` is "object", so this narrows to
    // `string[] | null` and not to `string[]`.
    function brokenLength(value: string[] | null): number {
        if (typeof value === "object") {
            // @ts-expect-error - value is possibly null
            return value.length;
        }
        return 0;
    }

    console.log("null-safe version:", safeLength(null), safeLength(["a", "b"]));
    void brokenLength;

    // `typeof null === "object"` is a bug in JavaScript from 1995 that cannot
    // be fixed without breaking the web. TypeScript models it faithfully, so
    // the check for an object is a check against null, not typeof.
    function safeLength(value: string[] | null): number {
        return value === null ? 0 : value.length;
    }
}


/* ---------------------------------------------------------------
   7. Truthiness narrowing, and where it goes wrong
   --------------------------------------------------------------- */

function section7(): void {
    heading("7. Truthiness narrowing");

    // This works and is the usual idiom.
    function greet(name: string | null): string {
        if (!name) return "Hello, stranger";
        return `Hello, ${name}`;
    }

    console.log(greet("Aakash"));
    console.log(greet(null));

    // And here it is wrong, which is the Week 3 `||` lesson returning with a
    // type system attached. 0 is falsy, so a real page 0 is treated as missing.
    function brokenPage(page: number | undefined): number {
        if (!page) return 1;
        return page;
    }

    console.log("page 0 becomes:", brokenPage(0), "<- wrong");

    // Narrow on what is actually being asked. The question is "was it
    // supplied", so the test is against undefined.
    function correctPage(page: number | undefined): number {
        return page === undefined ? 1 : page;
    }

    console.log("page 0 stays:  ", correctPage(0));

    // The empty string is the same bug with a different falsy value.
    function brokenNote(note: string | undefined): string {
        return note || "(no note)";
    }
    function correctNote(note: string | undefined): string {
        return note ?? "(no note)";
    }

    console.log("empty note, ||:", JSON.stringify(brokenNote("")));
    console.log("empty note, ??:", JSON.stringify(correctNote("")));

    // Truthiness is the right narrowing when every falsy value genuinely means
    // absent, and the wrong one the moment 0 or "" is a real value. The type
    // system cannot tell those apart, because both are `number | undefined`.
}


/* ---------------------------------------------------------------
   8. Equality narrowing
   --------------------------------------------------------------- */

function section8(): void {
    heading("8. Equality narrowing");

    // Comparing two unions narrows both sides to what they could share.
    function compare(a: string | number, b: string | boolean): void {
        if (a === b) {
            // The only type both can be is string, so both are strings here.
            console.log("equal strings:", a.toUpperCase(), b.toUpperCase());
        }
    }

    compare("beloved", "beloved");

    // `!= null` with loose equality excludes both null and undefined in one
    // check, because `null == undefined` is true. This is the one place loose
    // equality is clearer than strict, and TypeScript understands it.
    function trim(value: string | null | undefined): string {
        if (value != null) return value.trim();
        return "";
    }

    console.log(JSON.stringify(trim(null)), JSON.stringify(trim("  x  ")));
}


/* ---------------------------------------------------------------
   9. The `in` operator
   --------------------------------------------------------------- */

type Loading = { state: "loading" };
type Loaded = { state: "loaded"; books: Book[] };
type Failed = { state: "failed"; message: string };

function section9(): void {
    heading("9. in narrowing");

    // `in` narrows on the presence of a property, which is useful when the
    // members have no shared tag to switch on.
    function summarise(result: Loaded | Failed): string {
        if ("books" in result) return `${result.books.length} books`;
        return `failed: ${result.message}`;
    }

    console.log(summarise({ state: "loaded", books: [{ title: "NW", year: 2012 }] }));
    console.log(summarise({ state: "failed", message: "offline" }));

    // It narrows on the *declared* type, not on what is there at runtime. An
    // optional property is in the type of both branches, so `in` cannot
    // separate them usefully - which is the argument for a discriminant.
}


/* ---------------------------------------------------------------
   10. instanceof, and errors in a catch
   --------------------------------------------------------------- */

class HttpError extends Error {
    constructor(readonly status: number, message: string) {
        super(message);
        this.name = "HttpError";
    }
}

function section10(): void {
    heading("10. instanceof");

    // `catch` gives `unknown`, not `Error`. That is correct and it is stricter
    // than Week 4 was: `throw "a string"` is legal JavaScript, so a caught
    // value genuinely could be anything.
    function attempt(thrown: unknown): string {
        try {
            throw thrown;
        } catch (error) {
            // @ts-expect-error - error is of type unknown
            console.log("unguarded:", error.message);

            if (error instanceof HttpError) return `HTTP ${error.status}: ${error.message}`;
            if (error instanceof Error) return `${error.name}: ${error.message}`;
            return `thrown non-error: ${String(error)}`;
        }
    }

    console.log(attempt(new HttpError(404, "not found")));
    console.log(attempt(new TypeError("bad argument")));
    console.log(attempt("just a string"));

    // Order matters: HttpError extends Error, so the Error branch would catch
    // both and the status would be lost. Most specific first.
}


/* ---------------------------------------------------------------
   11. Discriminated unions and exhaustiveness
   --------------------------------------------------------------- */

// Every member carries a literal-typed `state`. That shared, single-valued
// property is the discriminant, and it is what makes a switch narrow.
type RequestState = Loading | Loaded | Failed | { state: "empty" };

function describeState(result: RequestState): string {
    switch (result.state) {
        case "loading":
            return "Searching...";
        case "loaded":
            // Narrowed to Loaded, so `books` is available and nothing else is.
            return `Found ${result.books.length}`;
        case "empty":
            return "Nothing matched";
        case "failed":
            return `Error: ${result.message}`;
        default:
            // `result` is `never` here, because every case is handled. If a
            // fifth member is added to RequestState and not handled above,
            // this line stops compiling - which is the entire point.
            return assertNever(result);
    }
}

function assertNever(value: never): never {
    throw new Error(`Unhandled state: ${JSON.stringify(value)}`);
}

function section11(): void {
    heading("11. Discriminated unions");

    console.log(describeState({ state: "loading" }));
    console.log(describeState({ state: "loaded", books: [{ title: "NW", year: 2012 }] }));
    console.log(describeState({ state: "empty" }));
    console.log(describeState({ state: "failed", message: "timed out" }));

    // This is Week 4's `phase` field with the holes closed. There, `phase` was
    // a string and the four render branches were four `if`s I had to remember
    // to keep in step. Here the compiler keeps them in step.

    // The other half of the win: illegal combinations stop being constructible.
    // Week 4's state object could hold `phase: "error"` with a full `results`
    // array, because both fields existed independently. Here `books` only
    // exists on the loaded member.
    // @ts-expect-error - books does not exist on the failed member
    const impossible: RequestState = { state: "failed", message: "x", books: [] };
    void impossible;
}


/* ---------------------------------------------------------------
   12. Type predicates and assertion functions
   --------------------------------------------------------------- */

// A type predicate. The return type `value is Book` tells the compiler that a
// `true` result means the argument is a Book, so narrowing survives the call.
function isBook(value: unknown): value is Book {
    return (
        typeof value === "object" &&
        value !== null &&
        "title" in value &&
        typeof value.title === "string" &&
        "year" in value &&
        typeof value.year === "number"
    );
}

// An assertion function instead throws. The `asserts` return type means that
// after this call returns at all, the narrowing holds for the rest of the
// scope. The explicit annotation is required - inference cannot produce it.
function assertIsBook(value: unknown): asserts value is Book {
    if (!isBook(value)) throw new TypeError("not a book");
}

function section12(): void {
    heading("12. Type predicates");

    const parsed: unknown = JSON.parse('{"title":"Beloved","year":1987}');

    if (isBook(parsed)) {
        // Narrowed to Book by the predicate, with no assertion anywhere.
        console.log("predicate:", parsed.title, parsed.year);
    }

    // The real payoff is in a filter. Without the predicate the result is
    // `unknown[]`; with it, `Book[]`.
    const mixed: unknown[] = [
        { title: "NW", year: 2012 },
        "not a book",
        { title: "no year" },
        { title: "Beloved", year: 1987 }
    ];

    const books = mixed.filter(isBook);
    //    ^? Book[]
    console.log("filtered:", books.map((book) => book.title));

    const assertable: unknown = { title: "Things Fall Apart", year: 1958 };
    assertIsBook(assertable);
    console.log("asserted:", assertable.title);

    try {
        assertIsBook("nope");
    } catch (error) {
        console.log("assertion threw:", (error as Error).message);
    }

    // The honest warning: a predicate is only as good as its body. TypeScript
    // takes `value is Book` on trust and checks nothing. `return true` would
    // compile and would be a lie - which makes these the same category of
    // claim as an `as` cast, just with a place to put the actual check.
}
