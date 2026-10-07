/* Day 36 - the route table.

   The whole shape of the app, in one readable block - which is the thing
   routing gives that Week 7's single page did not. */

import { BrowserRouter, Navigate, Route, Routes } from "react-router";

import { ListProvider } from "./state/ListContext";
import { Layout } from "./routes/Layout";
import { SearchRoute } from "./routes/SearchRoute";
import { ListRoute } from "./routes/ListRoute";
import { AddRoute } from "./routes/AddRoute";
import { BookRoute } from "./routes/BookRoute";
import { NotFound } from "./routes/NotFound";

export function App() {
    return (
        /* BrowserRouter uses the real URL and the History API, which needs the
           server to serve index.html for every path. On a static host that is
           one rewrite rule, and getting it wrong is why a deployed SPA 404s on
           refresh - which is Day 39's problem and worth knowing about now.

           HashRouter (`/#/list`) needs no server configuration at all and is
           the fallback when rewrites are not possible. The URLs are uglier and
           the fragment never reaches the server. */
        <BrowserRouter>
            {/* The provider is outside the routes, so the list survives
                navigation. Inside a route it would unmount on every change and
                the state would be re-read from storage each time. */}
            <ListProvider>
                <Routes>
                    {/* A layout route: no path of its own, renders Layout, and
                        its children appear in Layout's <Outlet />. */}
                    <Route element={<Layout />}>
                        {/* `index` is the child that matches the parent's path
                            exactly - here, "/". */}
                        <Route index element={<SearchRoute />} />

                        <Route path="list" element={<ListRoute />} />
                        <Route path="add" element={<AddRoute />} />

                        {/* `:id` is a route parameter. useParams() reads it. */}
                        <Route path="book/:id" element={<BookRoute />} />

                        {/* A redirect, for a path people will guess. `replace`
                            keeps it out of the history, so Back does not
                            bounce straight here again. */}
                        <Route path="books" element={<Navigate to="/list" replace />} />

                        {/* The wildcard, last. Routes are not ordered by
                            specificity by default in v6+ - the router ranks
                            them - but keeping `*` last is still how the file
                            reads correctly. */}
                        <Route path="*" element={<NotFound />} />
                    </Route>
                </Routes>
            </ListProvider>
        </BrowserRouter>
    );
}
