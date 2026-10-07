/* Day 47 - injection tokens.

   You cannot inject a string by its type, because every string has the same
   type. An InjectionToken is an object that exists purely to be an identity
   the injector can key on.

   This is the DI concept I found least obvious, and it is the one that makes
   configuration injectable rather than imported: a test, or a second instance
   of the app, provides a different value without any file that USES it
   changing. */

import { InjectionToken } from '@angular/core';

/* `providedIn: 'root'` with a factory means the token has a default and does
   not have to appear in any providers array. Without the factory, every
   injector that needs it would have to provide it, and forgetting would be a
   runtime NullInjectorError.

   The string argument is a description used only in error messages - it is not
   the identity. Two tokens with the same description are different tokens,
   which is the whole point. */
export const STORAGE_KEY = new InjectionToken<string>('reading list storage key', {
    providedIn: 'root',
    factory: () => 'day49.readingList'
});

/* A second token, to show the pattern with something that is not a string.
   `app.config.ts` overrides this one, which is the demonstration: the default
   is here, the application's choice is there, and nothing that injects it
   knows either. */
export interface ListOptions {
    readonly seedWhenEmpty: boolean;
    readonly maxBooks: number;
}

export const LIST_OPTIONS = new InjectionToken<ListOptions>('reading list options', {
    providedIn: 'root',
    factory: () => ({ seedWhenEmpty: true, maxBooks: 100 })
});
