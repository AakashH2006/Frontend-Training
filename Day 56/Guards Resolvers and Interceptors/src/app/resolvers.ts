/* Day 56 - the resolver, and the wart it was written to fix.

   `routes.spec.ts` has had this test since Day 54:

       it('still titles every contact page the same, which a resolver will fix')
       expect(Title.getTitle()).toBe('Contact | Day 55 | …');
       expect(Title.getTitle()).not.toContain('Ada');

   A comment cannot tell me when something is fixed; a passing test that
   asserts the wrong behaviour fails the day it stops being true. That is what
   happened today, and the failing test is the only reason I did not forget.

   WHY A RESOLVER IS RIGHT HERE, when I argued on Day 55 that pages should
   fetch their own data.

   A route's `title` is applied by the `TitleStrategy` during navigation, from
   the route snapshot. The component is not involved and cannot be: by the time
   it has a record to be named after, the title has already been set. So this
   is not a choice between a resolver and a component fetch - the component has
   no way to do it at all. Setting `document.title` from inside the component
   would work and would put the browser tab's contents in two places, which is
   exactly what `TitleStrategy` exists to prevent.

   `ResolveFn<string>` as the route's `title` is the narrow version of a
   resolver: it resolves ONE string that only the router needs. The broad
   version - resolving the whole contact and handing it to the component - is
   measured and rejected in the notes, because it delays the navigation itself
   and replaces a loading state the app already renders well. */

import { inject } from '@angular/core';
import { type ResolveFn } from '@angular/router';
import { catchError, map, of, type Observable } from 'rxjs';

import { ContactsApi } from './contacts.api';

/* The record's name, or a fallback.

   `catchError` is not optional here and the reason is the interesting part. A
   resolver that ERRORS CANCELS THE NAVIGATION - the router treats a failed
   resolve as a failed navigation, so the user stays where they were and
   nothing explains why. For a title that is absurd: a 404 on the contact must
   still land on the detail page, because that page's whole job is to say "no
   such contact".

   So the failure is swallowed and the generic title used. The page itself
   fetches the record again and reports the 404 properly, which means the
   duplicate request below is deliberate rather than overlooked. */
export const contactTitleResolver: ResolveFn<string> = (route): Observable<string> => {
    const id = route.paramMap.get('id');

    if (id === null) return of('Contact');

    /* `ContactsApi` rather than `ContactsService`.

       The service's list pipeline starts when a page sets a query, and
       injecting it from a resolver - which runs before any component exists -
       would be a request for a list nobody is looking at. Day 55 removed
       exactly that request after the router spec found it; reintroducing it
       here through the back door would be a quiet regression. A resolver wants
       one fact and should ask for one fact. */
    const api = inject(ContactsApi);

    return api.get(id).pipe(
        map((contact) => contact.name),
        catchError(() => of('Contact'))
    );
};

/* The edit route's title, built from the same request.

   `Editing Ada Lovelace` rather than `Ada Lovelace`, because a tab is the one
   place where "which of my six open tabs is the form" is a real question. */
export const editTitleResolver: ResolveFn<string> = (route, state) =>
    (contactTitleResolver(route, state) as Observable<string>).pipe(
        map((name) => (name === 'Contact' ? 'Edit contact' : `Editing ${name}`))
    );
