/* Day 21 - TypeScript setup and everyday types.

   Ten sections, all of them printing to the console, in the same shape as the
   Week 3 exercise files. The difference is that this file is checked before it
   runs: `npm run typecheck` fails on a mistake that Week 3 would only have
   found at runtime, if at all.

   Lines marked `// @ts-expect-error` are deliberate errors. That comment is an
   assertion in its own right - if the line below it ever stops being an error,
   TypeScript reports the comment as unused. It is the honest way to keep a
   broken example in a file that has to compile, and it is not the same thing as
   `@ts-ignore`, which silences whatever happens to be there. */

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


/* ---------------------------------------------------------------
   1. The primitives, and inference
   --------------------------------------------------------------- */

function section1(): void {
    heading("1. Primitives and inference");

    // Three primitives, and no annotation on any of them. TypeScript reads the
    // initialiser and infers the type. Writing `: string` here would be noise.
    const title = "Reading List";
    const count = 12;
    const persistent = true;

    console.log(title, count, persistent);

    // Inference is not the same for `let` and `const`.
    //   const title -> the literal type "Reading List"
    //   let   label -> the wider type string
    // A const can never be reassigned, so its type can be the exact value. A
    // let can, so the type has to cover everything it might hold.
    let label = "unread";
    label = "finished";           // fine: both are strings
    console.log(label);

    // @ts-expect-error - a number is not a string, and this is the whole point
    label = 3;

    // `number` is one type and it is a float, exactly as in Week 3. TypeScript
    // types the arithmetic; it does not fix the arithmetic.
    console.log("0.1 + 0.2 =", 0.1 + 0.2);          // 0.30000000000000004
    console.log("typed as number:", typeof (0.1 + 0.2));

    // So money is still integer paise, and the type does not change that.
    const priceInPaise: number = 34900;
    console.log("price:", (priceInPaise / 100).toFixed(2));
}


/* ---------------------------------------------------------------
   2. Annotations, and when they earn their place
   --------------------------------------------------------------- */

function section2(): void {
    heading("2. Where an annotation is worth writing");

    // Redundant. The initialiser already says it.
    const redundant: string = "don't bother";

    // Worth writing: there is no initialiser to infer from, so without the
    // annotation this would be `any`.
    let nextPage: number;
    nextPage = 2;

    // Worth writing: the annotation is narrower than what would be inferred.
    // Inference would give `string[]`; this says the array may not be written
    // to, and `.push` below is an error because of it.
    const statuses: readonly string[] = ["unread", "reading", "finished"];

    console.log(redundant, nextPage, statuses);

    // @ts-expect-error - push does not exist on a readonly array
    statuses.push("abandoned");

    // Note what just happened: that push *worked*. `readonly` is a compile-time
    // claim and nothing survives into the output, so the array really does have
    // four entries now. TypeScript stops me writing the line; it does not stop
    // the line from working if I force it through.
    console.log("after the forced push:", statuses.length, "entries");

    // The rule I settled on: annotate at the boundaries - parameters, return
    // types, and anything arriving from outside the program - and let inference
    // do the inside. Annotating a local that has an initialiser means the same
    // fact is written twice and can disagree with itself later.
}


/* ---------------------------------------------------------------
   3. Arrays and tuples
   --------------------------------------------------------------- */

function section3(): void {
    heading("3. Arrays and tuples");

    const years: number[] = [1979, 1999, 2013];
    const authors: Array<string> = ["Achebe", "Smith"];   // the same type, written differently

    console.log(years, authors);

    // A tuple fixes the length and the type at each position. An array of
    // mixed things does not.
    const pair: [string, number] = ["Beloved", 1987];
    const [bookTitle, bookYear] = pair;
    console.log(`${bookTitle} (${bookYear})`);

    // @ts-expect-error - the positions are the wrong way round
    const wrongWayRound: [string, number] = [1987, "Beloved"];
    void wrongWayRound;

    // `noUncheckedIndexedAccess` is on in tsconfig.json, and it changes this.
    // Indexing an array gives `number | undefined`, not `number`, because
    // TypeScript cannot know the index is in range.
    const first = years[0];
    //    ^? number | undefined

    // So this is an error until the undefined is dealt with.
    // @ts-expect-error - first is possibly undefined
    console.log(first.toFixed(0));

    // Three ways to deal with it, in order of how much I trust them:
    if (first !== undefined) console.log("guarded:", first.toFixed(0));
    console.log("defaulted:", (years[1] ?? 0).toFixed(0));
    console.log("length-checked:", years.length > 0 ? years[0] : "none");

    // That option is noisy and it is still worth having on. Every "cannot read
    // properties of undefined" I hit in Week 4 was this exact mistake.
}


/* ---------------------------------------------------------------
   4. Object types, optional and readonly
   --------------------------------------------------------------- */

