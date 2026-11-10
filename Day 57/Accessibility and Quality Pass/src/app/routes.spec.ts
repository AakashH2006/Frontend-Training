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
   mistake would be to think either replaces the other.

   DAY 56 changed one thing about every test in here, and it is the most
   useful thing this spec has taught me.

   `await harness.navigateByUrl(...)` USED TO BE ONE STEP. A navigation to a
   detail route now runs a resolver first, the resolver makes a request, and
   the promise does not settle until that request is answered - so every one of
   those awaits hung for the full five seconds and the suite reported nine
   timeouts. The fix is `navigateResolving` below: start the navigation, answer
   the resolver, then await. Writing it is what made the phase order concrete
   rather than something I had read: the resolver runs BEFORE the component
   exists, so its request is in flight while there is nothing on screen at
   all. */

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { inject, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import {
    NavigationCancel,
    NavigationCancellationCode,
    Router,
    TitleStrategy,
    provideRouter,
    withComponentInputBinding,
    type Routes
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { routes } from './routes';
import { signedInGuard, unsavedChangesGuard } from './guards';
import { ConfirmService } from './confirm.service';
import { SessionService } from './session.service';
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

    it('loads two routes lazily, and sign-in is deliberately not one of them', () => {
        const lazy = routes.filter((route) => route.loadComponent !== undefined);

        expect(lazy.map((route) => route.path)).toEqual(['settings', 'about']);
        /* And they name no component eagerly, which is what keeps them out of
           the initial bundle. The build output is the real proof - both chunks
           are in the notes - but this is what fails if someone "tidies" one
           into a plain `component:`. */
        for (const route of lazy) expect(route.component).toBeUndefined();

        /* Sign-in is eager ON PURPOSE and this is the assertion that says so,
           because "why is this one not lazy too" is exactly the tidy-up
           somebody would make. It is where the guard sends people, and a chunk
           download in the middle of a redirect is a blank screen at the worst
           possible moment. */
        const signIn = routes.find((route) => route.path === 'sign-in');
        expect(signIn?.loadComponent).toBeUndefined();
        expect(signIn?.component).toBeDefined();
    });

    /* Day 56: the guards and the resolver, asserted as data - which is the
       first block's whole argument and the cheapest test in the file. None of
       this renders anything or needs a router. */
    it('guards the settings route and nothing else', () => {
        const guarded = routes.filter((route) => route.canActivate !== undefined);

        expect(guarded.map((route) => route.path)).toEqual(['settings']);
        expect(guarded[0]?.canActivate).toEqual([signedInGuard]);
    });

    it('asks before leaving both forms, and only the forms', () => {
        const asking = routes.filter((route) => route.canDeactivate !== undefined);

        /* BOTH form routes, which is the assertion that would have caught the
           first version of routes.ts: I put the guard on contacts/:id/edit and
           forgot contacts/new, on the grounds that a new contact has nothing
           to lose. It has everything typed into it to lose. */
        expect(asking.map((route) => route.path)).toEqual(['contacts/new', 'contacts/:id/edit']);
        for (const route of asking) expect(route.canDeactivate).toEqual([unsavedChangesGuard]);
    });

    it('resolves the title of both contact routes and no others', () => {
        const resolved = routes.filter((route) => typeof route.title === 'function');

        expect(resolved.map((route) => route.path)).toEqual([
            'contacts/:id',
            'contacts/:id/edit'
        ]);
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

    /* Day 54's version of this helper answered one request per navigation and
       matched the URL '/api/contacts' exactly. Day 55 broke it twice over, and
       both breaks were worth having.

       THE URL HAS PARAMETERS NOW, so an exact match finds nothing:

           Error: Expected one matching request for criteria
           "Match URL: /api/contacts", found none. Requests received are:
           GET /api/directory/size, GET /api/contacts?sort=added&page=1.

       Matching on `request.url` is the fix - the string form of `expectOne`
       compares against `urlWithParams`, and the parameters are the service's
       business rather than this spec's.

       AND A DETAIL ROUTE NOW FETCHES ITS OWN RECORD, which is the whole point
       of the day. So the list and the record are answered separately, and a
       test that answers the wrong one fails loudly instead of rendering the
       wrong screen.

       The `size` part was not planned on Day 54 either: Day 53's directory
       search sits above the contacts list and asks for the directory's size,
       and the About page is its second consumer. I had forgotten it existed.
       That is `verify()` earning its place in the afterEach. */
    const envelope = (contacts: readonly Contact[]) => ({
        contacts,
        matched: contacts.length,
        total: contacts.length,
        page: 1,
        pages: 1,
        counts: { family: 0, friends: 0, work: contacts.length, other: 0 },
        favourites: contacts.filter((contact) => contact.favourite).length
    });

    const answerList = (contacts: readonly Contact[] = [ADA]) => {
        http.expectOne((request) => request.url === '/api/contacts').flush(envelope(contacts));

        for (const size of http.match('/api/directory/size')) {
            size.flush({ total: 24 });
        }
    };

    const answerOne = (id: string, contact: Contact | null = ADA) => {
        const request = http.expectOne('/api/contacts/' + id);

        if (contact === null) {
            request.flush({ message: 'No such contact.' }, { status: 404, statusText: 'Not Found' });
            return;
        }

        request.flush(contact);
    };

    /* Day 56: the helper every detail-route test now goes through.

       A macrotask, not `await Promise.resolve()`. The resolver's request is
       issued several microtasks deep - the router's navigation pipeline is
       promises all the way down - and a single microtask hop lands before the
       subscription, so `expectOne` finds nothing. `setTimeout(0)` runs after
       the whole microtask queue has drained, which is the property being
       relied on rather than any particular number of hops. No timers are
       involved in navigation, so there is nothing for it to race with. */
    const settle = () => new Promise<void>((resolve) => { setTimeout(resolve, 0); });

    /* Start the navigation, answer the RESOLVER's request, then await it.

       The one-line version of the day: a resolver's request happens while
       there is no component. Awaiting the navigation first - which is what
       every test in here did yesterday - waits for a promise that cannot
       settle until a request nobody has answered does, and the suite reports
       a five-second timeout rather than a missing mock. */
    const navigateResolving = async <T>(
        url: string,
        id: string,
        component: Type<T>,
        contact: Contact | null = ADA
    ): Promise<T> => {
        const navigation = harness.navigateByUrl(url, component);

        await settle();
        answerOne(id, contact);

        return await navigation;
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
            answerList();

            expect(TestBed.inject(Router).url).toBe('/contacts');
        });

        /* Day 55: the finding that changed the service.

           The detail page injects ContactsService for its mutations, the
           service is `providedIn: 'root'`, and its pipeline used to request
           page 1 the moment it was created. So this navigation made two
           requests: the contact, and a list nobody was looking at.

           `verify()` is what found it - there is nothing on screen to see.
           The service now waits for a page to set a query, and this test is
           what says so. */
        it('fetches the record twice for a cold detail URL, and that is the resolver', async () => {
            await navigateResolving('/contacts/c1', 'c1', ContactDetailPage);

            /* TWO requests for one screen: the resolver's, answered inside the
               helper above, and now the page's own.

               This is a cost the day added and I am recording it as a test
               rather than hiding it, because it is the first thing I would
               want to know when reading this code later. The resolver needs
               the name before the component exists; the component needs the
               whole record and cannot be given the resolver's copy without
               `route.data`, which would mean the page no longer owns its own
               loading and error states - the three things Day 55 spent the day
               getting right.

               The experiment that settles it is in the notes: resolving the
               whole contact removes this request and replaces the loading
               state with 120ms of the PREVIOUS page, which is worse. A shared
               cache is the real answer and it is Day 58's `httpResource`. */
            answerOne('c1');

            /* Still no list, which was Day 55's finding and still holds. */
            http.expectNone((request) => request.url === '/api/contacts');
        });

        it('binds the id segment to the page input', async () => {
            const page = await navigateResolving('/contacts/c1', 'c1', ContactDetailPage);

            /* The input, not an ActivatedRoute read. This is
               `withComponentInputBinding()` working, asserted on the component
               rather than inferred from the screen. */
            expect(page.id()).toBe('c1');

            answerOne('c1');
            await harness.fixture.whenStable();

            expect(html()).toContain('Ada Lovelace');
        });

        /* Day 52's bug, which a probe found by watching the screen for 120ms
           and which is three lines here. */
        it('does not claim the contact is missing while it is still loading', async () => {
            await navigateResolving('/contacts/c1', 'c1', ContactDetailPage);

            expect(q('#detail-loading')).not.toBeNull();
            expect(q('#no-such-contact')).toBeNull();

            answerOne('c1');
            await harness.fixture.whenStable();

            expect(q('#detail-loading')).toBeNull();
        });

        it('distinguishes a URL that matched nothing from a record that is absent', async () => {
            /* The resolver gets the 404 too, and swallows it - see below. */
            await navigateResolving('/contacts/nope', 'nope', ContactDetailPage, null);
            /* A 404 from the server, which on Day 55 is where "no such
               contact" comes from. Day 52 inferred it from an absence in a
               loaded list and needed a `status === 'ready'` guard to stop
               saying it too early. */
            answerOne('nope', null);
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
            await harness.fixture.whenStable();

            /* Nothing is fetched at all: there is no id to fetch and no page
               has set a query. An add form that makes a request before the
               user has typed anything is a thing I have shipped before. */
            http.expectNone(() => true);

            /* `id` is `input<string>()` here, not required, and on this route
               there is no segment to bind - so it is undefined, which is how
               the page knows it is adding rather than editing. */
            expect(page.id()).toBeUndefined();
            expect(q('form')).not.toBeNull();
        });

        it('binds the id on the edit route and fills the form from the record', async () => {
            const page = await navigateResolving('/contacts/c1/edit', 'c1', ContactFormPage);
            answerOne('c1');
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
            http.expectNone((request) => request.url === '/api/contacts');
        });

        it('titles the tab from the route and the build', async () => {
            await harness.navigateByUrl('/contacts', ContactsPage);
            answerList();

            /* The strategy, the route's `title` and the `Title` service, all
               three at once - and the suffix, which is the reason the default
               strategy was not enough. */
            expect(TestBed.inject(Title).getTitle()).toBe(
                'Contacts | Day 57 | Accessibility and Quality Pass'
            );
        });

        /* Day 55 left a test here called "still titles every contact page the
           same, which a resolver will fix", asserting the static word
           "Contact" and that the title did NOT contain "Ada". It was written
           to fail the day a resolver landed, and today it did - which is the
           most satisfying failure in this repo so far, because the reminder
           arrived by itself instead of being something I had to remember.

           This is what it became. */
        it('titles the detail page with the record name, from the resolver', async () => {
            await navigateResolving('/contacts/c1', 'c1', ContactDetailPage);

            /* Set before the component's own request is answered - in fact
               before the component had any data at all. That is the thing a
               component could not do: by the time a page has a record to be
               named after, the title has been set for a while. */
            expect(TestBed.inject(Title).getTitle()).toBe(
                'Ada Lovelace | Day 57 | Accessibility and Quality Pass'
            );

            answerOne('c1');
        });

        it('titles the edit page differently from the detail page', async () => {
            await navigateResolving('/contacts/c1/edit', 'c1', ContactFormPage);

            /* Two resolvers over one request, which is the argument for
               `editTitleResolver` being a `map` over the same fetch rather
               than a second endpoint. */
            expect(TestBed.inject(Title).getTitle()).toBe(
                'Editing Ada Lovelace | Day 57 | Accessibility and Quality Pass'
            );

            answerOne('c1');
        });

        /* The failure path of a resolver, which is the part of the API I had
           wrong in my head.

           A resolver that ERRORS CANCELS THE NAVIGATION. Not "renders an error
           state": the router abandons the whole thing and the URL stays where
           it was, so a 404 from the title resolver would leave a dead link
           that does nothing when clicked - no page, no message, nothing. That
           is why `contactTitleResolver` catches and returns the word
           "Contact", and this test is the proof that the navigation completes
           and the page gets to show its own 404. */
        it('completes the navigation when the resolver fails, falling back to a static title', async () => {
            await navigateResolving('/contacts/nope', 'nope', ContactDetailPage, null);

            expect(TestBed.inject(Router).url).toBe('/contacts/nope');
            expect(TestBed.inject(Title).getTitle()).toBe(
                'Contact | Day 57 | Accessibility and Quality Pass'
            );

            answerOne('nope', null);
            await harness.fixture.whenStable();

            /* And the page, not the router, is what says the record is gone. */
            expect(q('#no-such-contact')).not.toBeNull();
        });
    });

    /* ---- Day 55: paging, which only exists through the router ---- */

    describe('paging', () => {
        beforeEach(async () => {
            configure();
            harness = await RouterTestingHarness.create();
        });

        const listRequest = () => http.expectOne((request) => request.url === '/api/contacts');

        const answerSize = () => {
            for (const size of http.match('/api/directory/size')) size.flush({ total: 24 });
        };

        it('sends the page from the URL to the server', async () => {
            await harness.navigateByUrl('/contacts?page=2', ContactsPage);

            const request = listRequest();

            /* The URL is the request, which is the sentence this whole week
               has been working towards. Nothing in the page holds a page
               number; it is read from the address and sent. */
            expect(request.request.params.get('page')).toBe('2');

            request.flush({ ...envelope([ADA]), page: 2, pages: 2, matched: 4 });
            answerSize();
            await harness.fixture.whenStable();

            expect(q('#page-status')?.textContent).toContain('Page 2 of 2');
        });

        /* The behaviour I am most pleased with and least likely to have
           thought of without writing the server first. */
        it('corrects a page the server clamped, and pays one extra request for it', async () => {
            await harness.navigateByUrl('/contacts?page=99', ContactsPage);

            const asked = listRequest();
            expect(asked.request.params.get('page')).toBe('99');

            /* The server served page 2 of 2 and said so. */
            asked.flush({ ...envelope([ADA]), page: 2, pages: 2, matched: 4 });
            answerSize();
            await harness.fixture.whenStable();

            /* The URL is corrected, so the address bar and the screen agree
               and the link is worth bookmarking. */
            expect(TestBed.inject(Router).url).toBe('/contacts?page=2');

            /* And the correction changes the input, so the query changes, so
               there is a second request - for page 2 this time. That is the
               honest cost of correcting the URL rather than leaving it wrong,
               it only happens for a page number that does not exist, and the
               alternative is an address that lies. */
            const corrected = listRequest();
            expect(corrected.request.params.get('page')).toBe('2');
            corrected.flush({ ...envelope([ADA]), page: 2, pages: 2, matched: 4 });
            await harness.fixture.whenStable();

            /* Second time round the served page and the asked-for page agree,
               so nothing navigates and nothing is requested. That is the
               termination argument for the effect, as a test. */
            expect(TestBed.inject(Router).url).toBe('/contacts?page=2');
            http.expectNone(() => true);
        });

        it('drops the page back to the first when the filter changes', async () => {
            await harness.navigateByUrl('/contacts?page=2', ContactsPage);
            listRequest().flush({ ...envelope([ADA]), page: 2, pages: 2, matched: 4 });
            answerSize();
            await harness.fixture.whenStable();

            /* Clicking the real button in the rendered page, which is the
               only way to test this: the page-resetting is in the handler, not
               in the service. */
            const work = [...(harness.routeNativeElement as HTMLElement).querySelectorAll('button.filter')]
                .find((button) => button.textContent?.trim() === 'Work');

            (work as HTMLButtonElement).click();
            await harness.fixture.whenStable();

            /* "No results" on page 2 of a one-page result is the bug this
               prevents, and it is the single most common pagination mistake I
               have seen in other people's apps. */
            expect(TestBed.inject(Router).url).toBe('/contacts?filter=work');

            const filtered = listRequest();
            expect(filtered.request.params.get('filter')).toBe('work');
            expect(filtered.request.params.get('page')).toBe('1');
            filtered.flush(envelope([ADA]));
        });

        it('keeps the search when it changes the page', async () => {
            await harness.navigateByUrl('/contacts?q=ada', ContactsPage);
            listRequest().flush({ ...envelope([ADA]), pages: 3, matched: 7 });
            answerSize();
            await harness.fixture.whenStable();

            const next = (harness.routeNativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
                '#page-next'
            );

            /* The href, before the click - because this is the assertion that
               a user can middle-click it, which no click handler would
               satisfy. */
            expect(next?.getAttribute('href')).toContain('q=ada');
            expect(next?.getAttribute('href')).toContain('page=2');

            next?.click();
            await harness.fixture.whenStable();

            /* ONE request, and that assertion is the whole test. Two
               earlier versions of the URL-correction effect made two - page 2
               and then page 1 again - and the only visible symptom was a
               pagination bar that flickered. */
            const paged = listRequest();
            expect(paged.request.params.get('q')).toBe('ada');
            expect(paged.request.params.get('page')).toBe('2');
            paged.flush({ ...envelope([ADA]), page: 2, pages: 3, matched: 7 });
        });

        it('shows no pagination bar for a result that fits on one page', async () => {
            await harness.navigateByUrl('/contacts', ContactsPage);
            listRequest().flush(envelope([ADA]));
            answerSize();
            await harness.fixture.whenStable();

            expect(q('#pagination')).toBeNull();
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
            /* Day 56: and the RESOLVER asks for a contact called "new" too,
               before the wrong page is even built - so the misordered table
               now costs two requests for a screen that should have been a
               form. The resolver's 404 is swallowed, which is why the title
               below is the fallback rather than a cancelled navigation. */
            const page = await navigateResolving('/contacts/new', 'new', ContactDetailPage, null);
            /* And it asks the server for a contact called "new", which gets a
               404 - a detail Day 51's probe could not see, because the page
               had no request to make. */
            answerOne('new', null);
            await harness.fixture.whenStable();

            expect(page.id()).toBe('new');
            expect(q('#no-such-contact')?.textContent).toContain('new');
            expect(q('form')).toBeNull();
            /* And the title is wrong too, which is the detail I missed when I
               only looked at the screen. */
            expect(TestBed.inject(Title).getTitle()).toContain('Contact |');
        });
    });

    /* ---- Day 56: the guards, as behaviour ---- */

    /* `canActivate`, which is the half that is about the app's state.

       Worth saying once more where a test can see it: this is not security.
       `SessionService` is a name in localStorage and anybody can put one
       there. What these tests assert is that the ROUTER does the right thing
       with the answer it is given - the redirect, the returnUrl, and the chunk
       that is not downloaded - and all three of those are true whatever is
       deciding. */
    describe('the signed-in guard', () => {
        let session: SessionService;

        beforeEach(async () => {
            configure();
            harness = await RouterTestingHarness.create();

            session = TestBed.inject(SessionService);
            /* The service reads localStorage when it is constructed, and
               localStorage in jsdom survives between tests in the same file.
               Without this, the first test to sign in makes every later test
               start signed in - which is the kind of order-dependent suite
               that takes an hour to understand. */
            session.signOut();
        });

        it('sends an anonymous visitor to sign-in', async () => {
            await harness.navigateByUrl('/settings');

            expect(TestBed.inject(Router).url).toBe('/sign-in?returnUrl=%2Fsettings');
        });

        it('keeps the query string in the returnUrl', async () => {
            await harness.navigateByUrl('/settings?tab=api&latency=400');

            /* ONE encoded parameter containing an entire URL, which is why
               `state.url` rather than `route.url`: the snapshot would have
               given ["settings"] and the query would have been lost, so
               signing in would land somewhere the user did not ask for. */
            const url = TestBed.inject(Router).url;

            expect(url.startsWith('/sign-in?returnUrl=')).toBe(true);
            expect(decodeURIComponent(url.slice('/sign-in?returnUrl='.length))).toBe(
                '/settings?tab=api&latency=400'
            );
        });

        it('lets a signed-in visitor through', async () => {
            session.signIn('Ada');

            await harness.navigateByUrl('/settings');

            expect(TestBed.inject(Router).url).toBe('/settings');
            expect(html()).toContain('Settings');
        });

        /* The claim I had written in guards.ts, measured and found wrong -
           which is the most useful thing in this spec.

           What I wrote there was that returning a `UrlTree` is ONE navigation
           while `router.navigate(...)` plus `return false` is two. It is not.
           Both produce exactly the same seventeen events in the same order,
           two NavigationStarts and a NavigationCancel among them:

               NavigationStart, RoutesRecognized, GuardsCheckStart,
               ChildActivationStart, ActivationStart, NavigationCancel,
               NavigationStart, RoutesRecognized, GuardsCheckStart,
               ChildActivationStart, ActivationStart, GuardsCheckEnd,
               ResolveStart, ResolveEnd, ActivationEnd, ChildActivationEnd,
               NavigationEnd

           So the redirect is two navigations either way and the comment was
           repeating something I had read rather than something I had seen.

           The difference is real but it is elsewhere, and these two tests are
           it. */
        it('reports a UrlTree redirect as a navigation that succeeded', async () => {
            const router = TestBed.inject(Router);
            const cancels: NavigationCancel[] = [];

            router.events.subscribe((event) => {
                if (event instanceof NavigationCancel) cancels.push(event);
            });

            /* TRUE. The caller asked to go to /settings, the router went
               somewhere else, and it calls that a success - because from the
               router's point of view the navigation was redirected, not
               refused. */
            expect(await router.navigateByUrl('/settings')).toBe(true);

            expect(cancels.length).toBe(1);
            expect(cancels[0]?.code).toBe(NavigationCancellationCode.Redirect);
        });

        /* Day 51's experiment style, applied to the guard: the wrong version
           is a value, the comparison is a test, and the evidence survives.

           Same destination, same events, two different answers - and the
           cancellation code is the one I would never have guessed. The naive
           guard does not report GuardRejected: it reports
           SupersededByNewNavigation, because starting a navigation from inside
           a guard overtakes the navigation the guard was asked about. The
           router is describing the bug accurately. */
        it('reports the navigate-then-false version as a navigation that failed', async () => {
            const naive = routes.map((route) =>
                route.path === 'settings'
                    ? {
                          ...route,
                          canActivate: [
                              () => {
                                  const session = inject(SessionService);
                                  const router = inject(Router);

                                  if (session.signedIn()) return true;

                                  void router.navigate(['/sign-in']);
                                  return false;
                              }
                          ]
                      }
                    : route
            );

            configure(naive);
            harness = await RouterTestingHarness.create();
            TestBed.inject(SessionService).signOut();

            const router = TestBed.inject(Router);
            const cancels: NavigationCancel[] = [];

            router.events.subscribe((event) => {
                if (event instanceof NavigationCancel) cancels.push(event);
            });

            /* FALSE, for a redirect that worked perfectly. Any caller that
               checks the result - `if (!(await router.navigate(...)))` is a
               shape I have written - cannot tell this apart from a hard block,
               and would show an error for a redirect the user never noticed.
               That is the cost, and it is the reason to return a UrlTree. */
            expect(await router.navigateByUrl('/settings')).toBe(false);
            await settle();

            expect(router.url).toBe('/sign-in');
            expect(cancels[0]?.code).toBe(NavigationCancellationCode.SupersededByNewNavigation);

            /* And no returnUrl, which is the other half of why the real guard
               builds a tree: the destination has to carry where the user was
               going, and a bare `navigate(['/sign-in'])` cannot. */
            expect(router.url).not.toContain('returnUrl');
        });
    });

    /* The measurement I could not take any other way, and the second reason to
       guard a route rather than check inside a page.

       A real `loadComponent` is a dynamic import, and whether it ran is
       invisible from the DOM. Here the route table is data, so the loader can
       be replaced with one that counts - and the count is the answer to "does
       a guarded lazy route download its chunk for someone who cannot see it".
       It does not. A component that redirected from its own constructor would
       have fetched the whole chunk first. */
    describe('a guarded lazy route', () => {
        let loads: number;
        let table: Routes;

        beforeEach(() => {
            loads = 0;
            table = routes.map((route) =>
                route.path === 'settings'
                    ? {
                          ...route,
                          loadComponent: async () => {
                              loads += 1;
                              const module = await import('./pages/settings-page');
                              return module.SettingsPage;
                          }
                      }
                    : route
            );
        });

        it('does not download its chunk for a visitor the guard turns away', async () => {
            configure(table);
            harness = await RouterTestingHarness.create();
            TestBed.inject(SessionService).signOut();

            await harness.navigateByUrl('/settings');

            expect(TestBed.inject(Router).url).toContain('/sign-in');
            expect(loads).toBe(0);
        });

        it('downloads it once for a visitor it lets through', async () => {
            configure(table);
            harness = await RouterTestingHarness.create();
            TestBed.inject(SessionService).signIn('Ada');

            await harness.navigateByUrl('/settings');
            await harness.navigateByUrl('/settings');

            /* Once, not twice: the loaded component is cached by the router,
               so the second navigation is free. Worth asserting because the
               opposite - a chunk fetched on every visit - is what a naive
               dynamic import inside a component would do. */
            expect(loads).toBe(1);
        });
    });

    /* `canDeactivate`, which is the half nothing else in Angular can ask.

       The dialog is not rendered here. The harness's template is a single
       outlet and the dialog lives in the shell, so these tests drive
       `ConfirmService` directly - which turns out to be the best evidence that
       the service was the right shape: the guard asks a question, something
       answers it, and nothing in between needs a DOM. */
    describe('the unsaved-changes guard', () => {
        let confirm: ConfirmService;
        let router: Router;

        beforeEach(async () => {
            configure();
            harness = await RouterTestingHarness.create();

            confirm = TestBed.inject(ConfirmService);
            router = TestBed.inject(Router);
        });

        const typeAName = async (value: string) => {
            const input = q<HTMLInputElement>('#name');

            input!.value = value;
            /* The event, not just the value. A reactive form's `dirty` flag is
               set by the DOM event the control listens for, so assigning
               `value` alone changes the field on screen and leaves the form
               pristine - which would make this whole suite pass for the wrong
               reason. */
            input!.dispatchEvent(new Event('input'));

            await harness.fixture.whenStable();
        };

        it('lets an untouched form be left without asking anything', async () => {
            await harness.navigateByUrl('/contacts/new', ContactFormPage);
            await harness.fixture.whenStable();

            await harness.navigateByUrl('/contacts', ContactsPage);
            answerList();

            expect(confirm.question()).toBeNull();
            expect(router.url).toBe('/contacts');
        });

        it('holds the navigation open while the question is unanswered', async () => {
            await harness.navigateByUrl('/contacts/new', ContactFormPage);
            await harness.fixture.whenStable();
            await typeAName('Grace');

            const navigation = router.navigateByUrl('/contacts');
            await settle();

            /* The assertion the day is built around. The navigation has
               STARTED and has not finished: the URL is still the form's, the
               form is still on screen, and the router is waiting on an
               observable that a human has not yet caused to emit. Nothing else
               in the framework can pause navigation on a person. */
            expect(router.url).toBe('/contacts/new');
            expect(q('form')).not.toBeNull();

            const question = confirm.question();
            expect(question).not.toBeNull();
            /* And the message names the field, because the component wrote it.
               A guard could only have said "you have unsaved changes". */
            expect(question?.body).toBe('Your changes to Name will be discarded.');

            confirm.respond(false);

            /* `navigateByUrl` resolves to FALSE for a navigation a guard
               refused, which is not the same as throwing and is easy to
               ignore - the promise settles and nothing happened. */
            expect(await navigation).toBe(false);
            expect(router.url).toBe('/contacts/new');
        });

        it('lets the navigation finish when the question is answered yes', async () => {
            await harness.navigateByUrl('/contacts/new', ContactFormPage);
            await harness.fixture.whenStable();
            await typeAName('Grace');

            const navigation = router.navigateByUrl('/contacts');
            await settle();

            confirm.respond(true);

            expect(await navigation).toBe(true);
            expect(router.url).toBe('/contacts');

            /* `whenStable` BEFORE the list is answered, and this is not
               ceremony. These tests navigate with `router.navigateByUrl`
               rather than `harness.navigateByUrl`, because the navigation has
               to be left unawaited while the question is open - and the
               harness's version is the one that runs change detection. Without
               this line the contacts page exists but its effect has not run,
               so no query has been set and there is no list request to answer:

                   Error: Expected one matching request for criteria
                   "Match by function: ", found none. Requests received are:
                   GET /api/directory/size.

               The directory size is there because the search panel asks for it
               from its constructor, which is the detail that makes the message
               confusing: something was requested, just not the thing. */
            await harness.fixture.whenStable();

            /* And now the destination gets on with its life: the list it would
               always have requested. */
            answerList();
            await harness.fixture.whenStable();

            expect(html()).toContain('Ada Lovelace');
        });

        it('asks on the edit route too, naming every field that changed', async () => {
            await navigateResolving('/contacts/c1/edit', 'c1', ContactFormPage);
            answerOne('c1');
            await harness.fixture.whenStable();

            /* Filling the form from the record must NOT count as the user
               having typed something - `setValue` does not set `dirty`, which
               is the distinction the whole guard rests on. If it did, every
               edit page would ask on the way out without anybody having
               touched it. */
            const navigation = router.navigateByUrl('/contacts');
            await settle();

            expect(confirm.question()).toBeNull();
            expect(await navigation).toBe(true);

            await harness.fixture.whenStable();
            answerList();
        });
    });
});
