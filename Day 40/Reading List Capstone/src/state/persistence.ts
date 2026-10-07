/* Day 35 - persisting the reducer's state.

   Day 34's useLocalStorage owns a piece of state with useState. That does not
   fit a reducer, which already owns the state - so this is the same four
   failure modes without the state ownership.

   Two functions, both plain and both testable without React:

       readStoredList   what to seed the reducer with
       writeStoredList  what the provider's effect calls

   Only the list is persisted, not the whole AppState. `query`, `filter`,
   `sort` and `editingId` are session concerns - restoring a filter from three
   days ago and showing "Showing 0 of 12" is a worse first impression than
   starting clean. That is a product decision, written down because the code
   cannot explain it. */

import { isStatus } from "../data";
import { INITIAL_STATE, type AppState, type Book, type ListState } from "./reducer";

const STORAGE_KEY = "day35.readingList";
const VERSION = 1;

/* The envelope from Day 19. A bare array works right up until the shape
   changes, and then every existing visit is a crash. */
interface Envelope {
    readonly version: number;
    readonly savedAt: string;
    readonly books: readonly Book[];
}

/* Probed once, with a real write inside a try. In Safari private mode and with
   site data blocked, `localStorage` exists and throws on access - so a typeof
   check is not enough. Day 19. */
export const storageAvailable = (() => {
    try {
        const probe = "__probe__";
        window.localStorage.setItem(probe, probe);
        window.localStorage.removeItem(probe);
        return true;
    } catch {
        return false;
    }
})();


function isBook(value: unknown): value is Book {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Record<string, unknown>;

    return (
        typeof candidate["id"] === "string" &&
        typeof candidate["title"] === "string" &&
        Array.isArray(candidate["authors"]) &&
        candidate["authors"].every((name) => typeof name === "string") &&
        typeof candidate["addedAt"] === "string" &&
        isStatus(candidate["status"]) &&
        (candidate["year"] === undefined || typeof candidate["year"] === "number") &&
        (candidate["note"] === undefined || typeof candidate["note"] === "string")
    );
}


export interface LoadOutcome {
    readonly state: AppState;
    /* Reported rather than swallowed, so the UI can say what happened. Day 24:
       "empty" and "broken" are different states and Week 4 could not tell them
       apart because both came back as an empty array. */
    readonly notice: string | null;
}

/* Passed to useReducer as its third argument, so it runs once rather than on
   every render. */
export function readStoredList(): LoadOutcome {
    if (!storageAvailable) {
        return {
            state: INITIAL_STATE,
            notice: "This browser is blocking local storage, so the list will be lost on reload."
        };
    }

    let raw: string | null;

    try {
        raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
        return { state: INITIAL_STATE, notice: "Could not read the saved list." };
    }

    if (raw === null) return { state: INITIAL_STATE, notice: null };

    let parsed: unknown;

    try {
        // `unknown`, never `any`. JSON.parse's declared return type is the one
        // place the no-any rule is not mine to enforce.
        parsed = JSON.parse(raw);
    } catch {
        return {
            state: INITIAL_STATE,
            notice: "The saved list could not be read, so it has been reset."
        };
    }

    if (typeof parsed !== "object" || parsed === null) {
        return { state: INITIAL_STATE, notice: "The saved list was not in the expected shape." };
    }

    const envelope = parsed as Partial<Envelope>;

    if (envelope.version !== VERSION) {
        return {
            state: INITIAL_STATE,
            notice: `The saved list is version ${String(envelope.version)}, and this app expects ${VERSION}.`
        };
    }

    if (!Array.isArray(envelope.books)) {
        return { state: INITIAL_STATE, notice: "The saved list was not in the expected shape." };
    }

    /* Bad rows are dropped rather than taking the whole list down. Week 4
       stored a misspelled status happily and rendered a card with no badge;
       here that row does not come back. */
    const books = envelope.books.filter(isBook);
    const skipped = envelope.books.length - books.length;

    const list: ListState = {
        byId: Object.fromEntries(books.map((book) => [book.id, book])),
        ids: books.map((book) => book.id)
    };

    return {
        state: { ...INITIAL_STATE, list },
        notice:
            skipped === 0
                ? null
                : skipped === 1
                  ? "1 saved entry could not be read and was skipped."
                  : `${skipped} saved entries could not be read and were skipped.`
    };
}


export type WriteOutcome = { readonly ok: true } | { readonly ok: false; readonly notice: string };

export function writeStoredList(books: readonly Book[]): WriteOutcome {
    if (!storageAvailable) return { ok: true };

    const envelope: Envelope = { version: VERSION, savedAt: new Date().toISOString(), books };

    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
        return { ok: true };
    } catch (error) {
        // The name differs between engines, so both spellings are checked.
        const quota =
            error instanceof DOMException &&
            (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED");

        return {
            ok: false,
            notice: quota
                ? "The list is too large to save in this browser."
                : "Could not save the list in this browser."
        };
    }
}
