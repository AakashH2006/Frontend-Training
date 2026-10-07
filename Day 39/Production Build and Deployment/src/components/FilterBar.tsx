/* Day 32 - the controls, with no props at all.

   Day 31 passed eight: three values, three setters and two numbers. Every one
   of them came from App and was used only here, which is the definition of
   plumbing. Now the component asks for what it needs. */

import type { ChangeEvent } from "react";
import { FILTERS, SORTS, STATUS_LABELS, isSort, type Filter, type Sort } from "../data";
import { useListDispatch, useListView, useVisibleBooks } from "../state/ListContext";

const FILTER_LABELS: Record<Filter, string> = {
    all: "All",
    unread: STATUS_LABELS.unread,
    reading: STATUS_LABELS.reading,
    finished: STATUS_LABELS.finished
};

const SORT_LABELS: Record<Sort, string> = {
    added: "Recently added",
    title: "Title",
    author: "Author",
    year: "Year published"
};

export function FilterBar() {
    const dispatch = useListDispatch();
    const { query, filter, sort, total } = useListView();
    const shown = useVisibleBooks().length;

    function handleSort(event: ChangeEvent<HTMLSelectElement>): void {
        if (isSort(event.target.value)) {
            dispatch({ type: "sort/changed", sort: event.target.value });
        }
    }

    return (
        <>
            <div className="toolbar">
                <div className="field">
                    <label htmlFor="list-query">Filter your list</label>
                    <input
                        id="list-query"
                        type="search"
                        value={query}
                        onChange={(event) => dispatch({ type: "query/changed", query: event.target.value })}
                        placeholder="title or author"
                        autoComplete="off"
                    />
                </div>

                <div className="field">
                    <label htmlFor="list-sort">Sort by</label>
                    <select id="list-sort" value={sort} onChange={handleSort}>
                        {SORTS.map((option) => (
                            <option key={option} value={option}>
                                {SORT_LABELS[option]}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <ul className="filters">
                {FILTERS.map((option) => (
                    <li key={option}>
                        <button
                            type="button"
                            className="button button--quiet button--small filter"
                            aria-pressed={option === filter}
                            onClick={() => dispatch({ type: "filter/changed", filter: option })}
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
