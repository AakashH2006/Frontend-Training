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
        it('fetches only the record when a detail URL is opened cold', async () => {
            await harness.navigateByUrl('/contacts/c1', ContactDetailPage);

            answerOne('c1');
            http.expectNone((request) => request.url === '/api/contacts');
        });

        it('binds the id segment to the page input', async () => {
            const page = await harness.navigateByUrl('/contacts/c1', ContactDetailPage);

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
            await harness.navigateByUrl('/contacts/c1', ContactDetailPage);

            expect(q('#detail-loading')).not.toBeNull();
            expect(q('#no-such-contact')).toBeNull();

            answerOne('c1');
            await harness.fixture.whenStable();

            expect(q('#detail-loading')).toBeNull();
        });

        it('distinguishes a URL that matched nothing from a record that is absent', async () => {
            await harness.navigateByUrl('/contacts/nope', ContactDetailPage);
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
            const page = await harness.navigateByUrl('/contacts/c1/edit', ContactFormPage);
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
                'Contacts | Day 55 | Contacts Router and API Build'
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
            answerOne('c1');

            expect(TestBed.inject(Title).getTitle()).toBe(
                'Contact | Day 55 | Contacts Router and API Build'
            );
            expect(TestBed.inject(Title).getTitle()).not.toContain('Ada');
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
            const page = await harness.navigateByUrl('/contacts/new', ContactDetailPage);
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
});
