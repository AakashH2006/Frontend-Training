/* Day 60 - the shell, rendered. The last untested file in the app.

   `routes.spec.ts` has said so since Day 54, in a note I wrote and then left
   alone for six days:

       What the harness does NOT give is the app shell: no nav, no
       routerLinkActive, no layout, because its template is only the outlet.
       Those still need the shell rendered, and the probe is still the only
       thing that tests the built bundle end to end.

   `RouterTestingHarness` mounts a component whose template is a bare
   `<router-outlet>`, which is exactly right for asking what a route rendered
   and structurally unable to see anything around it. So every test in this
   project that touched the chrome - the nav, the skip link, the live region,
   the request log, the sign-in state - was a probe against a built bundle,
   taking thirty seconds and a `dist/` directory.

   This file mounts `App` itself:

       const fixture = TestBed.createComponent(App);
       await router.navigateByUrl('/contacts');

   Which needs `provideLocationMocks()`, and that is the one thing I had to
   look up. `provideRouter` alone leaves the router driving jsdom's real
   `location`, so a navigation here would change the URL of the document the
   whole suite shares and leak between tests. The mocks give it a `SpyLocation`
   instead - an in-memory URL, reset with the TestBed.

   WHAT THIS FOUND, immediately and a little embarrassingly: the header
   paragraph still said "Day 57 - the accessibility pass", three days and two
   commits later. The one component without a spec was the one whose visible
   text was wrong. There is an assertion for it below, which is a silly test
   with a real job - the same job as the title suffix tests in
   `routes.spec.ts`, and it is no coincidence that the strings those cover
   were the ones that stayed right. */

