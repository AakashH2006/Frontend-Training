/* Day 56 - the guards and the dialog service, in isolation.

   routes.spec.ts already tests both guards through a real router: the redirect
   happens, the returnUrl survives, the navigation hangs while a question is
   open. So why this file as well?

   Because those tests say what the ROUTER did with the answer, and these say
   what the guard ANSWERED. The difference showed up immediately: a guard
   returning a UrlTree is worth inspecting as a value - the path, the query
   parameters, the exact encoding - and through the router all of that is
   collapsed into one URL string that has already been parsed, navigated to and
   re-serialised. Here it is the object the guard built.

   `TestBed.runInInjectionContext` is what makes this possible and is the
   cheapest thing to know about functional guards. A guard is a function that
   calls `inject()`, so it needs an injection context and nothing else: no
   router, no navigation, no component. Call it, read what it returned. Day
   52's interceptors could have been tested this way too and were not, because
   I did not know this existed yet. */

import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { firstValueFrom, type Observable } from 'rxjs';

import { ConfirmService } from './confirm.service';
import { SessionService } from './session.service';
import { signedInGuard, unsavedChangesGuard, type CanLeave } from './guards';

/* The two snapshots a `CanActivateFn` is given, reduced to the parts the guard
   reads. A cast rather than a real snapshot, because constructing one means
   running a navigation - and a guard that only touches `state.url` does not
   need the other forty fields to exist. The cast is honest about that: it says
   "this guard uses one property" in the same line that supplies it. */
const snapshots = (url: string) =>
    [{} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot] as const;

describe('signedInGuard', () => {
    beforeEach(() => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            /* The guard injects Router to build a UrlTree, so a router has to
               exist - but no routes are needed, because a tree is a value and
               nothing is navigated to. An empty table is the smallest thing
               that makes `createUrlTree` work. */
            providers: [provideRouter([])]
        });

        TestBed.inject(SessionService).signOut();
    });

    const run = (url = '/settings') =>
        TestBed.runInInjectionContext(() => signedInGuard(...snapshots(url)));

    it('says yes, plainly, to somebody with a session', () => {
        TestBed.inject(SessionService).signIn('Ada');

        /* `true`, not a truthy UrlTree. A guard that returned a tree pointing
           at the same page would also "work" and would re-navigate forever. */
        expect(run()).toBe(true);
    });

    it('returns a UrlTree rather than false', () => {
        const result = run();

        expect(result).not.toBe(false);
        /* The thing routes.spec.ts cannot see: the guard's answer as an
           object, before the router has turned it into a string. */
        expect(TestBed.inject(Router).serializeUrl(result as never)).toBe(
            '/sign-in?returnUrl=%2Fsettings'
        );
    });

    it('puts the whole asked-for URL in the returnUrl, query string included', () => {
        const result = run('/settings?tab=api&latency=400');
        const serialised = TestBed.inject(Router).serializeUrl(result as never);

        /* ONE query parameter whose value is an entire URL, which is the
           reason `state.url` is read rather than `route.url`: the snapshot
           would have given the segments of this one route and dropped the
           query, so signing in would land somewhere the user never asked for.

           And the `&` inside the value is encoded, which is what makes it one
           parameter rather than three. */
        expect(serialised).toBe('/sign-in?returnUrl=%2Fsettings%3Ftab%3Dapi%26latency%3D400');
        expect(decodeURIComponent(serialised.split('returnUrl=')[1]!)).toBe(
            '/settings?tab=api&latency=400'
        );
    });

    it('does not care how the session was decided', () => {
        /* Said as a test because it is the honest limit of the feature. The
           guard asks a service whether there is a name in localStorage.
           Anybody can put one there, and this assertion is what that looks
           like: two lines of a spec are a complete bypass. It protects a page
           from being rendered, which is a UX job, and nothing else. */
        localStorage.setItem('day56.session', 'Anybody At All');
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({ providers: [provideRouter([])] });

        expect(TestBed.runInInjectionContext(() => signedInGuard(...snapshots('/settings')))).toBe(
            true
        );

        localStorage.removeItem('day56.session');
    });
});

