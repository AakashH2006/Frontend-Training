/* Day 24 - a typed repository over localStorage.

   Week 4's storage.js handled the four failure modes correctly and knew exactly
   one shape: an array of saved books. This is the same logic with the item type
   as a parameter, so the reading list and anything else share one
   implementation.

   The class exists for one reason: there is state to hold. The key, the version
   and the validator are fixed when the repository is constructed and used by
   every method afterwards. A set of functions would mean passing all three to
   each call, or closing over them in a factory - which is a class with extra
   steps. */

import { type Result, err, ok, safeJsonParse } from "./result";

/* The envelope from Day 19. A bare array works until the shape changes, and
   then every existing user's next visit is a crash. */
interface Envelope<T> {
    readonly version: number;
    readonly savedAt: string;
    readonly items: readonly T[];
}

export type StorageFailure =
    | { readonly kind: "unavailable" }
    | { readonly kind: "quota" }
    | { readonly kind: "corrupt"; readonly detail: string }
    | { readonly kind: "version"; readonly found: number; readonly expected: number };

/* A validator for one item. `(value: unknown) => value is T` is Day 22's type
   predicate as a constructor parameter, which is what lets one class validate
   any shape without knowing what the shape is. */
export type Validator<T> = (value: unknown) => value is T;


export class Repository<T> {
    /* `#available` is a true private field - the `#` is enforced at runtime by
       the language, not just by the compiler. `private` would be erased and
       reachable from JavaScript; this is not. */
    readonly #available: boolean;

    /* Parameter properties. `private readonly key: string` in the parameter
       list declares the field, assigns it and marks it readonly, instead of the
       three lines that would otherwise be needed. */
    constructor(
        private readonly key: string,
        private readonly version: number,
        private readonly isValid: Validator<T>,
        private readonly storage: Storage = localStorage
    ) {
        this.#available = Repository.probe(storage);
    }

    /* Static, because it answers a question about the environment rather than
       about one repository, and the constructor needs it before any instance
       exists.

       The probe is a real write inside a try. `typeof localStorage !== "undefined"`
       is not enough: in Safari private mode and with site data blocked, the
       object exists and throws when touched. Day 19 found that the hard way. */
    private static probe(storage: Storage): boolean {
        try {
            const probeKey = "__probe__";
            storage.setItem(probeKey, probeKey);
            storage.removeItem(probeKey);
            return true;
        } catch {
            return false;
        }
    }

    get available(): boolean {
        return this.#available;
    }

    /* Returns `Result<readonly T[], StorageFailure>`, so every one of the four
       failure modes is in the type and the caller cannot forget one. Week 4
       returned a bare array and logged the problems to the console, which meant
       the UI could not tell "empty" from "broken". */
    load(): Result<readonly T[], StorageFailure> {
        if (!this.#available) return err({ kind: "unavailable" } as const);

        const raw = this.storage.getItem(this.key);
        if (raw === null) return ok([]);

        const parsed = safeJsonParse(raw);
        if (!parsed.ok) {
            return err({ kind: "corrupt", detail: parsed.error.message } as const);
        }

        const envelope = parsed.value;

        if (
            typeof envelope !== "object" ||
            envelope === null ||
            !("version" in envelope) ||
            !("items" in envelope)
        ) {
            return err({ kind: "corrupt", detail: "not an envelope" } as const);
        }

        const { version, items } = envelope as { version: unknown; items: unknown };

        if (version !== this.version) {
            return err({
                kind: "version",
                found: typeof version === "number" ? version : -1,
                expected: this.version
            } as const);
        }

        if (!Array.isArray(items)) {
            return err({ kind: "corrupt", detail: "items is not an array" } as const);
        }

        /* The validator, used as a filter predicate. A bad row is dropped
           rather than taking the whole list down with it - and because
           `isValid` is a type predicate, the result is `T[]` and not
           `unknown[]`. */
        return ok(items.filter(this.isValid));
    }

    save(items: readonly T[]): Result<number, StorageFailure> {
        if (!this.#available) return err({ kind: "unavailable" } as const);

        const envelope: Envelope<T> = {
            version: this.version,
            savedAt: new Date().toISOString(),
            items
        };

        try {
            this.storage.setItem(this.key, JSON.stringify(envelope));
            return ok(items.length);
        } catch (error) {
            // The name differs between engines, so both spellings are checked.
            const quota =
                error instanceof DOMException &&
                (error.name === "QuotaExceededError" ||
                    error.name === "NS_ERROR_DOM_QUOTA_REACHED");

            return quota
                ? err({ kind: "quota" } as const)
                : err({ kind: "corrupt", detail: String(error) } as const);
        }
    }

    clear(): void {
        if (!this.#available) return;
        this.storage.removeItem(this.key);
    }
}


/* A plain function to turn a failure into a sentence. Deliberately not a method
   on the class: the class's job is storage, and wording is a different job that
   changes for different reasons. Day 20 pulled format.js out of render.js for
   the same reason.

   The `switch` is exhaustive and the `never` default proves it, so adding a
   fifth failure kind breaks the build here. */
export function describeFailure(failure: StorageFailure): string {
    switch (failure.kind) {
        case "unavailable":
            return "This browser is not allowing local storage, so the list will be forgotten on reload.";
        case "quota":
            return "The list is too large to save in this browser.";
        case "corrupt":
            return `The saved list could not be read (${failure.detail}), so it has been reset.`;
        case "version":
            return `The saved list is version ${failure.found}, and this app expects ${failure.expected}.`;
        default: {
            const unreachable: never = failure;
            throw new Error(`Unhandled failure: ${JSON.stringify(unreachable)}`);
        }
    }
}
