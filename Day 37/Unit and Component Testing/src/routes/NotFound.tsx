/* The wildcard route.

   Without this, an unmatched path renders *nothing* - no error, no message,
   just the shell with an empty main. That is the worst failure mode available,
   because it looks like a loading state that never finishes. */

import { Link } from "react-router";
import { Panel } from "../components/Panel";
import { EmptyState } from "../components/EmptyState";

export function NotFound() {
    return (
        <Panel id="notfound" title="Page not found">
            <EmptyState message="There is nothing at that address.">
                <p className="text-sm">
                    <Link to="/">Go back to the search</Link>, or try{" "}
                    <Link to="/list">your list</Link>.
                </p>
            </EmptyState>
        </Panel>
    );
}
