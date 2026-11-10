/* Day 54 - the router, which is the part I was most sure I could not test.

   Two different kinds of test live here, and the split is the point.

   AS DATA. Day 51's first note says "a route is data, not markup", and the
   argument given for it was that routes "can be read, filtered and tested
   without rendering anything". The first describe block is that claim cashed
   in: it imports `routes` and makes assertions about the array. No TestBed, no
   DOM, no navigation, under a millisecond. React Router's routes are JSX
   elements and there is nothing equivalent to assert against.

   AS BEHAVIOUR. The second block uses `RouterTestingHarness`, which is a
   fixture whose template is a single `<router-outlet>`:

       const harness = await RouterTestingHarness.create();
       const page = await harness.navigateByUrl('/contacts/c1', ContactDetailPage);
       harness.routeNativeElement   // the DOM the route rendered

   So a test can navigate to a URL and assert what appeared - which is what
   three days of probes have been doing by building the app, serving it and
   driving jsdom. The same assertion here costs no build and runs in
   milliseconds.

   What the harness does NOT give is the app shell: no nav, no
   `routerLinkActive`, no layout, because its template is only the outlet. Those
   still need the shell rendered, and the probe is still the only thing that
   tests the built bundle end to end. The two are complements, and Day 54's
   mistake would be to think either replaces the other. */

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { routes } from './routes';
import { SuffixTitleStrategy } from './title-strategy';
import { ContactDetailPage } from './pages/contact-detail-page';
import { ContactFormPage } from './pages/contact-form-page';
import { ContactsPage } from './pages/contacts-page';
import { NotFoundPage } from './pages/not-found-page';
import { type Contact } from './domain';

const ADA: Contact = {
    id: 'c1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    group: 'work',
    tags: ['maths'],
    favourite: true,
    addedAt: '2026-10-01T09:00:00.000Z'
};

describe('the route table, as data', () => {
    const pathOf = (path: string) => routes.findIndex((route) => route.path === path);

    it('sends the root to the contacts list and matches only the root', () => {
        const root = routes[0];

        expect(root?.path).toBe('');
        expect(root?.redirectTo).toBe('contacts');
        /* The one that cost me an afternoon's reading on Day 51. Without
           `pathMatch: 'full'` the default is 'prefix', '' is a prefix of every
           URL in the app, and every navigation redirects to /contacts. */
        expect(root?.pathMatch).toBe('full');
    });

    it('puts the static segment before the parameter', () => {
        /* Angular walks this array top to bottom, so order IS specificity -
           unlike React Router, which ranks by specificity whatever the order.
           This assertion is the whole difference between the two routers, and
           it is one line. */
        expect(pathOf('contacts/new')).toBeLessThan(pathOf('contacts/:id'));
    });

    it('keeps the wildcard last, because everything after it is unreachable', () => {
        expect(routes[routes.length - 1]?.path).toBe('**');
    });

    it('declares a title for every route that renders something', () => {
        for (const route of routes) {
            if (route.redirectTo !== undefined) continue;
            expect(route.title, `${route.path} has no title`).toBeDefined();
        }
    });

    it('loads exactly one route lazily', () => {
        const lazy = routes.filter((route) => route.loadComponent !== undefined);

        expect(lazy.map((route) => route.path)).toEqual(['about']);
        /* And it names no component eagerly, which is what keeps it out of the
           initial bundle. The build output is the real proof - 1.15 kB in its
           own chunk - but this is what fails if someone "tidies" it into a
           plain `component:`. */
        expect(lazy[0]?.component).toBeUndefined();
    });
});

