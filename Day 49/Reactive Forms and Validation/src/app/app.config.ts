/* Day 47 - the providers, earning the file's name at last.

   Day 41 said "today there is one provider; Day 47 is where this file earns
   its name". This is that. */

import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';

import { LIST_OPTIONS } from './tokens';

export const appConfig: ApplicationConfig = {
    providers: [
        provideBrowserGlobalErrorListeners(),

        /* Overriding a token that already has a default.

           `LIST_OPTIONS` has a factory in tokens.ts, so this is not required -
           the app would work without it. It is here to show the layering: the
           token declares a sensible default, the application overrides it, and
           nothing that INJECTS it knows or cares which one it got.

           That is the argument for a token over an imported constant. An
           import is resolved at build time by the file that uses it; a token
           is resolved at runtime by whoever is configuring the app. */
        { provide: LIST_OPTIONS, useValue: { seedWhenEmpty: true, maxBooks: 50 } }

        /* Not provided here: ReadingListService and StorageService.

           Both use `providedIn: 'root'`, which registers them without an
           entry in any providers array - and makes them tree-shakable, which
           an entry here would not be. A service listed in `providers` is
           referenced eagerly and ships whether or not anything injects it. */
    ]
};
