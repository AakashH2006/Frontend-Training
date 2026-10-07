/* Day 34 - persistence, as a hook.

   The thing Week 6's README listed as its first known limitation: reload and
   the list is gone. This fixes it, and it is the clearest example of a custom
   hook because it bundles three things that always travel together - reading
   the initial value, writing on change, and the four ways localStorage fails.

   All of that failure handling is Week 5's `repository.ts`. What is new is
   only where it lives. */

import { useCallback, useEffect, useState } from "react";

/* Feature-detected once per module, not per call. In Safari private mode and
   with site data blocked, `localStorage` exists and throws when touched - so
   the probe has to be a real write inside a try, not a typeof check. Day 19
   found that the hard way. */
const available = (() => {
    try {
        const probe = "__probe__";
        window.localStorage.setItem(probe, probe);
        window.localStorage.removeItem(probe);
        return true;
    } catch {
        return false;
    }
})();

export interface StoredValue<T> {
    readonly value: T;
    readonly setValue: (next: T | ((previous: T) => T)) => void;
    /* Surfaced rather than swallowed, so the UI can say "this will not be
       remembered" instead of silently forgetting. Day 24. */
    readonly persistent: boolean;
    readonly problem: string | null;
}

export function useLocalStorage<T>(
    key: string,
    initial: T,
    /* A validator, because anything already on disk was written by an older
       version of this code and is untrusted. Day 23's storage boundary, as a
       parameter - the hook never learns what T is. */
    isValid: (value: unknown) => value is T
): StoredValue<T> {
    const [problem, setProblem] = useState<string | null>(null);

    /* A lazy initialiser. Passing `readStored(...)` directly would run the
       parse on every render and throw the result away; passing the function
       runs it once. For a JSON.parse of the whole list that is the difference
       between a cost on mount and a cost per keystroke. */
    const [value, setStateValue] = useState<T>(() => {
        if (!available) return initial;

        try {
            const raw = window.localStorage.getItem(key);
            if (raw === null) return initial;

            /* `unknown`, never `any`. JSON.parse's declared return type is the
               one place the no-any rule is not mine to enforce, and annotating
               the receiving variable is how to take it back. */
            const parsed: unknown = JSON.parse(raw);
            return isValid(parsed) ? parsed : initial;
        } catch {
            // Corrupt JSON. Starting from `initial` loses the data, which is a
            // better failure than an app that will not start.
            return initial;
        }
    });

    /* Deliberately NOT reading `value` back out of storage in an effect.

       The version I wrote first had two effects: one to load and one to save.
       The loader ran after the first render, so the list flashed empty and
       then filled in - and it was a second source of truth that could
       disagree with the state. Reading in the initialiser is one read, before
       the first paint. */

    useEffect(() => {
        if (!available) return;

        try {
            window.localStorage.setItem(key, JSON.stringify(value));
            setProblem(null);
        } catch (error) {
            /* QuotaExceededError is the one that actually happens, and the
               name differs between engines. */
            const quota =
                error instanceof DOMException &&
                (error.name === "QuotaExceededError" ||
                    error.name === "NS_ERROR_DOM_QUOTA_REACHED");

            setProblem(
                quota
                    ? "The list is too large to save in this browser."
                    : "Could not save the list in this browser."
            );
        }
    }, [key, value]);

    /* Writing in an effect rather than inside setValue, because the write is
       synchronisation with something outside React - which is the definition
       from Day 33. It also means a write happens once per committed value
       rather than once per call, so three setValue calls in one handler are
       one write.

       `useCallback` so the returned function is stable, which matters because
       it goes into other components' props and dependency arrays. */
    const setValue = useCallback((next: T | ((previous: T) => T)) => {
        setStateValue((previous) =>
            typeof next === "function" ? (next as (p: T) => T)(previous) : next
        );
    }, []);

    return { value, setValue, persistent: available, problem };
}

/* `typeof next === "function"` is the one awkward line. `T` could itself be a
   function type, in which case this check is wrong - which is exactly why
   React's own setState has the same limitation and the same workaround
   (wrap it: `setValue(() => myFunction)`). Noted rather than pretended away. */
