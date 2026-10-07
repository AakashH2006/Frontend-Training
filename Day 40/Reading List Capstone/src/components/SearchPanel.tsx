/* Day 36 - the search panel, now fully controlled.

   Day 34's version owned `text` and `query` itself. The route owns them now,
   because the query lives in the URL - so this component holds no state at all
   and is a function of its props.

   That is the third time a component has lost state this fortnight and been
   easier to follow for it. It is also what makes it testable without a router:
   pass `query`, assert on what renders. */

import type { FormEvent } from "react";
import type { SearchHit } from "../lib/api";
import { useBookSearch, type SearchState } from "../hooks/useBookSearch";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";

interface SearchPanelProps {
    /* The submitted query - from the URL. Drives the fetch. */
    readonly query: string;
    /* What is in the box. Changes on every keystroke and does not fetch. */
    readonly text: string;
    readonly onTextChange: (text: string) => void;
    readonly onSubmit: (text: string) => void;
    readonly savedIds: ReadonlySet<string>;
    readonly onSave: (hit: SearchHit) => void;
}

export function SearchPanel({
    query,
    text,
    onTextChange,
    onSubmit,
    savedIds,
    onSave
}: SearchPanelProps) {
    /* The hook still fires one request per submitted query, because `query`
       only changes on submit. That decision moved to the route along with the
       state, and the hook did not notice. */
    const { state, retry } = useBookSearch(query);

    function handleSubmit(event: FormEvent<HTMLFormElement>): void {
        event.preventDefault();
        onSubmit(text);
    }

    return (
        <>
            <form onSubmit={handleSubmit} noValidate>
                <div className="toolbar">
                    <div className="field">
                        <label htmlFor="search-query">Search Open Library</label>
                        <input
                            id="search-query"
                            type="search"
                            value={text}
                            onChange={(event) => onTextChange(event.target.value)}
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
