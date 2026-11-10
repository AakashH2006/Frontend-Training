/* Day 55 - the pagination bar.

   A presentational component with four inputs and no injected state, so this
   spec is Day 54's `contact-card.spec.ts` with one addition: `provideRouter`,
   because every page number is a real link and `RouterLink` needs an
   `ActivatedRoute` to resolve one against. Day 54 measured that cost on the
   contact card and chose to pay it there; here there is no choice, since links
   are the entire point of the component.

   What these tests are really checking is the three decisions that make the
   bar work with the rest of the app, none of which are visible on screen:

     - page 1 is written as NO parameter, not `?page=1`
     - the current page is not a link to itself
     - `queryParamsHandling="merge"` keeps the search and the filter

   A bar that gets any of those wrong looks completely normal and breaks the
   back button, the URL, or the filter. */

import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { Pagination } from './pagination';

describe('Pagination', () => {
    beforeEach(() => {
        TestBed.configureTestingModule({ providers: [provideRouter([])] });
    });

    const render = async (page: number, pages: number, matched = 0) => {
        const fixture = TestBed.createComponent(Pagination);
        fixture.componentRef.setInput('page', page);
        fixture.componentRef.setInput('pages', pages);
        fixture.componentRef.setInput('matched', matched);
        await fixture.whenStable();

        const element = fixture.nativeElement as HTMLElement;

        const links = () =>
            [...element.querySelectorAll('a')].map((anchor) => ({
                text: anchor.textContent?.trim(),
                href: anchor.getAttribute('href')
            }));

        return { fixture, element, links };
    };

    it('renders nothing at all when there is one page', async () => {
        const { element } = await render(1, 1, 3);

        /* Not an empty bar, and not a disabled one: a pagination control for a
           list that fits on one page is noise, and the component decides that
           rather than every template that uses it. */
        expect(element.querySelector('#pagination')).toBeNull();
        expect(element.textContent?.trim()).toBe('');
    });

    it('lists one link per page and does not link to the current one', async () => {
        const { element, links } = await render(2, 3);

        expect(element.querySelector('#pagination')).not.toBeNull();

        /* Previous, 1, 3, Next - four links for three pages, because page 2 is
           where we are. */
        expect(links().map((link) => link.text)).toEqual(['Previous', '1', '3', 'Next']);

        const current = element.querySelector('[aria-current="page"]');
        expect(current?.textContent?.trim()).toBe('2');
        expect(current?.tagName).toBe('SPAN');
    });

    it('writes page 1 as no parameter at all', async () => {
        const { links } = await render(2, 3);

        const first = links().find((link) => link.text === '1');

        /* The decision that matters most. `?page=1` and no parameter render
           the same list from two different URLs - which means two history
           entries for one screen, and a `distinctUntilChanged` in the service
           that sees one query where the browser sees two addresses. Day 51
           made the same choice for `sort=added`; it matters more here because
           paging is where people use the back button. */
        expect(first?.href).not.toContain('page=');

        const previous = links().find((link) => link.text === 'Previous');
        expect(previous?.href).not.toContain('page=');
    });

    it('points Previous and Next at the neighbouring pages', async () => {
        const { links } = await render(2, 4);

        expect(links().find((link) => link.text === 'Next')?.href).toContain('page=3');
        /* Previous from page 3 is page 2, which IS written out. */
        const fromThree = await render(3, 4);
        expect(fromThree.links().find((link) => link.text === 'Previous')?.href).toContain('page=2');
    });

    it('marks the ends with rel attributes rather than only with words', async () => {
        const { element } = await render(2, 3);

        expect(element.querySelector('#page-previous')?.getAttribute('rel')).toBe('prev');
        expect(element.querySelector('#page-next')?.getAttribute('rel')).toBe('next');
    });

    it('does not render a link where there is no page to go to', async () => {
        const first = await render(1, 3);
        expect(first.element.querySelector('#page-previous')).toBeNull();
        expect(first.element.querySelector('#page-next')).not.toBeNull();

        const last = await render(3, 3);
        expect(last.element.querySelector('#page-previous')).not.toBeNull();
        /* And no disabled link either - an `<a>` without an href is not
           focusable and announces as plain text, so the dead ends are spans
           with `aria-hidden`. Day 38's point about disabled controls, in the
           one case where there is genuinely nothing to explain. */
        expect(last.element.querySelector('#page-next')).toBeNull();
        expect(last.element.querySelectorAll('.is-disabled').length).toBe(1);
    });

    it('says where it is in words as well as in numbers', async () => {
        const { element } = await render(2, 3, 7);

        /* "2" on its own tells a screen reader nothing about where it is, and
           `matched` is a number the user cannot see any other way. */
        expect(element.querySelector('#page-status')?.textContent).toContain('Page 2 of 3');
        expect(element.querySelector('#page-status')?.textContent).toContain('7 contacts matched');
    });

    it('gets the singular right, because one matched contact is not "1 contacts"', async () => {
        const { element } = await render(1, 2, 1);

        expect(element.querySelector('#page-status')?.textContent).toContain('1 contact matched');
    });

    it('labels its own landmark', async () => {
        const { element } = await render(1, 2);

        /* A page can have more than one <nav>, and "Navigation" twice in a
           landmarks list is useless. */
        expect(element.querySelector('nav')?.getAttribute('aria-label')).toBe('Contact pages');
    });

    /* The merge, which is the behaviour that makes this component reusable
       and cannot be asserted from the component alone: the href has to be
       built against a real URL that already has parameters.

       So the test routes a HOST component. `navigateByUrl(url, Pagination)`
       would hand back the routed component but give no way to set its
       required inputs, and a routed component with an unset
       `input.required` throws - which is the first thing I tried. A host with
       the inputs written in its template is both simpler and closer to how
       the contacts page uses it. */
    it('keeps the search and the filter when it changes the page', async () => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            providers: [provideRouter([{ path: 'contacts', component: PaginationHost }])]
        });

        const harness = await RouterTestingHarness.create();
        await harness.navigateByUrl('/contacts?q=ada&filter=work', PaginationHost);

        const element = harness.routeNativeElement as HTMLElement;
        const next = element.querySelector('#page-next');

        /* One link carrying three parameters, two of which this component has
           never heard of. That is what `queryParamsHandling="merge"` buys and
           the reason paging through a filtered search works without the bar
           knowing that filters exist. */
        expect(next?.getAttribute('href')).toContain('q=ada');
        expect(next?.getAttribute('href')).toContain('filter=work');
        expect(next?.getAttribute('href')).toContain('page=2');
    });
});

@Component({
    selector: 'app-pagination-host',
    imports: [Pagination],
    template: '<app-pagination [page]="1" [pages]="3" [matched]="7" />'
})
class PaginationHost {}
