/* Day 51 - the providers, with the router in them.

   Day 36's first observation about React Router was that the provider goes
   OUTSIDE the routes: <BrowserRouter> has to wrap the tree, which means the
   top of the app is a component whose job is configuration.

   Angular has no such component. `provideRouter` is a provider, the route
   table is data passed to it, and `<router-outlet>` is a directive in whatever
   template wants it. Nothing wraps anything. That is the cleanest comparison
   between the two frameworks I have found so far, and it is the same
   difference as Week 7's context provider versus `providedIn: 'root'`. */

import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './routes';
import { SuffixTitleStrategy } from './title-strategy';
import { LIST_OPTIONS } from './tokens';

export const appConfig: ApplicationConfig = {
    providers: [
        provideBrowserGlobalErrorListeners(),

        /* The router, its routes, and one feature.

           `withComponentInputBinding()` is the one that changed how the pages
           are written. With it, the router sets a component's inputs from the
           path parameters, the query parameters and the route data, matching
           by name. Without it, every page starts with

               private readonly route = inject(ActivatedRoute);
               readonly id = toSignal(this.route.paramMap.pipe(map(...)));

           and a page is then impossible to render without a router. With it,
           a page is a component with inputs, and the router is one of the
           things that can set them - a test is another. It is opt-in for
           backwards compatibility and I would turn it on in any new app.

           The features are composable `with...()` calls rather than a config
           object, which is the same shape as `provideHttpClient(withFetch())`
           on Day 52 and is how Angular keeps the unused ones out of the
           bundle. */
        provideRouter(routes, withComponentInputBinding()),

        /* Replacing a framework service, which Day 47 said was the point of
           tokens and classes being injectable. The router asks for a
           `TitleStrategy`; this says which one it gets. */
        { provide: TitleStrategy, useClass: SuffixTitleStrategy },

        { provide: LIST_OPTIONS, useValue: { seedWhenEmpty: true, maxBooks: 50 } }
    ]
};
