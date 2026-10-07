/* Day 41 - the application's providers.

   This file is what the old AppModule shrank to. An NgModule declared
   components, imported other modules and provided services; standalone
   components declare their own imports, so all that is left to configure
   centrally is the providers - the things there should be exactly one of per
   application.

   Today there is one. Day 47 is where this file earns its name. */

import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';

export const appConfig: ApplicationConfig = {
    providers: [
        /* Attaches listeners for `error` and `unhandledrejection` and routes
           them through Angular's ErrorHandler.

           Day 18 added exactly this by hand - `window.addEventListener
           ("unhandledrejection", ...)` - for exactly the same reason: a
           rejected promise with no catch is the async version of an uncaught
           error, except nothing stops and nothing looks broken. */
        provideBrowserGlobalErrorListeners()
    ]
};
