/* Day 34 - online status, with the right hook.

   The obvious version is useState plus an effect with two listeners. It works.
   This uses `useSyncExternalStore` instead, which is the hook built for
   exactly this shape of problem: a value that lives outside React, changes
   without React's involvement, and has a subscribe/unsubscribe API.

   Why it is better than the effect version:

     - No duplicated state. The effect version keeps a copy of
       `navigator.onLine` in useState, which can be one render out of date.
       This reads the real value when React needs it.
     - It is correct under concurrent rendering, where an effect-based copy can
       be read mid-render in a stale state (a "tearing" bug).
     - The server snapshot is a separate argument, so there is one obvious
       place for the "what is true before hydration" answer. */

import { useSyncExternalStore } from "react";

/* Both defined outside the hook so they are stable references. If `subscribe`
   were recreated on every render, useSyncExternalStore would unsubscribe and
   resubscribe every time - the same identity trap as a dependency array. */
function subscribe(onChange: () => void): () => void {
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);

    return () => {
        window.removeEventListener("online", onChange);
        window.removeEventListener("offline", onChange);
    };
}

function getSnapshot(): boolean {
    return navigator.onLine;
}

/* Used when the markup is rendered on a server, where there is no navigator.
   Assuming online is the right default: it is what the page will be in a
   moment, and it avoids rendering an "offline" warning that immediately
   disappears. */
function getServerSnapshot(): boolean {
    return true;
}

export function useOnlineStatus(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
