/* Day 36 - adding by hand, as its own route.

   The interesting part is what happens after a successful submit: the route
   navigates away. */

import { useNavigate } from "react-router";

import { Panel } from "../components/Panel";
import { BookForm } from "../components/BookForm";
import { useListDispatch, useListView } from "../state/ListContext";
import { bookAdded } from "../state/reducer";

export function AddRoute() {
    const dispatch = useListDispatch();
    const { isDuplicate } = useListView();
    const navigate = useNavigate();

    return (
        <Panel id="add" title="Add a book by hand">
            <BookForm
                onSubmit={(draft) => {
                    dispatch(bookAdded(draft));
                    /* Navigating in an event handler, which is where it
                       belongs - it is caused by the submit. A `<Navigate>`
                       element or an effect watching the list length would both
                       be the Day 34 mistake of treating an event as a state
                       change. */
                    void navigate("/list");
                }}
                isDuplicate={isDuplicate(null)}
                submitLabel="Add to list"
            />
        </Panel>
    );
}
