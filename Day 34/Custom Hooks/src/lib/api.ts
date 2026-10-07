/* Day 34 - the network layer, unchanged from Day 33.

   Week 5's api.ts, carried over nearly unchanged - the typed error union, the
   `unknown` boundary, the timeout and the shape guard. None of that is React's
   business, which is the point: fetching is not a React problem, and this file
   has no React in it.

   API: https://openlibrary.org - real data, no key, CORS enabled. */

const SEARCH_URL = "https://openlibrary.org/search.json";
const TIMEOUT_MS = 8_000;
const PAGE_SIZE = 12;
const FIELDS = "key,title,author_name,first_publish_year,edition_count";

export interface SearchHit {
    readonly id: string;
    readonly title: string;
    readonly authors: readonly string[];
    readonly year?: number;
}

export type SearchFailure =
    | { readonly kind: "http"; readonly status: number }
    | { readonly kind: "network" }
    | { readonly kind: "timeout" }
    | { readonly kind: "parse" }
    | { readonly kind: "shape"; readonly detail: string };

export function describeFailure(failure: SearchFailure): string {
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

/* Thrown, not returned, because this is the one place a throw is more
   convenient than a Result: the caller is an async function inside an effect
   and already needs a try/catch for the abort case. */
export class SearchError extends Error {
    constructor(readonly failure: SearchFailure) {
        super(describeFailure(failure));
        this.name = "SearchError";
    }
}

interface RawDoc {
    readonly key: string;
    readonly title: string;
    readonly author_name?: readonly string[];
    readonly first_publish_year?: number;
}

/* Loose on purpose: `key` and `title` are the two fields the mapping cannot
   work without, and a stricter guard would drop usable records over a missing
   year. Day 25. */
function isDoc(value: unknown): value is RawDoc {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate["key"] === "string" && typeof candidate["title"] === "string";
}

function toHit(doc: RawDoc): SearchHit {
    const year = doc.first_publish_year;

    return {
        id: doc.key.replace("/works/", ""),
        title: doc.title.trim() || "Untitled",
        authors: doc.author_name ?? [],
        ...(year === undefined ? {} : { year })
    };
}

export interface SearchResult {
    readonly hits: readonly SearchHit[];
    readonly total: number;
}

/* Takes a signal rather than making its own, because the *caller* knows when
   the request stops being wanted. That is the whole integration point with an
   effect's cleanup, and designing it the other way round is what makes fetch
   code hard to cancel. */
export async function searchBooks(
    query: string,
    signal: AbortSignal
): Promise<SearchResult> {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("fields", FIELDS);

    let response: Response;

    try {
        response = await fetch(url, {
            /* Combine the caller's signal with a timeout, so a request that
               never answers does not leave the page loading for ever. */
            signal: typeof AbortSignal.any === "function"
                ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])
                : signal,
            headers: { Accept: "application/json" }
        });
    } catch (error) {
        /* An abort is rethrown untouched: the caller has to be able to tell
           "cancelled" from "failed", because cancelled is not an error. */
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        if (error instanceof DOMException && error.name === "TimeoutError") {
            throw new SearchError({ kind: "timeout" });
        }
        throw new SearchError({ kind: "network" });
    }

    // fetch does not reject on 404 or 500. Day 18's most important lesson.
    if (!response.ok) {
        throw new SearchError({ kind: "http", status: response.status });
    }

    let payload: unknown;

    try {
        payload = (await response.json()) as unknown;
    } catch {
        throw new SearchError({ kind: "parse" });
    }

    if (typeof payload !== "object" || payload === null) {
        throw new SearchError({ kind: "shape", detail: "not an object" });
    }

    const body = payload as Record<string, unknown>;
    const docs = body["docs"];

    if (!Array.isArray(docs)) {
        throw new SearchError({ kind: "shape", detail: "docs is not an array" });
    }

    const valid = docs.filter(isDoc);

    return {
        hits: valid.map(toHit),
        total: typeof body["numFound"] === "number" ? body["numFound"] : valid.length
    };
}