describe('the route table, as behaviour', () => {
    let http: HttpTestingController;
    let harness: RouterTestingHarness;

    const configure = (table = routes) => {
        /* Reset first, because `http.verify()` in the afterEach below can
           throw - and when it does, Angular's own reset hook does not run, so
           the next test arrives at an already-instantiated TestBed and fails
           with "Cannot configure the test module when the test module has
           already been instantiated". That turned one real failure into ten,
           which is the most time this day cost me. One assertion failing
           should fail one test. */
        TestBed.resetTestingModule();

        TestBed.configureTestingModule({
            providers: [
                provideHttpClient(),
                provideHttpClientTesting(),
                /* The same two arguments as app.config.ts. `withComponentInputBinding()`
                   is what makes `:id` arrive as an input, and leaving it out
                   here would make `input.required<string>()` throw - so this
                   spec also tests that the app is configured the way the pages
                   assume. */
                provideRouter(table, withComponentInputBinding()),
                { provide: TitleStrategy, useClass: SuffixTitleStrategy }
            ]
        });

        http = TestBed.inject(HttpTestingController);
    };

    /* Every page injects ContactsService, which loads in its constructor, so
       the first navigation always leaves one request waiting.

       The `size` part was not planned. `verify()` failed on the very first
       test with

           Error: Expected no open requests, found 1: GET /api/directory/size

       which is Day 53's directory search sitting above the contacts list and
       asking for the directory's size, and the About page being its second
       consumer. I had forgotten it existed. That is `verify()` earning its
       place in the afterEach: I would never have found this by looking, and on
       screen it is one line in a request log. */
    const answer = (contacts: readonly Contact[] = [ADA]) => {
        http.expectOne('/api/contacts').flush({ contacts });

        for (const size of http.match('/api/directory/size')) {
            size.flush({ total: 24 });
        }
    };

    const html = () => (harness.routeNativeElement as HTMLElement).innerHTML;
    const q = <T extends HTMLElement>(selector: string) =>
        (harness.routeNativeElement as HTMLElement).querySelector<T>(selector);

    afterEach(() => {
        http.verify();
    });

    describe('with the real table', () => {
        beforeEach(async () => {
            configure();
            harness = await RouterTestingHarness.create();
        });

        it('redirects the root to the list', async () => {
            await harness.navigateByUrl('/', ContactsPage);
            answer();

            expect(TestBed.inject(Router).url).toBe('/contacts');
        });

        it('binds the id segment to the page input', async () => {
            const page = await harness.navigateByUrl('/contacts/c1', ContactDetailPage);

            /* The input, not an ActivatedRoute read. This is
               `withComponentInputBinding()` working, asserted on the component
               rather than inferred from the screen. */
            expect(page.id()).toBe('c1');

            answer();
            await harness.fixture.whenStable();

            expect(html()).toContain('Ada Lovelace');
        });

        /* Day 52's bug, which a probe found by watching the screen for 120ms
           and which is three lines here. */
        it('does not claim the contact is missing while it is still loading', async () => {
            await harness.navigateByUrl('/contacts/c1', ContactDetailPage);

            expect(q('#detail-loading')).not.toBeNull();
            expect(q('#no-such-contact')).toBeNull();

            answer();
            await harness.fixture.whenStable();

            expect(q('#detail-loading')).toBeNull();
        });

        it('distinguishes a URL that matched nothing from a record that is absent', async () => {
            await harness.navigateByUrl('/contacts/nope', ContactDetailPage);
            answer();
            await harness.fixture.whenStable();

            /* The route matched; the id does not exist. Day 18's "empty and
               broken are different states", and the two pages say different
               things because the thing to do about them differs. */
            expect(q('#no-such-contact')).not.toBeNull();
            expect(q('#no-such-contact')?.textContent).toContain('nope');

            await harness.navigateByUrl('/nowhere-at-all', NotFoundPage);

            expect(q('#not-found')).not.toBeNull();
        });

        it('takes contacts/new as the form rather than as an id', async () => {
            const page = await harness.navigateByUrl('/contacts/new', ContactFormPage);
            answer();
            await harness.fixture.whenStable();

            /* `id` is `input<string>()` here, not required, and on this route
               there is no segment to bind - so it is undefined, which is how
               the page knows it is adding rather than editing. */
            expect(page.id()).toBeUndefined();
            expect(q('form')).not.toBeNull();
        });

        it('binds the id on the edit route and fills the form from the record', async () => {
            const page = await harness.navigateByUrl('/contacts/c1/edit', ContactFormPage);
            answer();
            await harness.fixture.whenStable();

            expect(page.id()).toBe('c1');
            expect(q<HTMLInputElement>('#name')?.value).toBe('Ada Lovelace');
        });

        it('loads the lazy route when something navigates to it', async () => {
            /* `navigateByUrl` awaits the dynamic import, so this is also the
               test that the chunk is reachable at all - a `loadComponent` that
               points at a renamed export fails only here and in production. */
            await harness.navigateByUrl('/about');

            expect(html()).toContain('About this build');

            /* The About page is the only route that does NOT inject
               ContactsService, so there is no /api/contacts to answer here -
               only the directory size it shares with the search box. */
            http.expectOne('/api/directory/size').flush({ total: 24 });
        });

        it('titles the tab from the route and the build', async () => {
            await harness.navigateByUrl('/contacts', ContactsPage);
            answer();

            /* The strategy, the route's `title` and the `Title` service, all
               three at once - and the suffix, which is the reason the default
               strategy was not enough. */
            expect(TestBed.inject(Title).getTitle()).toBe(
                'Contacts | Day 54 | Angular Testing'
            );
        });

        /* The wart, written down as a passing test rather than as a comment,
           because a comment cannot tell me when it is fixed.

           A route's `title` is static, so every contact's page is called
           "Contact". The record's name is what a tab should say, and getting
           it there needs a resolver - which is Day 56. When that lands, this
           test fails, and the failure is the reminder to change it. */
        it('still titles every contact page the same, which a resolver will fix', async () => {
            await harness.navigateByUrl('/contacts/c1', ContactDetailPage);
            answer();

            expect(TestBed.inject(Title).getTitle()).toBe('Contact | Day 54 | Angular Testing');
            expect(TestBed.inject(Title).getTitle()).not.toContain('Ada');
        });
    });

    /* Day 51's experiment, made permanent.

       That day I swapped two routes by hand, rebuilt, drove a probe to
       /contacts/new and read the screen: the detail page rendered, looking for
       a contact with the id "new". It took a few minutes and left nothing
       behind. Here the wrong table is a value, the whole thing is one test,
       and the evidence survives. */
    describe('with contacts/:id moved in front of contacts/new', () => {
        beforeEach(async () => {
            const wrong = [...routes];
            const newIndex = wrong.findIndex((route) => route.path === 'contacts/new');
            const idIndex = wrong.findIndex((route) => route.path === 'contacts/:id');
            [wrong[newIndex], wrong[idIndex]] = [wrong[idIndex]!, wrong[newIndex]!];

            configure(wrong);
            harness = await RouterTestingHarness.create();
        });

        it('renders the detail page for the word new', async () => {
            const page = await harness.navigateByUrl('/contacts/new', ContactDetailPage);
            answer();
            await harness.fixture.whenStable();

            expect(page.id()).toBe('new');
            expect(q('#no-such-contact')?.textContent).toContain('new');
            expect(q('form')).toBeNull();
            /* And the title is wrong too, which is the detail I missed when I
               only looked at the screen. */
            expect(TestBed.inject(Title).getTitle()).toContain('Contact |');
        });
    });
});
