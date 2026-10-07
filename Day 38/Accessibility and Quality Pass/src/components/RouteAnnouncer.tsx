/* Day 38 - telling a screen reader that the route changed.

   The single biggest accessibility problem with client-side routing, and it is
   invisible if you only use a mouse.

   In a server-rendered site, following a link loads a new document: the screen
   reader announces the new page and focus returns to the top. A client-side
   router does neither. The URL changes, the DOM is swapped, and from an
   assistive technology's point of view *nothing happened* - focus is still on
   the link that was clicked, which may no longer exist, and no new content was
   announced.

   So a routed app has to do by hand what the browser used to do for free:
   announce the new page, and move focus somewhere sensible. */

import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";

/* A visually hidden live region. Empty on mount, and given the page name after
   each navigation - a live region announces *changes* to its contents, so text
   that was there all along is never read out.

   `aria-live="polite"` rather than "assertive": the announcement waits for a
   gap rather than interrupting whatever is being read. */
export function RouteAnnouncer({ title }: { readonly title: string }) {
    const location = useLocation();
    const [message, setMessage] = useState("");
    const first = useRef(true);

    useEffect(() => {
        if (first.current) {
            /* Nothing on the first render: the browser has already announced
               the document, and a duplicate is noise. */
            first.current = false;
            return;
        }

        setMessage(`${title} page`);
    }, [location.key, title]);

    /* `location.key` rather than `location.pathname`, so navigating to the
       same path twice - resubmitting a search, clicking the current nav link -
       still announces. The key changes on every history entry. */

    return (
        <div className="visually-hidden" role="status" aria-live="polite" id="route-announcer">
            {message}
        </div>
    );
}


/* Move focus to the main region after a navigation.

   This hook has to be called from a component that SURVIVES the navigation -
   the layout - and that is the whole lesson of the file.

   My first version called it inside each route component and returned a ref
   for that route's heading. It never fired, and a test caught it: a route
   component is unmounted and remounted when the route changes, so its
   `first.current` ref was a fresh `true` every time and the guard skipped
   every navigation. The code read correctly and did nothing.

   The layout persists across route changes, so its ref persists too. Focusing
   `<main>` rather than each route's heading also removes the per-route
   plumbing: one component owns focus, and routes do not have to opt in. */
export function useFocusMainOnRouteChange() {
    const location = useLocation();
    const mainRef = useRef<HTMLElement | null>(null);
    const first = useRef(true);

    useEffect(() => {
        if (first.current) {
            /* Not on arrival. Pulling focus out of the address bar when
               someone has just typed a URL is worse than the problem. */
            first.current = false;
            return;
        }

        mainRef.current?.focus();
    }, [location.key]);

    return mainRef;
}
