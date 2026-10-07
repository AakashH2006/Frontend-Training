/* Day 34 - the search panel, with the effect gone.

   Day 33's version of this file was 160 lines: the effect, the four-state
   union, the form, the skeletons, the error box and the results. Two different
   jobs in one file, and I could not change the markup without reading the
   race-condition logic.

   This is markup and one hook call:

       const { state, retry } = useBookSearch(query);

   The abort, the ignore flag, the four-state union and the retry counter are
   all still there - in useBookSearch.ts, where they can be read without the
   JSX around them. Nothing was redesigned; the effect moved. */

import { useState } from "react";
import type { SearchHit } from "../lib/api";
import { useBookSearch, type SearchState } from "../hooks/useBookSearch";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";

interface SearchPanelProps {
    readonly savedIds: ReadonlySet<string>;
    readonly onSave: (hit: SearchHit) => void;
}

export function SearchPanel({ savedIds, onSave }: SearchPanelProps) {
    /* `text` is what is in the box; `query` is what has been asked for.
       Keeping them separate is still the reason the hook fires one request per
       submit rather than one per keystroke - that decision stayed in the
       component, because it is about this form and not about searching. */
    const [text, setText] = useState("");
    const [query, setQuery] = useState("");

    const { state, retry } = useBookSearch(query);

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

            <Results state={state} savedIds={savedIds} onSave={onSave} onRetry={retry} />
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
