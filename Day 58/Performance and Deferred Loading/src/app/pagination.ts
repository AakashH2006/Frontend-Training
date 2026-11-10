/* Day 55 - the pagination bar, and it is made of links.

   That is the whole design decision and it is the week's argument in one
   component. A page number is state; Day 36 said state that identifies what is
   on screen belongs in the URL; the URL is reached with an `<a href>`. So
   every page number here is a real anchor with a real href, which means it can
   be middle-clicked into a new tab, copied, bookmarked and read aloud as a
   link by a screen reader. A `<button (click)="goTo(n)">` can do none of those
   things and is the version I would have written in Week 8.

   `queryParamsHandling: 'merge'` is what makes it composable: the link changes
   `page` and leaves `q`, `filter` and `sort` alone, so paging through a
   filtered search works without this component knowing that filters exist.

   It injects nothing and takes four inputs, which is Day 48's rule and what
   lets Day 55's spec render it with no providers but the router. */

import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-pagination',
    imports: [RouterLink],
    template: `
        @if (pages() > 1) {
            <!-- A <nav> with a label, because a page can have more than one
                 and "Navigation" twice in a landmarks list is useless. The
                 list is ordered, which is what it is. -->
            <nav class="pagination" [attr.aria-label]="label()" id="pagination">
                <ol class="pagination__list">
                    <li>
                        @if (page() > 1) {
                            <a
                                class="button button--quiet button--small"
                                id="page-previous"
                                [routerLink]="[]"
                                [queryParams]="{ page: linkFor(page() - 1) }"
                                queryParamsHandling="merge"
                                rel="prev"
                            >
                                Previous
                            </a>
                        } @else {
                            <!-- Not a disabled link, because there is no such
                                 thing: an <a> without an href is not focusable
                                 and announces as text. A <span> says the same
                                 thing honestly. Day 38's rule about disabled
                                 controls, in its one defensible case - there is
                                 nothing to explain about "there is no page 0". -->
                            <span class="button button--quiet button--small is-disabled" aria-hidden="true">
                                Previous
                            </span>
                        }
                    </li>

                    @for (number of numbers(); track number) {
                        <li>
                            @if (number === page()) {
                                <!-- The current page is not a link to itself.
                                     "aria-current=page" is the standard way
                                     to say which one it is, and it is the same
                                     attribute the nav in app.html sets from
                                     routerLinkActive. -->
                                <span
                                    class="button button--small pagination__current"
                                    aria-current="page"
                                >{{ number }}</span>
                            } @else {
                                <a
                                    class="button button--quiet button--small"
                                    [routerLink]="[]"
                                    [queryParams]="{ page: linkFor(number) }"
                                    queryParamsHandling="merge"
                                    [attr.aria-label]="'Page ' + number"
                                >{{ number }}</a>
                            }
                        </li>
                    }

                    <li>
                        @if (page() < pages()) {
                            <a
                                class="button button--quiet button--small"
                                id="page-next"
                                [routerLink]="[]"
                                [queryParams]="{ page: linkFor(page() + 1) }"
                                queryParamsHandling="merge"
                                rel="next"
                            >
                                Next
                            </a>
                        } @else {
                            <span class="button button--quiet button--small is-disabled" aria-hidden="true">
                                Next
                            </span>
                        }
                    </li>
                </ol>

                <!-- Said in words as well as in buttons, because "3" on its
                     own tells a screen reader nothing about where it is, and
                     because "matched" is a number the user cannot see any
                     other way. -->
                <p class="text-sm text-muted" id="page-status">
                    Page {{ page() }} of {{ pages() }} &middot; {{ matched() }}
                    {{ matched() === 1 ? 'contact' : 'contacts' }} matched
                </p>
            </nav>
        }
    `,
    styles: `
        .pagination {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 0.75rem;
            margin-top: 1rem;
        }

        .pagination__list {
            display: flex;
            flex-wrap: wrap;
            gap: 0.35rem;
            margin: 0;
            padding: 0;
            list-style: none;
        }

        .pagination__current {
            font-variant-numeric: tabular-nums;
        }

        .is-disabled {
            opacity: 0.45;
        }
    `
})
export class Pagination {
    readonly page = input.required<number>();
    readonly pages = input.required<number>();
    readonly matched = input(0);
    readonly label = input('Contact pages');

    protected readonly numbers = computed(() =>
        Array.from({ length: this.pages() }, (_, index) => index + 1)
    );

    /* Page 1 is `null`, which removes the parameter rather than writing
       `?page=1`.

       The default has to be absent from the URL or there are two addresses for
       the first page - `/contacts` and `/contacts?page=1` - that render
       identically, and `distinctUntilChanged` in the service would treat them
       as the same request while the browser treats them as two history
       entries. Day 51 made the same choice for `sort=added` and `filter=all`
       for the same reason; it matters more here because paging is where people
       use the back button. */
    protected linkFor(number: number): number | null {
        return number === 1 ? null : number;
    }
}
