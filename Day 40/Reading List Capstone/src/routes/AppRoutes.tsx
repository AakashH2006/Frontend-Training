/* Day 40 - the route table, extracted.

   This is the one piece of real refactoring in the review, and it came out of
   a note I left in the tests on Day 37:

       "The route table, repeated here rather than imported from App. That is a
        real duplication and I thought about it: importing App would pull in
        BrowserRouter, which reads the actual URL and cannot be pointed at a
        route. The alternative is extracting the <Routes> into its own
        component - which is tidier and is what Day 40 does."

   So: the routes live here, `App` provides the router, and the tests render
   this with a `MemoryRouter` instead. One table, three callers, and a route
   added in one place now appears in the tests automatically rather than
   needing to be copied into two files.

   The duplication had already drifted once - Day 38's tests and Day 36's App
   disagreed about whether `/books` existed - which is exactly the failure a
   duplicated table invites. */

import { Navigate, Route, Routes } from "react-router";

import { Layout } from "./Layout";
import { SearchRoute } from "./SearchRoute";
import { ListRoute } from "./ListRoute";
import { AddRoute } from "./AddRoute";
import { BookRoute } from "./BookRoute";
import { NotFound } from "./NotFound";

export function AppRoutes() {
    return (
        <Routes>
            {/* A layout route: no path of its own. It renders Layout, and its
                children appear in Layout's <Outlet /> - so the header, nav and
                footer are not remounted on navigation. */}
            <Route element={<Layout />}>
                {/* `index` matches the parent's path exactly - here, "/". */}
                <Route index element={<SearchRoute />} />

                <Route path="list" element={<ListRoute />} />
                <Route path="add" element={<AddRoute />} />

                {/* `:id` is a route parameter, read with useParams(). It can
                    name a book that does not exist, which BookRoute handles as
                    a state of its own rather than as an error. */}
                <Route path="book/:id" element={<BookRoute />} />

                {/* A redirect for a path people will guess. `replace` keeps it
                    out of the history, so Back does not bounce here again. */}
                <Route path="books" element={<Navigate to="/list" replace />} />

                {/* Last. The router ranks routes by specificity rather than by
                    order, but keeping the wildcard here is how the file reads
                    correctly. */}
                <Route path="*" element={<NotFound />} />
            </Route>
        </Routes>
    );
}
