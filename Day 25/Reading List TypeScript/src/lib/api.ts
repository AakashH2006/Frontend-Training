/* Day 25 - the network layer, typed.

   Day 20's api.js, migrated. The logic is the same: a timeout, one retry for
   network failures only, a typed error, and the mapping to a domain Book.

   What changed is the boundary. `response.json()` returns `Promise<any>` in the
   standard library, and that `any` would spread through every caller - so it is
   received as `unknown` and validated before anything downstream sees it. That
   one line is the difference between a typed app and an app with types written
   on it. */

import { type Book, type OpenLibraryDoc, toBook } from "./model";
import { type Result, err, ok } from "./result";

const SEARCH_URL = "https://openlibrary.org/search.json";
const COVER_URL = "https://covers.openlibrary.org/b/id";

const TIMEOUT_MS = 8_000;
const RETRY_ATTEMPTS = 2;
const PAGE_SIZE = 20;

/* The fields this app actually draws. Asking for only these keeps the response
   small - Open Library returns a great deal per result otherwise. */
const FIELDS = "key,title,author_name,first_publish_year,cover_i,edition_count";


/* ---------------------------------------------------------------
   Failures
   --------------------------------------------------------------- */

export class HttpError extends Error {
    constructor(
        readonly status: number,
        readonly statusText: string,
        readonly url: string
    ) {
        super(`${status} ${statusText}`);
        this.name = "HttpError";
    }
}

/* Day 18 found six distinct failures and told them apart by `error.name` inside
   a switch. As a union they are a closed set, so the message function below is
   exhaustive and a new kind cannot be forgotten. */
export type SearchFailure =
    | { readonly kind: "http"; readonly status: number }
    | { readonly kind: "network" }
    | { readonly kind: "timeout" }
    | { readonly kind: "parse" }
    | { readonly kind: "shape"; readonly detail: string };

export function describeSearchFailure(failure: SearchFailure): string {
    switch (failure.kind) {
        case "http":
            if (failure.status === 404) return "Open Library has no endpoint at that address.";
            if (failure.status === 429) return "Too many searches too quickly. Wait a moment.";
            if (failure.status >= 500) return "Open Library is having trouble. Try again shortly.";
            return `Open Library answered ${failure.status}.`;
        case "network":
            return "Could not reach Open Library. Check your connection.";
        case "timeout":
            return "The request took longer than eight seconds and was cancelled.";
        case "parse":
            return "The response was not valid JSON.";
        case "shape":
            return `The response was not in the expected shape (${failure.detail}).`;
        default: {
            const unreachable: never = failure;
            throw new Error(`Unhandled failure: ${JSON.stringify(unreachable)}`);
        }
    }
}


/* ---------------------------------------------------------------
   Request plumbing
   --------------------------------------------------------------- */

function buildSignal(external: AbortSignal | undefined): AbortSignal {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    if (external === undefined) return timeout;

    // AbortSignal.any is recent enough to be worth feature-detecting rather
    // than assuming - the same check as Day 18.
    if (typeof AbortSignal.any === "function") {
        return AbortSignal.any([external, timeout]);
    }
    return external;
}


/* Returns `unknown`, not `any` and not a guessed type. This is the boundary. */
async function getJson(url: URL, signal: AbortSignal | undefined): Promise<unknown> {
    const response = await fetch(url, {
        signal: buildSignal(signal),
        headers: { Accept: "application/json" }
    });

    // fetch only rejects on a network-level failure, so a 404 arrives here as a
    // perfectly successful round trip. Day 18's most important lesson.
    if (!response.ok) {
        throw new HttpError(response.status, response.statusText, url.toString());
    }

    return (await response.json()) as unknown;
}


/* Retry network failures only. Retrying a 404 fails again identically;
   retrying a dropped connection often works. */
async function withRetry<T>(run: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
        try {
            return await run();
        } catch (error) {
            lastError = error;

            // `catch` gives unknown, so this is a narrowing rather than a
            // property access on a guess.
            const worthRetrying = error instanceof TypeError;
            if (!worthRetrying || attempt === RETRY_ATTEMPTS) throw error;

            await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
        }
    }

    throw lastError;
}


/* ---------------------------------------------------------------
   Validating the response
   --------------------------------------------------------------- */

/* The doc guard is deliberately loose: `key` and `title` are the two fields
   `toBook` cannot work without, and everything else it already defaults. A
   stricter guard here would drop usable records over a missing cover id. */
function isDoc(value: unknown): value is OpenLibraryDoc {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate["key"] === "string" && typeof candidate["title"] === "string";
}

export interface SearchResult {
    readonly total: number;
    readonly books: readonly Book[];
    /* How many docs were dropped by the guard. Surfaced rather than swallowed,
       because silently returning 18 of 20 results is the kind of thing that
       should be visible in the console at least. */
    readonly skipped: number;
}

function parseSearchResponse(payload: unknown): Result<SearchResult, SearchFailure> {
    if (typeof payload !== "object" || payload === null) {
        return err({ kind: "shape", detail: "not an object" } as const);
    }

    const body = payload as Record<string, unknown>;
    const docs = body["docs"];

    if (!Array.isArray(docs)) {
        return err({ kind: "shape", detail: "docs is not an array" } as const);
    }

    const valid = docs.filter(isDoc);

    return ok({
        total: typeof body["numFound"] === "number" ? body["numFound"] : valid.length,
        books: valid.map(toBook),
        skipped: docs.length - valid.length
    });
}


/* ---------------------------------------------------------------
   The one exported call
   --------------------------------------------------------------- */

export async function searchBooks(
    query: string,
    options: { readonly signal?: AbortSignal } = {}
): Promise<Result<SearchResult, SearchFailure>> {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("fields", FIELDS);

    try {
        const payload = await withRetry(() => getJson(url, options.signal));
        return parseSearchResponse(payload);
    } catch (error) {
        /* Turning a thrown `unknown` into a member of the failure union. Every
           branch is a narrowing, and the AbortError case is deliberately not
           here - main.ts handles it before this is reached, because a
           cancelled request is not a failure. */
        if (error instanceof HttpError) {
            return err({ kind: "http", status: error.status } as const);
        }
        if (error instanceof SyntaxError) {
            return err({ kind: "parse" } as const);
        }
        if (error instanceof DOMException && error.name === "TimeoutError") {
            return err({ kind: "timeout" } as const);
        }
        if (error instanceof TypeError) {
            return err({ kind: "network" } as const);
        }

        throw error;
    }
}

/* `error instanceof DOMException && error.name === "TimeoutError"` is the part
   that needed checking rather than guessing. A timeout from
   `AbortSignal.timeout` arrives as a DOMException whose `name` is
   "TimeoutError", while a manual `controller.abort()` gives one named
   "AbortError". Day 18 told them apart by name alone; the instanceof is what
   makes `.name` safe to read at all. */


export function coverUrl(coverId: number | undefined, size: "S" | "M" | "L" = "M"): string | null {
    return coverId === undefined ? null : `${COVER_URL}/${coverId}-${size}.jpg`;
}