import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { DeferBlockBehavior, TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { App } from './app';
import { ConfirmService } from './confirm.service';
import { NotificationsService } from './notifications.service';
import { SessionService } from './session.service';
import { logInterceptor } from './http-log.service';
import { requestIdInterceptor } from './interceptors';
import { routes } from './routes';
import { API_LATENCY, SESSION_STORE_KEY } from './tokens';

const envelope = (rows: unknown[] = []) => ({
    contacts: rows,
    skipped: 0,
    matched: rows.length,
    total: rows.length,
    page: 1,
    pages: 1,
    counts: { family: 0, friends: 0, work: rows.length, other: 0 },
    favourites: 0
});

const ADA = {
    id: 'c1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    group: 'work',
    tags: ['maths'],
    favourite: false,
    addedAt: '2026-10-01T09:00:00.000Z'
};

describe('the application shell', () => {
    let fixture: ComponentFixture<App>;
    let router: Router;
    let http: HttpTestingController;

    /* `deferBlockBehavior` is a parameter because one test needs the other
       value. The default - `Manual` - renders a defer block's placeholder and
       nothing else, which is what every other test in here wants: a test about
       the nav should not be loading the confirm dialog's chunk. */
    const mount = async (behavior = DeferBlockBehavior.Manual) => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            providers: [
                provideRouter(routes, withComponentInputBinding()),
                provideLocationMocks(),
                /* The two interceptors that put things on the screen, and
                   not the other two. The request log is rendered by the shell
                   and PRODUCED by `logInterceptor`, so a spec with a bare
                   `provideHttpClient()` renders "No requests yet." for ever
                   and the log assertions below fail against correct code -
                   which is how I found out that I had written them against an
                   app that was not assembled.

                   `retryInterceptor` is left out because it would re-send the
                   503 in another test and make the log two rows; the fake
                   backend is left out because `provideHttpClientTesting`
                   replaces the backend and having both would be two servers
                   answering one request. The order matters for the id column
                   and `interceptors.spec.ts` is where that is asserted. */
                provideHttpClient(withInterceptors([requestIdInterceptor, logInterceptor])),
                provideHttpClientTesting(),
                /* A key of its own, so this file cannot sign the developer in
                   or out of the browser running the suite. */
                { provide: SESSION_STORE_KEY, useValue: 'app.spec.session' },
                { provide: API_LATENCY, useValue: 0 }
            ],
            deferBlockBehavior: behavior
        });

        localStorage.removeItem('app.spec.session');

        router = TestBed.inject(Router);
        http = TestBed.inject(HttpTestingController);

        fixture = TestBed.createComponent(App);
        await fixture.whenStable();
    };

    beforeEach(async () => { await mount(); });

    afterEach(() => {
        localStorage.removeItem('app.spec.session');
        http.verify();
    });

    const q = <T extends HTMLElement>(selector: string) =>
        (fixture.nativeElement as HTMLElement).querySelector<T>(selector);
    const qa = (selector: string) => [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll(selector)
    ];
    const text = (element: Element | null) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

    /* A macrotask, for the reason `routes.spec.ts` needed one on Day 56: the
       page sets its query in an effect and the service's pipeline reaches
       `HttpClient` through `toObservable`, so the request is issued after the
       microtask queue drains rather than during the navigation. Awaiting the
       navigation and `whenStable()` is not enough, and the symptom is
       `expectOne` finding nothing a millisecond too early. */
    const settle = () => new Promise<void>((resolve) => { setTimeout(resolve, 0); });

    /* The list page's request, which happens for every navigation to
       /contacts. It is answered rather than asserted here - this file is about
       what surrounds the outlet - but it has to be answered, because
       `http.verify()` fails on an open request and because the log assertions
       below are about it. */
    const answerList = (rows: unknown[] = [ADA]) => {
        http.expectOne((request) => request.url === '/api/contacts').flush(envelope(rows));
    };

    const goToList = async () => {
        await router.navigateByUrl('/contacts');
        await settle();
        answerList();
        await fixture.whenStable();
    };

    describe('what is on the page before any route is', () => {
        it('puts the skip link first, pointing at the element the router focuses', () => {
            /* FIRST, not merely present. A skip link that is not the first
               focusable thing in the document is a skip link you have to tab
               past the nav to reach, which is the problem it exists to fix. */
            const focusable = qa('a[href], button, input, [tabindex]');
            const skip = q<HTMLAnchorElement>('.skip-link');

            expect(focusable[0]).toBe(skip);
            expect(skip?.getAttribute('href')).toBe('#main');

            /* And the target exists, is the element `RouteFocus` focuses, and
               is focusable without being in the tab order. `main.focus()` on
               an element without `tabindex="-1"` is a silent no-op. */
            const main = q('main');
            expect(main?.id).toBe('main');
            expect(main?.getAttribute('tabindex')).toBe('-1');
        });

        it('renders the live region before there is anything to announce', () => {
            const region = q('#announcer');

            /* Day 57's whole lesson, as an assertion. A region added to the
               DOM at the same time as its first message is not announced at
               all - the screen reader has nothing to notice a change to. */
            expect(region).not.toBeNull();
            expect(region?.getAttribute('role')).toBe('status');
            expect(region?.getAttribute('aria-live')).toBe('polite');
            expect(text(region)).toBe('');
        });

        it('says no requests have been made, before any have', () => {
            expect(text(q('#http-log'))).toContain('No requests yet.');
            expect(text(q('#http-log summary'))).toBe('Requests (0)');
        });

        it('names the day it belongs to', () => {
            /* The test that caught the stale paragraph. Both strings, because
               the footer was wrong too and for the same three days. */
            expect(text(q('#shell-subtitle'))).toContain('Day 60');
            expect(text(q('#shell-footer'))).toContain('Day 60');
        });
    });

    describe('the nav', () => {
        it('renders one link per entry, with the route table\'s paths', () => {
            const links = qa('nav .nav__link');

            expect(links.map((link) => text(link))).toEqual([
                'Contacts',
                'Add a contact',
                'Settings',
                'About'
            ]);

            /* The hrefs are the router's, not hand-written - which is what
               `[routerLink]` buys and what a base href would change. */
            expect(links.map((link) => link.getAttribute('href'))).toEqual([
                '/contacts',
                '/contacts/new',
                '/settings',
                '/about'
            ]);
        });

        it('marks the current page, for the class and for the accessibility tree', async () => {
            await goToList();

            const contacts = qa('nav .nav__link')[0];

            expect(contacts?.classList.contains('nav__link--active')).toBe(true);
            /* `aria-current="page"` is the part a class cannot do. A nav whose
                 current item is only a colour is a nav with no current item as
                 far as a screen reader is concerned. */
            expect(contacts?.getAttribute('aria-current')).toBe('page');
        });

        it('stops being active on a child route, which is what exact: true is for', async () => {
            await router.navigateByUrl('/contacts/new');
            await settle();
            http.expectOne('/api/tags').flush({ tags: [] });
            await fixture.whenStable();

            const [contacts, add] = qa('nav .nav__link');

            /* Without `[routerLinkActiveOptions]="{ exact: true }"` on the
               first entry, /contacts stays active here by prefix match and TWO
               items claim to be the current page. This is the assertion the
               probe used to make, thirty seconds at a time. */
            expect(contacts?.getAttribute('aria-current')).toBeNull();
            expect(add?.getAttribute('aria-current')).toBe('page');
        });
    });

    describe('the session line', () => {
        it('offers a way in when nobody is signed in', () => {
            expect(text(q('#session-state'))).toContain('Not signed in.');
            expect(q('#session-state a')?.getAttribute('href')).toBe('/sign-in');
        });

        it('names whoever is signed in', async () => {
            TestBed.inject(SessionService).signIn('Ada Lovelace');
            await fixture.whenStable();

            expect(text(q('#session-state'))).toBe('Signed in as Ada Lovelace.');
            expect(q('#session-state a')).toBeNull();
        });
    });

    describe('the request log', () => {
        it('shows the request the list page made, with its status', async () => {
            await goToList();

            const entries = qa('#http-log li').map((li) => text(li));

            expect(entries).toHaveLength(1);
            expect(entries[0]).toContain('GET /api/contacts');
            expect(entries[0]).toContain('200');
            expect(text(q('#http-log summary'))).toBe('Requests (1)');
        });

        it('counts a request that has not been answered as in flight', async () => {
            await router.navigateByUrl('/contacts');
            await settle();
            await fixture.whenStable();

            /* The interceptor logs on the way out, not on the way back, which
               is why there is a row at all with nothing answered. */
            expect(text(q('#http-log summary'))).toBe('Requests (1, 1 in flight)');
            expect(text(q('#http-log li'))).toContain('in flight');

            answerList();
            await fixture.whenStable();

            expect(text(q('#http-log summary'))).toBe('Requests (1)');
        });
    });

    describe('the notice bar', () => {
        it('is empty until something has happened', () => {
            expect(q('#notice')).toBeNull();
        });

        it('shows what a service announced', async () => {
            TestBed.inject(NotificationsService).show('Ada Lovelace was removed.');
            await fixture.whenStable();

            expect(text(q('#notice'))).toContain('Ada Lovelace was removed.');
        });
    });

    describe('the confirm dialog, which is deferred', () => {
        it('is not in the DOM while nothing is being asked', async () => {
            await goToList();

            expect(q('app-confirm-dialog')).toBeNull();
            expect(q('#confirm-dialog')).toBeNull();
        });

        it('appears when a question exists', async () => {
            /* `Playthrough` is what makes `@defer (when …)` actually resolve
               in a test. With the default the block stays in its placeholder
               state for ever, and this dialog HAS no placeholder - so the
               assertion below would fail against correct code, which is the
               worst kind of test to leave in a file. Day 58 wrote the note
               about `deferBlockBehavior` in `routes.spec.ts`; this is the
               first test that needs the other value. */
            await mount(DeferBlockBehavior.Playthrough);
            await goToList();

            TestBed.inject(ConfirmService).ask({
                title: 'Remove Ada Lovelace?',
                body: 'This cannot be undone.',
                confirmLabel: 'Remove'
            }).subscribe();

            await fixture.whenStable();

            const dialog = q('#confirm-dialog');
            expect(dialog).not.toBeNull();
            expect(text(dialog)).toContain('Remove Ada Lovelace?');

            /* Outside <main>, and last in the document. The comment in
               app.html gives the two reasons - it must outlive the thing it is
               asking about, and a hand-rolled overlay with no portal has to be
               the last stacking context - and neither is checkable by reading
               the component. */
            expect(q('main')?.contains(dialog)).toBe(false);

            TestBed.inject(ConfirmService).respond(false);
            await fixture.whenStable();
        });
    });
});
