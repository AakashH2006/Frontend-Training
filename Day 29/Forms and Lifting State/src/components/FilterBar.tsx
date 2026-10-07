/* The controls, lifted.

   This component is the "lifting state up" lesson in its smallest form. It
   owns nothing: the query and the status filter are App's state, passed down
   as a value and a setter.

   Why they are not local: two siblings need them. FilterBar sets the query,
   and the list below renders the filtered result - and the count in the
   heading needs it too. A `query` inside FilterBar would be invisible to both.
   Their closest common parent is App. */

import { type Filter, FILTERS, STATUS_LABELS } from "../data";

interface FilterBarProps {
    readonly query: string;
    readonly onQueryChange: (query: string) => void;
    readonly filter: Filter;
    readonly onFilterChange: (filter: Filter) => void;
    /* Passed in rather than computed here, because App has already computed it
       for the heading and recomputing it would be a second copy of one fact. */
    readonly shown: number;
    readonly total: number;
}

const FILTER_LABELS: Record<Filter, string> = {
    all: "All",
    unread: STATUS_LABELS.unread,
    reading: STATUS_LABELS.reading,
    finished: STATUS_LABELS.finished
};

export function FilterBar({
    query,
    onQueryChange,
    filter,
    onFilterChange,
    shown,
    total
}: FilterBarProps) {
    return (
        <>
            <div className="toolbar">
                <div className="field">
                    <label htmlFor="list-query">Filter your list</label>
                    <input
                        id="list-query"
                        type="search"
                        value={query}
                        onChange={(event) => onQueryChange(event.target.value)}
                        placeholder="title or author"
                        autoComplete="off"
                    />
                </div>
            </div>

            <ul className="filters">
                {FILTERS.map((option) => (
                    <li key={option}>
                        <button
                            type="button"
                            className="button button--quiet button--small filter"
                            /* aria-pressed is the real state of a toggle
                               button, and the stylesheet hangs off the
                               attribute rather than a class - so there is one
                               source of truth for "this filter is active". */
                            aria-pressed={option === filter}
                            onClick={() => onFilterChange(option)}
                        >
                            {FILTER_LABELS[option]}
                        </button>
                    </li>
                ))}
            </ul>

            <p className="text-sm text-muted" id="shown-count">
                Showing {shown} of {total}.
            </p>
        </>
    );
}