function section4(): void {
    heading("4. Object types");

    // An inline object type. Fine once; a type alias the moment it is needed
    // twice, which is Day 23.
    const book: { title: string; year: number; subtitle?: string } = {
        title: "Things Fall Apart",
        year: 1958
    };

    console.log(book.title, book.year);

    // `subtitle` is optional, so its type is `string | undefined` and reading
    // through it without a check is an error.
    //
    // This one is in a try block because the compile-time error and the runtime
    // error are the same mistake, and I wanted to see both. The type error is
    // the one that would have saved me; the TypeError is what Week 4 gave me
    // instead, and only on the code path where the field happened to be absent.
    try {
        // @ts-expect-error - subtitle is possibly undefined
        console.log(book.subtitle.toUpperCase());
    } catch (error) {
        console.log("threw, as the compiler said it would:", (error as Error).message);
    }

    console.log("subtitle:", book.subtitle ?? "(none)");

    // Optional chaining short-circuits to undefined instead of throwing.
    console.log("length:", book.subtitle?.length ?? 0);

    // Excess property checks: an object literal assigned straight to a typed
    // target may not carry properties the type does not declare. This catches
    // typos, and it is the reason a misspelled key is an error here and silent
    // in plain JavaScript.
    // @ts-expect-error - "yeer" is not a property of the target type
    const typo: { title: string; year: number } = { title: "x", yeer: 1958 };
    void typo;

    // The check only applies to a fresh literal. Through a variable it passes,
    // because then it is ordinary structural compatibility - the object has
    // everything the target needs, and extra properties are allowed.
    const loose = { title: "x", year: 1958, extra: true };
    const accepted: { title: string; year: number } = loose;
    console.log("structurally fine:", accepted.title);
}


/* ---------------------------------------------------------------
   5. Union types
   --------------------------------------------------------------- */

function section5(): void {
    heading("5. Unions");

    // A value that is one of several types.
    let id: string | number = "OL12345W";
    id = 12345;
    console.log("id:", id);

    // Only what is valid on *every* member of the union is available without
    // narrowing. `.toUpperCase()` exists on string and not on number, so it is
    // an error here - and at this point in the function `id` really is a
    // number, so it throws too.
    try {
        // @ts-expect-error - toUpperCase does not exist on number
        console.log(id.toUpperCase());
    } catch (error) {
        console.log("threw:", (error as Error).message);
    }

    // `.toString()` exists on both, so it is allowed.
    console.log("both have toString:", id.toString());

    // Narrowing is tomorrow's topic. The short version:
    function describe(value: string | number): string {
        return typeof value === "string"
            ? `a string of ${value.length} characters`
            : `the number ${value.toFixed(2)}`;
    }

    console.log(describe("Beloved"));
    console.log(describe(1987));

    // A union of arrays is not the same as an array of a union, and mixing
    // them up is a real mistake:
    //   (string | number)[]   one array, each item either
    //   string[] | number[]   either an array of strings or an array of numbers
    const mixed: (string | number)[] = ["a", 1, "b"];
    const eitherOr: string[] | number[] = [1, 2, 3];
    console.log(mixed, eitherOr);
}


/* ---------------------------------------------------------------
   6. Type aliases and literal types
   --------------------------------------------------------------- */

// A literal type is a type with exactly one value in it. A union of them is the
// closest thing to a closed set, and it is what this repo uses everywhere a
// Week 4 string was doing the same job.
type Status = "unread" | "reading" | "finished";

type Progress = {
    status: Status;
    percent: number;
};

function section6(): void {
    heading("6. Aliases and literal types");

    const progress: Progress = { status: "reading", percent: 40 };
    console.log(progress);

    // The payoff. In Week 4 `setStatus(id, "readng")` was a typo that produced
    // a card with no badge and no error anywhere. Here it does not compile.
    // @ts-expect-error - "readng" is not a Status
    const typo: Status = "readng";
    void typo;

    // A type alias is erased at compile time. There is nothing named `Status`
    // at runtime, which is why the list has to exist separately to be iterated.
    const all: readonly Status[] = ["unread", "reading", "finished"];
    console.log("statuses:", all.join(", "));
}


/* ---------------------------------------------------------------
   7. any against unknown
   --------------------------------------------------------------- */

function section7(): void {
    heading("7. any against unknown");

    // `any` switches checking off for that value. Everything below is accepted
    // and every line of it would throw.
    const loose: any = "not a number";
    console.log(typeof loose.whatever);
    // loose.toFixed(2);          // would throw at runtime, compiles fine
    // loose();                   // so would this
    // new loose();               // and this

    // `unknown` is the honest version: a value whose type is not known yet.
    // Nothing can be done with it until it has been narrowed.
    const safe: unknown = JSON.parse('{"title":"Beloved","year":1987}');

    // @ts-expect-error - cannot read a property of unknown
    console.log(safe.title);

    // Narrowed by hand, which is exactly the check the value deserves, because
    // JSON.parse genuinely can return anything.
    if (
        typeof safe === "object" &&
        safe !== null &&
        "title" in safe &&
        typeof safe.title === "string"
    ) {
        console.log("narrowed title:", safe.title);
    }

    // So: `unknown` at every boundary - JSON.parse, a fetch body, localStorage,
    // a message from somewhere else - and `any` only with a comment saying why.
    // The course rule is no unexplained `any`, and this is the reason for it:
    // `any` does not describe a value, it describes giving up on one.
}


