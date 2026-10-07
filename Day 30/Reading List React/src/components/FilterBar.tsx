/* The controls: a text filter, the status filters and a sort.

   Owns nothing. All three values are App's state, passed down with their
   setters, because the list and the count both need them. */

import type { ChangeEvent } from "react";
import { type Filter, type Sort, FILTERS, SORTS, STATUS_LABELS, isSort } from "../data";

interface FilterBarProps {
    readonly query: string;
    readonly onQueryChange: (query: string) => void;
    readonly filter: Filter;
    readonly onFilterChange: (filter: Filter) => void;
    readonly sort: Sort;
    readonly onSortChange: (sort: Sort) => void;
    readonly shown: number;
    readonly total: number;
}

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

export function FilterBar({
    query,
    onQueryChange,
    filter,
    onFilterChange,
    sort,
    onSortChange,
    shown,
    total
}: FilterBarProps) {
    function handleSort(event: ChangeEvent<HTMLSelectElement>): void {
        if (isSort(event.target.value)) onSortChange(event.target.value);
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
                        onChange={(event) => onQueryChange(event.target.value)}
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
