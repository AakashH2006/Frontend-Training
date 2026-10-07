/* Day 40 - the React mini-capstone.

   App is three decisions and nothing else: which router, where the provider
   goes, and what the base path is. The route table moved to AppRoutes on
   Day 40 so the tests can render it under a MemoryRouter.

       App
       └── BrowserRouter  basename from the build's base path
           └── ListProvider  outside the routes, so state survives navigation
               └── AppRoutes
                   └── Layout            header, nav, announcer, <Outlet/>
                       ├── "/"           SearchRoute   query in the URL
                       ├── "/list"       ListRoute
                       ├── "/add"        AddRoute
                       ├── "/book/:id"   BookRoute
                       ├── "/books"      -> /list
                       └── "*"           NotFound
*/

import { BrowserRouter } from "react-router";

import { ListProvider } from "./state/ListContext";
import { AppRoutes } from "./routes/AppRoutes";

export function App() {
    return (
        /* `basename` is what makes a subdirectory deployment work. Without it
           the assets load, the app renders, and every route falls through to
           the wildcard - because the router sees "/repo/list" and its routes
           are "/list". `import.meta.env.BASE_URL` is whatever `base` was at
           build time, so one line covers the dev server, a domain root and a
           project page.

           BrowserRouter needs the host to serve index.html for every path.
           That is a rewrite rule on Netlify and Vercel, and the 404.html pair
           in public/ on GitHub Pages. */
        <BrowserRouter basename={import.meta.env.BASE_URL}>
            {/* Outside the routes, deliberately. Inside one, the provider
                would unmount on every navigation and the list would be
                re-read from storage each time. */}
            <ListProvider>
                <AppRoutes />
            </ListProvider>
        </BrowserRouter>
    );
}
