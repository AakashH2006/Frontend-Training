/* Day 56 - the guards.

   A guard is a FUNCTION that returns one of:

       boolean           let the navigation through, or stop it dead
       UrlTree           stop it and go somewhere else instead
       Promise<…>        the above, later
       Observable<…>     the above, later, and cancellable

   That is the whole API, and the function shape is new since the NgModule
   days: a guard used to be a class implementing `CanActivate`, provided in a
   module, and referenced by type. `CanActivateFn` is a function, `inject()`
   works inside it because it runs in an injection context, and it goes
   straight into the route table as a value. Same change as `HttpInterceptorFn`
   on Day 52, for the same reason.

   The two kinds here are genuinely different problems and only one of them is
   about permission.

   `canActivate` answers "may this page be shown", which is a question about
   the APP's state - and a guard is not a security boundary, in this app or any
   other. It decides what to render. The data behind a route is protected by
   whatever answers the request.

   `canDeactivate` answers "may this page be left", which is a question about
   the COMPONENT's state - and is the one I find more interesting, because
   nothing else in Angular can ask it. The component knows it has unsaved
   changes; the router is about to destroy it; the guard is the only place those
   two facts meet. */

import { inject } from '@angular/core';
import { Router, type CanActivateFn, type CanDeactivateFn } from '@angular/router';
import { type Observable } from 'rxjs';

import { ConfirmService } from './confirm.service';
import { SessionService } from './session.service';

/* ---- canActivate ---- */

/* `redirectTo` on a route cannot do this, because the destination depends on
   where the user was going: /settings has to come back after signing in, and
   the only way to carry that is a query parameter.

   Returning a `UrlTree` rather than calling `router.navigate(...)` and
   returning false. Both appear to work; they are not the same thing - and the
   reason they differ is not the reason I first wrote down here.

   WHAT I WROTE FIRST was that a UrlTree is one navigation while navigate-then-
   false is two. That is wrong, and routes.spec.ts now measures it: both
   produce the same seventeen router events in the same order, two
   NavigationStarts and a NavigationCancel among them. A redirect from a guard
   is two navigations either way. I had repeated something I had read.

   THE REAL DIFFERENCE is what the router tells the caller, and it is sharper
   than the thing I made up:

       returning a UrlTree       navigateByUrl resolves TRUE
                                 NavigationCancel.code = Redirect

       navigate() + false        navigateByUrl resolves FALSE
                                 NavigationCancel.code =
                                     SupersededByNewNavigation

   Both measured. The `true` is the important one: a redirect is a navigation
   that SUCCEEDED, somewhere else, and anything awaiting the result can carry
   on. The naive version reports a failure for a redirect that worked, which
   any caller shaped like `if (!(await router.navigate(...)))` will show the
   user an error about.

   And the cancellation code is the router describing the bug exactly:
   SupersededByNewNavigation, not GuardRejected, because a guard that starts
   its own navigation is overtaking the one it was asked about.

   The practical reason, which holds regardless: a tree can carry query
   parameters built from `state.url`, so the returnUrl is part of the
   destination rather than something the guard has to arrange separately. */
/* The first parameter is the ACTIVATED ROUTE SNAPSHOT and it is unused, named
   with an underscore so that `noUnusedParameters` lets it through - which it
   did not, and the resulting TS6133 is worth a sentence. The snapshot is the
   obvious place to look for the URL and is the wrong one: it describes the
   single route being activated, so `route.url` for /settings is the segment
   list ["settings"] with no query string anywhere in it. The state has the
   whole thing. */
export const signedInGuard: CanActivateFn = (_route, state) => {
    const session = inject(SessionService);
    const router = inject(Router);

    if (session.signedIn()) return true;

    /* `state.url` is the WHOLE url the user asked for, including its query
       string - which is the reason to take it from the state rather than
       rebuilding it from `route.url`. A returnUrl that loses `?page=3` sends
       people back to a different page than the one they wanted. */
    return router.createUrlTree(['/sign-in'], {
        queryParams: { returnUrl: state.url }
    });
};

/* ---- canDeactivate ---- */

/* The contract a guarded component implements.

   An interface rather than a class or a base component, because the guard only
   needs one question answered and anything more would couple the router's
   configuration to a class hierarchy. `CanDeactivateFn<T>` is generic over the
   component type, so the route table is where the two are connected and
   neither side imports the other. */
export interface CanLeave {
    canLeave(): boolean;
    /* What to say if it cannot. The component knows what is unsaved; the guard
       does not, and a generic "you have unsaved changes" is the kind of
       message that gets clicked through. */
    leaveWarning(): string;
}

export const unsavedChangesGuard: CanDeactivateFn<CanLeave> = (component): Observable<boolean> | boolean => {
    /* A component can be null here - the signature allows it, because a guard
       can run when there is nothing left to ask. Returning true is the only
       safe answer: refusing a navigation away from a component that does not
       exist would strand the user. */
    if (component === null || component === undefined) return true;

    if (component.canLeave()) return true;

    const confirm = inject(ConfirmService);

    /* The asynchronous answer, and the reason the service exists. The router
       subscribes to this and the navigation sits in 'in progress' until it
       emits - which is observable behaviour and is tested rather than assumed:
       the URL does not change while the dialog is open. */
    return confirm.ask({
        title: 'Leave this page?',
        body: component.leaveWarning(),
        confirmLabel: 'Discard and leave',
        cancelLabel: 'Keep editing'
    });
};
