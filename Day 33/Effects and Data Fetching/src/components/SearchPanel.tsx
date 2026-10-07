/* Day 33 - an effect that fetches.

   The effect is written out here rather than hidden in a hook, because today
   is about understanding it. Day 34 extracts it, and the diff between the two
   files is the point of Day 34.

   The four request states are a discriminated union rather than three
   booleans, which is Week 5's lesson and the reason `hits` exists only on the
   member that has hits. `loading && error` and `success && !hits` are not
   states this can be in. */

import { useEffect, useState } from "react";
import { SearchError, searchBooks, type SearchHit } from "../lib/api";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";

type SearchState =
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

interface SearchPanelProps {
    readonly savedIds: ReadonlySet<string>;
    readonly onSave: (hit: SearchHit) => void;
}

export function SearchPanel({ savedIds, onSave }: SearchPanelProps) {
    /* Two pieces of state with different jobs:

       `text`  - what is in the box. Changes on every keystroke.
       `query` - what has been asked for. Changes when the form is submitted.

       Keeping them separate is what makes the effect's dependency honest. If
       the effect depended on `text` it would fire a request per character, and
       the fix for that would be a debounce *inside* the effect - which is a
       timer that then also needs cleaning up. Submitting is simpler and it is
       what the API's rate limit wants anyway. */
    const [text, setText] = useState("");
    const [query, setQuery] = useState("");
    const [state, setState] = useState<SearchState>({ phase: "idle" });
    /* Bumped by the Retry button. It is in the dependency array, so changing
       it re-runs the effect even when the query is identical - which a second
       `setQuery(query)` would not do, because setting state to the same value
       is a no-op. */
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        /* An empty query is not a request. Returning early means no fetch and
           no cleanup, which is correct: there is nothing to clean up. */
        if (query.length === 0) {
            setState({ phase: "idle" });
            return;
        }

        /* One controller per effect run. The cleanup below aborts it, so a
           request belonging to a superseded run cannot land. */
        const controller = new AbortController();

        /* The `ignore` flag as well as the abort, and both are needed:

           - `abort` stops the request and makes `fetch` reject with
             AbortError. That handles the network.
           - `ignore` stops a `setState` from a run that has already been
             cleaned up. An abort is not instantaneous, and a response that
             arrived in the same tick as the cleanup would otherwise still
             call setState.

           Without `ignore` this is the stale-response race from Day 18: a slow
           first search landing after a fast second one and overwriting it,
           with no error anywhere and the user seeing results for a query they
           have already replaced. */
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

                /* An abort is not a failure - a newer run is already in
                   flight, or the component has gone. Showing an error here is
                   the commonest bug in hand-written fetch effects. */
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

        /* The cleanup. React runs it before the next effect run and when the
           component unmounts - and, in development, immediately after the
           first run, because StrictMode mounts, unmounts and remounts every
           component to check that effects clean up after themselves.

           That double-run is why this has to be right rather than merely
           work. An effect with no cleanup fires two requests in development
           and the second result wins by luck. */
        return () => {
            ignore = true;
            controller.abort();
        };
    }, [query, attempt]);

    return (
        <>
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    const trimmed = text.trim();
                    if (trimmed.length === 0) return;
                    setQuery(trimmed);
                }}
                noValidate
            >
                <div className="toolbar">
                    <div className="field">
                        <label htmlFor="search-query">Search Open Library</label>
                        <input
                            id="search-query"
                            type="search"
                            value={text}
                            onChange={(event) => setText(event.target.value)}
                            placeholder="dune, ursula le guin, cryptography"
                            autoComplete="off"
                        />
                    </div>
                    <Button type="submit">Search</Button>
                </div>
            </form>

            {/* role="status" is an aria-live region, so the phase is announced
                without moving focus. Day 20. */}
            <p
                className={`status${state.phase === "failed" ? " status--error" : ""}`}
                role="status"
                id="search-status"
            >
                {describePhase(state)}
            </p>

            <Results state={state} savedIds={savedIds} onSave={onSave} onRetry={() => setAttempt((n) => n + 1)} />
        </>
    );
}

function describePhase(state: SearchState): string {
    switch (state.phase) {
        case "idle":
            return "Search for a title, an author or a subject.";
        case "loading":
            return `Searching for "${state.query}"…`;
        case "success":
            return `Showing ${state.hits.length} of ${state.total} results.`;
        case "empty":
            return `Nothing matched "${state.query}".`;
        case "failed":
            return state.message;
        default: {
            const unreachable: never = state;
            throw new Error(`Unhandled phase: ${JSON.stringify(unreachable)}`);
        }
    }
}

interface ResultsProps {
    readonly state: SearchState;
    readonly savedIds: ReadonlySet<string>;
    readonly onSave: (hit: SearchHit) => void;
    readonly onRetry: () => void;
}

function Results({ state, savedIds, onSave, onRetry }: ResultsProps) {
    switch (state.phase) {
        case "idle":
            return null;

        case "loading":
            /* Skeletons in the shape of the real cards, so the layout does not
               jump when the content arrives. aria-hidden, because the status
               line already says what is happening and a list of empty boxes is
               noise. */
            return (
                <ul className="book-grid" aria-hidden="true">
                    {[0, 1, 2, 3].map((n) => (
                        <li className="book-card skeleton" key={n}>
                            <div className="skeleton__line skeleton__line--short" />
                            <div className="skeleton__line skeleton__line--long" />
                            <div className="skeleton__line skeleton__line--long" />
                        </li>
                    ))}
                </ul>
            );

        case "empty":
            return (
                <EmptyState message={`Nothing matched "${state.query}".`}>
                    <p className="text-sm">Try fewer words, or a surname on its own.</p>
                </EmptyState>
            );

        case "failed":
            return (
                <div className="error-box">
                    <p className="error-box__title">That search did not work</p>
                    <p className="error-box__body">{state.message}</p>
                    <Button small onClick={onRetry}>
                        Try again
                    </Button>
                </div>
            );

        case "success":
            return (
                <ul className="book-grid">
                    {state.hits.map((hit) => {
                        const saved = savedIds.has(hit.id);

                        return (
                            <li className="book-card" key={hit.id}>
                                <h3 className="book-card__title">{hit.title}</h3>
                                <p className="book-card__meta">
                                    {hit.authors.length === 0
                                        ? "Author unknown"
                                        : hit.authors.join(", ")}
                                </p>
                                <p className="book-card__meta">
                                    {hit.year === undefined
                                        ? "Publication year unknown"
                                        : `First published ${hit.year}`}
                                </p>
                                <p className="book-card__actions">
                                    <Button small disabled={saved} onClick={() => onSave(hit)}>
                                        {saved ? "On your list" : "Save"}
                                    </Button>
                                </p>
                            </li>
                        );
                    })}
                </ul>
            );

        default: {
            const unreachable: never = state;
            throw new Error(`Unhandled phase: ${JSON.stringify(unreachable)}`);
        }
    }
}
