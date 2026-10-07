/* Day 34 - the Day 33 effect, extracted.

   This file is the whole argument for custom hooks. Day 33's SearchPanel was
   160 lines: the effect, the four-state union, the form, the skeletons, the
   error box and the results. Two different jobs in one file, and I could not
   change the markup without reading the race-condition logic.

   What moved here: the state machine and the effect.
   What stayed in the component: the markup.

   Nothing was redesigned. The effect below is the Day 33 effect, line for
   line - which is what makes this a refactor rather than a rewrite, and why
   the behaviour did not need re-testing from scratch. */

import { useEffect, useState } from "react";
import { SearchError, searchBooks, type SearchHit } from "../lib/api";

/* The union is exported, because the component switches on it. The *state* is
   not exported as a setter - a caller can read the phase and call `retry`, and
   that is the entire API. Day 32's "keep the provider API small", applied to a
   hook. */
export type SearchState =
    | { readonly phase: "idle" }
    | { readonly phase: "loading"; readonly query: string }
    | {
          readonly phase: "success";
          readonly query: string;
          readonly hits: readonly SearchHit[];
          readonly total: number;
      }
    | { readonly phase: "empty"; readonly query: string }
    | { readonly phase: "failed"; readonly query: string; readonly message: string };

export interface BookSearch {
    readonly state: SearchState;
    readonly retry: () => void;
}

/* A custom hook is a function whose name begins with `use` and which calls
   other hooks. That is all it is - there is no registration and no special
   kind of function. The naming convention is what the linter and React's own
   rules-of-hooks checking rely on, which is why it is a convention worth
   keeping exactly.

   And it is not shared state. Two components calling useBookSearch get two
   independent state machines, because the useState inside belongs to the
   calling component. That is the difference from the context in Day 32, and
   it is the thing I expected to be the other way round. */
export function useBookSearch(query: string): BookSearch {
    const [state, setState] = useState<SearchState>({ phase: "idle" });
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (query.length === 0) {
            setState({ phase: "idle" });
            return;
        }

        const controller = new AbortController();
        let ignore = false;

        setState({ phase: "loading", query });

        void (async () => {
            try {
                const result = await searchBooks(query, controller.signal);
                if (ignore) return;

                setState(
                    result.hits.length === 0
                        ? { phase: "empty", query }
                        : { phase: "success", query, hits: result.hits, total: result.total }
                );
            } catch (error) {
                if (ignore) return;
                // An abort is not a failure: a newer run is already in flight.
                if (error instanceof DOMException && error.name === "AbortError") return;

                setState({
                    phase: "failed",
                    query,
                    message:
                        error instanceof SearchError
                            ? error.message
                            : "Something went wrong with that search."
                });
            }
        })();

        return () => {
            ignore = true;
            controller.abort();
        };
    }, [query, attempt]);

    return { state, retry: () => setAttempt((n) => n + 1) };
}