describe('unsavedChangesGuard', () => {
    let confirm: ConfirmService;

    /* The four arguments of a `CanDeactivateFn`, of which this guard reads
       one. Same reasoning as `snapshots` above. */
    const run = (component: CanLeave | null) =>
        TestBed.runInInjectionContext(() =>
            unsavedChangesGuard(
                component as CanLeave,
                {} as ActivatedRouteSnapshot,
                {} as RouterStateSnapshot,
                {} as RouterStateSnapshot
            )
        );

    const leavable = (canLeave: boolean, warning = 'Your changes to Name will be discarded.') => ({
        canLeave: () => canLeave,
        leaveWarning: () => warning
    });

    beforeEach(() => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({ providers: [] });

        confirm = TestBed.inject(ConfirmService);
    });

    it('lets a component that has nothing to lose go, without asking', () => {
        expect(run(leavable(true))).toBe(true);
        /* And crucially does not open a dialog, which is the difference
           between a guard people read and a guard people click through. */
        expect(confirm.question()).toBeNull();
    });

    it('lets a null component go', () => {
        /* The signature allows null and the reason is worth stating: a guard
           can run when there is nothing left to ask. Refusing would strand the
           user on a page that no longer exists. */
        expect(run(null)).toBe(true);
        expect(confirm.question()).toBeNull();
    });

    it('asks the component for the wording', () => {
        run(leavable(false, 'Your changes to Email and Note will be discarded.'));

        /* The guard contributes the title and the buttons; the component
           contributes the sentence, because only it knows what is unsaved. A
           guard writing this message could only have managed "you have unsaved
           changes". */
        expect(confirm.question()).toEqual({
            title: 'Leave this page?',
            body: 'Your changes to Email and Note will be discarded.',
            confirmLabel: 'Discard and leave',
            cancelLabel: 'Keep editing'
        });
    });

    it('answers with whatever the person said', async () => {
        const answer = run(leavable(false)) as Observable<boolean>;
        const settled = firstValueFrom(answer);

        confirm.respond(true);

        expect(await settled).toBe(true);
    });

    it('answers no for a refusal, and closes the question either way', async () => {
        const settled = firstValueFrom(run(leavable(false)) as Observable<boolean>);

        confirm.respond(false);

        expect(await settled).toBe(false);
        expect(confirm.question()).toBeNull();
    });
});

/* The service the guard asks, tested on its own because its two awkward cases
   are both about what happens to a question nobody answered - and a question
   nobody answered is a navigation that never finishes. */
describe('ConfirmService', () => {
    let confirm: ConfirmService;

    beforeEach(() => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({ providers: [] });

        confirm = TestBed.inject(ConfirmService);
    });

    it('fills in the parts the caller left out', () => {
        confirm.ask({ body: 'Everything will be lost.' });

        expect(confirm.question()).toEqual({
            title: 'Are you sure?',
            body: 'Everything will be lost.',
            confirmLabel: 'Yes',
            cancelLabel: 'No'
        });
    });

    it('answers an open question no when a second one arrives', async () => {
        const first = firstValueFrom(confirm.ask({ body: 'First?' }));

        confirm.ask({ body: 'Second?' });

        /* FALSE rather than left hanging. Whoever was waiting on the first
           question gets a definite answer, which for a guard means the
           navigation completes - as a refusal, which is the safe direction.
           The alternative is an Observable that never emits and a router stuck
           in 'navigating' with no UI to get out of it, which is the worst bug
           this file could have. */
        expect(await first).toBe(false);
        expect(confirm.question()?.body).toBe('Second?');
    });

    it('completes, so a subscriber is not left listening', async () => {
        let completed = false;

        confirm.ask({ body: 'Leave?' }).subscribe({ complete: () => { completed = true; } });
        confirm.respond(true);

        expect(completed).toBe(true);
    });

    it('ignores a response when nothing was asked', () => {
        /* No throw, no question. A stray `respond` can happen - the dialog is
           rendered by the shell and outlives every page - and it has to be
           harmless. */
        expect(() => { confirm.respond(true); }).not.toThrow();
        expect(confirm.question()).toBeNull();
    });
});