/* ---------------------------------------------------------------
   8. null, undefined and strictNullChecks
   --------------------------------------------------------------- */

function findYear(title: string): number | null {
    const known: Record<string, number> = {
        "Things Fall Apart": 1958,
        Beloved: 1987
    };

    // `Record<string, number>` indexed with an arbitrary string is
    // `number | undefined` under noUncheckedIndexedAccess, so this returns the
    // null explicitly rather than leaking an undefined.
    return known[title] ?? null;
}

function section8(): void {
    heading("8. null and undefined");

    const year = findYear("Beloved");

    // @ts-expect-error - year is possibly null
    console.log(year.toFixed(0));

    if (year !== null) {
        console.log("found:", year);
    }

    console.log("missing:", findYear("Unknown Title"));

    // The DOM is where this shows up most. getElementById returns
    // `HTMLElement | null`, because the element may not be there.
    const output = document.getElementById("output");

    // An error whether or not the element happens to be there, because the type
    // is `HTMLElement | null` and the check has not been done. On this page it
    // does exist, so reading the tag name is harmless at runtime - which is
    // precisely the trap: it works until the id is renamed.
    // @ts-expect-error - output is possibly null
    console.log("unguarded:", output.tagName);

    if (output) {
        console.log("found #output, tag:", output.tagName);
    }

    // The non-null assertion `!` says "I know this is not null". It is not a
    // check - it compiles to nothing and the runtime error comes back if the
    // claim is wrong. Worth it only where the alternative is genuinely
    // unreachable, and worth a comment every time.
    const definitelyThere = document.getElementById("output")!;
    console.log("asserted:", definitelyThere?.tagName ?? "actually missing");

    // Which is why `querySelector` results in Week 4 were a whole class of bug:
    // a renamed id produced `null`, and the error landed on the line that used
    // it rather than the line that looked for it.
}


/* ---------------------------------------------------------------
   9. Assertions
   --------------------------------------------------------------- */

function section9(): void {
    heading("9. Assertions");

    // A type assertion tells the compiler to treat a value as a given type. It
    // is a claim, not a conversion. Nothing is checked and nothing is emitted.
    const input = document.getElementById("query") as HTMLInputElement | null;
    console.log("value:", input?.value ?? "(no input on this page)");

    // That one is reasonable: getElementById cannot know the element is an
    // input, and the `| null` keeps the part it *can* know.

    // This one is not. It is a lie that compiles, and `.toFixed` throws.
    const lie = "1987" as unknown as number;
    console.log("typeof lie:", typeof lie);        // "string"
    // console.log(lie.toFixed(0));                // TypeError at runtime

    // `as unknown as X` is the tell. A single `as` between unrelated types is
    // an error; going through `unknown` defeats that check, so writing it means
    // deliberately stepping around the only thing stopping the mistake.

    // `satisfies` is the one I keep reaching for instead. It checks the value
    // against a type without widening it to that type.
    const palette = {
        unread: "#5a646e",
        reading: "#17457f",
        finished: "#1d6b3f"
    } satisfies Record<Status, string>;

    // Checked - a missing status or a non-string would be an error - and the
    // keys stay literal, so this is `"#17457f"`, not just `string`.
    console.log("reading colour:", palette.reading);

    // With `: Record<Status, string>` instead, the annotation would have
    // widened it and `palette.reading` would be plain `string`.
}


/* ---------------------------------------------------------------
   10. enum against a union of literals
   --------------------------------------------------------------- */

enum LegacyStatus {
    Unread = "unread",
    Reading = "reading",
    Finished = "finished"
}

function section10(): void {
    heading("10. enum against a union of literals");

    console.log("enum member:", LegacyStatus.Reading);
    console.log("the enum object exists at runtime:", Object.values(LegacyStatus));

    // An enum is one of the few TypeScript features that emits JavaScript -
    // the object above is real code in the bundle. Everything else today is
    // erased.

    // A union of literals is erased, and it accepts the plain string:
    const fromApi = "reading";
    const asUnion: Status = fromApi;              // fine
    console.log("union accepts a plain string:", asUnion);

    // A string enum does not. This is the part that makes enums awkward at a
    // boundary: the value from the API is a string, and the enum member is a
    // nominal thing that only equals itself.
    // @ts-expect-error - "reading" is not assignable to LegacyStatus
    const asEnum: LegacyStatus = fromApi;
    void asEnum;

    // So: union of literals by default. It needs no runtime object, it accepts
    // API data directly, and it narrows in a switch exactly as well. An enum
    // earns its place when the iterable runtime object is actually wanted, and
    // `as const` gives that without the nominal typing:
    const STATUSES = ["unread", "reading", "finished"] as const;
    type FromConst = (typeof STATUSES)[number];
    //   ^? "unread" | "reading" | "finished"

    const derived: FromConst = "finished";
    console.log("derived from as const:", derived, "| list:", STATUSES.join(", "));

    // One array, and the type comes from it. The list and the type cannot
    // disagree, because there is only one of them.
}
