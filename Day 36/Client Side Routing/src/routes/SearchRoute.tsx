/* Day 36 - the search route, with the query in the URL.

   This fixes the last item on Week 7's list of known limitations: "search
   state is lost on navigation, because it lives in a hook in one component".

   `useSearchParams` moves the query out of `useState` and into the address
   bar, which gets four things at once:

     - navigating to the list and back keeps the results
     - the back button steps through searches
     - a search is a shareable link
     - a reload re-runs the same search

   None of those needed extra code. They are what the URL already does, and
   Week 7 was storing the query somewhere that threw them away. */

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

import { Panel } from "../components/Panel";
import { SearchPanel } from "../components/SearchPanel";
import { useListDispatch, useListView } from "../state/ListContext";
import { bookSavedFromSearch } from "../state/reducer";

export function SearchRoute() {
    const dispatch = useListDispatch();
    const { savedIds } = useListView();

    const [searchParams, setSearchParams] = useSearchParams();

    /* The URL is the source of truth for the submitted query. `?? ""` because
       `get` returns `string | null` when the parameter is absent - the same
       nullable-boundary shape as `getElementById`, and TypeScript makes it
       just as unmissable. */
    const query = searchParams.get("q") ?? "";

    /* The input still needs its own state, because the URL should change on
       submit and not on every keystroke. A URL that updates per character
       fills the history with 20 entries for one search and makes the back
       button useless. */
    const [text, setText] = useState(query);

    /* And this is the one effect on the page, with a real justification: when
       the query in the URL changes from outside this component - a back
       button, a pasted link, a reload - the input has to catch up.

       It is "synchronising with something outside React" in the Day 33 sense,
       because the history stack genuinely is outside React. The alternative
       considered and rejected was a `key` on the input keyed by `query`,
       which resets it correctly but also steals focus mid-typing. */
    useEffect(() => {
        setText(query);
    }, [query]);

    function submit(next: string): void {
        const trimmed = next.trim();

        /* `replace: false` is the default and is what makes the back button
           step through searches. `setSearchParams({})` rather than deleting
           the key leaves a clean `/` when the box is emptied. */
        setSearchParams(trimmed.length === 0 ? {} : { q: trimmed });
    }

    return (
        <Panel id="search" title="Search Open Library">
            <SearchPanel
                query={query}
                text={text}
                onTextChange={setText}
                onSubmit={submit}
                savedIds={savedIds}
                onSave={(hit) => dispatch(bookSavedFromSearch(hit))}
            />
        </Panel>
    );
}
