/* Day 34 - debouncing, as a hook.

   Day 33 avoided debouncing by making the user press Search. That was the
   right call for an API with a rate limit and the wrong one for the local
   filter box, which re-filters on every keystroke for no reason.

   The generic is the point: this hook does not care what it is debouncing.
   `useDebouncedValue(text, 300)` returns a string; `useDebouncedValue(filters,
   300)` returns the filters. One implementation, and the return type follows
   the argument. Day 24's rule - a type parameter earns its place when it
   appears in two positions. */

import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delayMs);

        /* The cleanup is the debounce. Every change to `value` re-runs the
           effect, and the cleanup cancels the previous timer before the new
           one is set - so only the last change in a burst survives.

           Written without the cleanup this is not a slow debounce, it is no
           debounce at all: every keystroke would schedule its own timer and
           every one would fire. */
        return () => clearTimeout(timer);
    }, [value, delayMs]);

    return debounced;
}
