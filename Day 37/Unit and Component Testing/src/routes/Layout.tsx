/* Day 36 - the shell every route shares.

   The header, the nav and the footer are here; the route's own content goes
   into <Outlet />. That is what "nested routes" buys: the shell is rendered
   once and is not remounted when the route changes, so the storage notice and
   the online warning do not flicker on navigation. */

import { NavLink, Outlet } from "react-router";
import { useStorageNotice } from "../state/ListContext";
import { useListView } from "../state/ListContext";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

export function Layout() {
    const { notice, persistent } = useStorageNotice();
    const online = useOnlineStatus();
    const { total } = useListView();

    return (
        <div className="page">
            {/* A skip link, first in the tab order and visible only when
                focused. Week 1's work, and it matters more now there is a nav
                to tab past on every route. */}
            <a className="skip-link" href="#main">
                Skip to the main content
            </a>

            <header className="app-header">
                <h1>Reading List</h1>

                {/* <nav> with a real list, and NavLink rather than Link so the
                    current route can be marked. */}
                <nav aria-label="Main">
                    <ul className="nav">
                        <li>
                            {/* `end` means "only match this path exactly". Without
                               it, the index route's "/" would be considered active
                               on every page, because every path starts with "/". */}
                            <NavLink to="/" end className={navClass}>
                                Search
                            </NavLink>
                        </li>
                        <li>
                            <NavLink to="/list" className={navClass}>
                                Your list ({total})
                            </NavLink>
                        </li>
                        <li>
                            <NavLink to="/add" className={navClass}>
                                Add by hand
                            </NavLink>
                        </li>
                    </ul>
                </nav>

                <p
                    className={`status${notice === null && persistent ? "" : " status--error"}`}
                    role="status"
                    id="storage-note"
                >
                    {notice ??
                        (persistent
                            ? "Saved in this browser. The list will still be here after a reload."
                            : "This browser is blocking local storage, so the list will be lost on reload.")}
                </p>

                {!online && (
                    <p className="status status--error" role="status" id="offline-note">
                        You are offline. Searching will not work until the
                        connection comes back; the saved list still will.
                    </p>
                )}
            </header>

            {/* The id the skip link points at, and the landmark a screen reader
                jumps to. */}
            <main id="main">
                <Outlet />
            </main>

            <footer className="app-footer">
                <p className="text-sm text-muted">
                    Week 8, Day 36 &mdash; React Router: nested routes, a route
                    parameter, and the search query in the URL.
                </p>
            </footer>
        </div>
    );
}

/* NavLink calls its className with the link's state, so the active style comes
   from the router rather than from comparing useLocation to a string by hand.

   `aria-current="page"` is set by NavLink itself on the active link, which is
   the part that matters: the current page is announced, not just coloured. */
function navClass({ isActive }: { readonly isActive: boolean }): string {
    return isActive ? "nav__link nav__link--active" : "nav__link";
}
