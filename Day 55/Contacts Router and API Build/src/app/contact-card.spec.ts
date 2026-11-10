/* Day 54 - a component test, and the component chosen on purpose.

   `ContactCard` injects nothing. Day 48 made that a rule and argued for it on
   grounds I could only assert at the time:

       "a test would need the whole service to render one card"

   This file is that argument settled. The TestBed has no providers at all - no
   HttpClient, no router, no services - and the card renders, because
   everything it needs arrives through `setInput`.

   The mechanics that are new since Week 8's React tests:

       TestBed.createComponent(X)      -> a fixture
       fixture.componentRef.setInput() -> set a signal input
       await fixture.whenStable()      -> let change detection settle
       fixture.nativeElement           -> the DOM to query

   `setInput` is the part with no React equivalent: there, a component is
   rendered with props and re-rendered with different ones. Here the component
   instance persists and its inputs are set, which is much closer to what the
   framework actually does at runtime. */

import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ContactCard } from './contact-card';
import { type Contact } from './domain';

const ADA: Contact = {
    id: 'c1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    group: 'work',
    tags: ['analytical engine', 'maths'],
    favourite: true,
    note: 'Met at the conference.',
    addedAt: '2026-10-01T09:00:00.000Z'
};

const GRACE: Contact = {
    id: 'c2',
    name: 'Grace Hopper',
    phone: '+1 555 0100',
    group: 'work',
    tags: [],
    favourite: false,
    addedAt: '2026-10-02T09:00:00.000Z'
};

describe('ContactCard', () => {
    /* No providers. That is the test. */
    beforeEach(() => {
        TestBed.configureTestingModule({});
    });

    const render = async (contact: Contact, detailLink: (string | number)[] | null = null) => {
        const fixture = TestBed.createComponent(ContactCard);
        fixture.componentRef.setInput('contact', contact);
        fixture.componentRef.setInput('detailLink', detailLink);
        await fixture.whenStable();

        const element = fixture.nativeElement as HTMLElement;

        /* Queried by what a user sees - the button's text - rather than by a
           class or a test id. Day 37's rule, and the thing that makes a test
           survive a restyle. */
        const button = (label: string): HTMLButtonElement => {
            const found = [...element.querySelectorAll('button')].find(
                (candidate) => candidate.textContent?.trim() === label
            );

            if (found === undefined) {
                throw new Error(
                    `No button labelled "${label}". Found: ${[...element.querySelectorAll('button')]
                        .map((b) => b.textContent?.trim())
                        .join(', ')}`
                );
            }

            return found;
        };

        return { fixture, element, button };
    };

    it('renders the name, the group and the tags', async () => {
        const { element } = await render(ADA);

        expect(element.querySelector('h3')?.textContent).toContain('Ada Lovelace');
        expect(element.textContent).toContain('Work');
        expect([...element.querySelectorAll('.tag')].map((t) => t.textContent)).toEqual([
            'analytical engine',
            'maths'
        ]);
    });

    /* The three-branch `reachLine` computed from Day 50, which until now had
       been checked by reading it. */
    it('joins email and phone, and says so when there is neither', async () => {
        const both = await render({ ...ADA, phone: '+1 555 0144' });
        expect(both.element.textContent).toContain('ada@example.com · +1 555 0144');

        const emailOnly = await render(ADA);
        expect(emailOnly.element.textContent).toContain('ada@example.com');

        const phoneOnly = await render(GRACE);
        expect(phoneOnly.element.textContent).toContain('+1 555 0100');

        /* Unreachable through the form, reachable through a server, and
           therefore worth a rendering rather than an empty line. */
        const { email: _e, ...noEmail } = ADA;
        const neither = await render({ ...noEmail, tags: [] });
        expect(neither.element.textContent).toContain('No contact details');
    });

    it('shows the favourite badge only when the contact is one', async () => {
        const favourite = await render(ADA);
        expect(favourite.element.querySelector('.badge')?.textContent).toContain('Favourite');

        const plain = await render(GRACE);
        expect(plain.element.querySelector('.badge')).toBeNull();
    });

    it('labels its own button by what pressing it will do', async () => {
        const favourite = await render(ADA);
        expect(favourite.button('Unfavourite')).toBeDefined();

        const plain = await render(GRACE);
        expect(plain.button('Favourite')).toBeDefined();
    });

    it('marks the favourite state with aria-pressed, not only with colour', async () => {
        /* Day 38's rule, and the kind of thing only a test checks - it is
           invisible on screen by definition. */
        const { element } = await render(ADA);
        const toggle = element.querySelector('button[aria-pressed]');

        expect(toggle?.getAttribute('aria-pressed')).toBe('true');
    });

    it('emits the whole contact on edit and only the id on remove', async () => {
        const { fixture, button } = await render(ADA);

        const edited: Contact[] = [];
        const removed: string[] = [];
        const favourited: string[] = [];

        fixture.componentInstance.edit.subscribe((contact) => edited.push(contact));
        fixture.componentInstance.remove.subscribe((id) => removed.push(id));
        fixture.componentInstance.toggleFavourite.subscribe((id) => favourited.push(id));

        button('Edit').click();
        button('Remove').click();
        button('Unfavourite').click();

        /* The exact payloads, which is Day 37's "assert the payload, not that
           something happened". An output that emits the wrong thing passes
           every test that only counts calls. */
        expect(edited).toEqual([ADA]);
        expect(removed).toEqual(['c1']);
        expect(favourited).toEqual(['c1']);
    });

    it('renders the title as plain text when it has no link', async () => {
        const { element } = await render(ADA, null);

        expect(element.querySelector('h3 a')).toBeNull();
        expect(element.querySelector('h3')?.textContent).toContain('Ada Lovelace');
    });

    /* The compromise from Day 51 - the card imports RouterLink - with its
       price written down. Rendering WITH a link in a bare TestBed fails:

           ERROR ɵNotFound: NG0201: No provider found for `ActivatedRoute`.
           Source: DynamicTestModule.

       Router itself is providedIn: 'root' and so resolves on its own;
       `ActivatedRoute` is not, and only `provideRouter` supplies it. That is
       the reason `detailLink` defaults to null and the reason the other eight
       tests above need no providers at all.

       Asserting the message rather than just `.toThrow()`, because "it threw"
       would also pass if the card broke for some unrelated reason. This test
       prints the error to stderr while passing, which is Angular logging the
       failed directive instantiation before the fixture gives up - noise, not
       a failure. */
    it('needs a router only when it is given a link', async () => {
        await expect(render(ADA, ['/contacts', 'c1'])).rejects.toThrow(/ActivatedRoute/);
    });
});
