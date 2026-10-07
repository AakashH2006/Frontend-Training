/* Day 20 - the network layer.

   This is Day 18's fetch helper with the console experiments stripped out and
   an `export` in front of the parts other files need. Everything else in here
   is private to the module: not because it is hidden behind a keyword, but
   because a module only exposes what it exports.

   API: https://openlibrary.org - real data, no key, CORS enabled. */

const SEARCH_URL = "https://openlibrary.org/search.json";
const COVER_URL = "https://covers.openlibrary.org/b/id";

const TIMEOUT_MS = 8000;
const RETRY_ATTEMPTS = 2;


/* A typed error, so the UI can tell a 404 apart from a dropped connection
   without parsing an error message string. */
export class HttpError extends Error {
    constructor(status, statusText, url) {
        super(`${status} ${statusText}`);
        this.name = "HttpError";
        this.status = status;
        this.url = url;
    }
}


/* Combine the caller's cancel signal with a timeout, when the browser is new
   enough to combine them. AbortSignal.any is recent, so it is feature-detected
   rather than assumed. */
function buildSignal(externalSignal) {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);

    if (!externalSignal) return timeout;
    if (typeof AbortSignal.any === "function") {
        return AbortSignal.any([externalSignal, timeout]);
    }
    return externalSignal;
}


async function getJSON(url, { signal } = {}) {
    const response = await fetch(url, {
        signal: buildSignal(signal),
        headers: { Accept: "application/json" }
    });

    // fetch only rejects on a network-level failure. A 404 is a successful
    // round trip, so response.ok has to be checked by hand.
    if (!response.ok) {
        throw new HttpError(response.status, response.statusText, url);
    }

    return response.json();
}


/* Retry network failures only. Retrying a 404 fails again in exactly the same
   way; retrying a dropped connection often works. */
async function withRetry(run) {
    let lastError;

    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
        try {
            return await run();
        } catch (error) {
            lastError = error;

            const worthRetrying = error.name === "TypeError";
            if (!worthRetrying || attempt === RETRY_ATTEMPTS) throw error;

            await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
        }
    }

    throw lastError;
}


export function coverUrl(coverId, size = "M") {
    return coverId ? `${COVER_URL}/${coverId}-${size}.jpg` : null;
}


/* Open Library returns a lot of fields per result. `fields` asks for only the
   ones this app draws, which keeps the response small.

   The raw shape is not what the rest of the app should depend on, so it is
   mapped to a flat book object here. If the API changes, only this function
   changes. */
function toBook(doc) {
    return {
        id: doc.key,                                   // "/works/OL45804W"
        title: doc.title ?? "Untitled",
        authors: doc.author_name ?? [],
        year: doc.first_publish_year ?? null,
        coverId: doc.cover_i ?? null,
        editions: doc.edition_count ?? 0
    };
}


export async function searchBooks(query, { signal } = {}) {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "20");
    url.searchParams.set(
        "fields",
        "key,title,author_name,first_publish_year,cover_i,edition_count"
    );

    const data = await withRetry(() => getJSON(url, { signal }));

    return {
        total: data.numFound ?? 0,
        books: (data.docs ?? []).map(toBook)
    };
}
