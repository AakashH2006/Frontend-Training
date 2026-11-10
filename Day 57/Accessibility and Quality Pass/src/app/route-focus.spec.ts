/* Day 57 - focus on navigation, and the announcement that goes with it.

   These two behaviours are tested together because they are one requirement
   seen from two sides: after a navigation, a keyboard user's next Tab should
   be inside the new page, and a screen-reader user should be told the page
   changed. Neither happened before today and neither is visible on screen.

   The target element is appended to the test document by hand. The shell
   renders `<main id="main" tabindex="-1">` and the shell is not under test
   here - `RouterTestingHarness` renders only an outlet - so the spec supplies
   the one thing the service looks for. That is honest about the coupling: the
   service's contract is "an element with id `main` exists", and if the shell
   ever stops providing one, these tests keep passing while the app breaks.
   The probe is what covers that, by driving the real shell.

   The initial-navigation skip is the part worth the most care. "Did not move
   focus" and "moved focus to where it already was" are indistinguishable from
   `activeElement` alone, so the service counts its moves and the spec reads
   the count. */

import { TestBed } from '@angular/core/testing';
import { TitleStrategy, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Announcer } from './announcer.service';
import { RouteFocus, pathOf } from './route-focus.service';
import { SuffixTitleStrategy } from './title-strategy';
import { Component } from '@angular/core';

@Component({ selector: 'app-first', template: `<h2>First</h2>` })
class FirstPage {}

@Component({ selector: 'app-second', template: `<h2>Second</h2>` })
class SecondPage {}

const routes = [
    { path: 'first', component: FirstPage, title: 'First' },
    { path: 'second', component: SecondPage, title: 'Second' },
    /* No title, deliberately: the announcement has to say something sensible
       for a route that did not declare one. */
    { path: 'nameless', component: SecondPage }
];

describe('RouteFocus', () => {
    let main: HTMLElement;
    let harness: RouterTestingHarness;
    let focus: RouteFocus;

    const active = () => document.activeElement;

    beforeEach(async () => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            providers: [
                provideRouter(routes),
                { provide: TitleStrategy, useClass: SuffixTitleStrategy }
            ]
        });

        main = document.createElement('main');
        main.id = 'main';
        /* The attribute the service depends on. Without it, `focus()` is a
           silent no-op on a div - which is the bug this line's absence would
           cause and the reason the shell's template has a comment about it. */
        main.tabIndex = -1;
        document.body.appendChild(main);

        harness = await RouterTestingHarness.create();
        focus = TestBed.inject(RouteFocus);
        focus.start();
    });

    afterEach(() => {
        main.remove();
    });

    it('leaves focus alone on the first navigation', async () => {
        await harness.navigateByUrl('/first', FirstPage);

        /* The browser decides where focus is on load - usually the body, or
           whatever a fragment in the URL pointed at. Taking it away would
           break "open a link and start reading". */
        expect(focus.focusMoves).toBe(0);
        expect(active()).not.toBe(main);
    });

    it('moves focus into the content on every navigation after that', async () => {
        await harness.navigateByUrl('/first', FirstPage);
        await harness.navigateByUrl('/second', SecondPage);

        expect(focus.focusMoves).toBe(1);
        /* The assertion that the next Tab starts inside the new page rather
           than in the nav the user just clicked. */
        expect(active()).toBe(main);

        await harness.navigateByUrl('/first', FirstPage);
        expect(focus.focusMoves).toBe(2);
    });

    it('does nothing rather than throwing when there is no content element', async () => {
        main.remove();

        await harness.navigateByUrl('/first', FirstPage);
        await harness.navigateByUrl('/second', SecondPage);

        /* A navigation must not fail because of an accessibility nicety. The
           service looks for the element and shrugs - and the move counter
           stays at zero, which is how the spec can tell "shrugged" from
           "worked". */
        expect(focus.focusMoves).toBe(0);
    });

    it('leaves focus alone when only the query string changed', async () => {
        await harness.navigateByUrl('/first', FirstPage);
        await harness.navigateByUrl('/second', SecondPage);

        expect(focus.focusMoves).toBe(1);
        expect(active()).toBe(main);

        /* Somebody clicks a filter on the contacts page. Day 55 made that a
           navigation, so the naive rule - move focus on every NavigationEnd -
           would take focus off the button they are using and put it at the top
           of the page. Their next Tab would then be six presses away from the
           filter they were adjusting, which is worse than the problem this
           service exists to fix. */
        const other = document.createElement('button');
        document.body.appendChild(other);
        other.focus();

        await harness.navigateByUrl('/second?filter=work', SecondPage);

        expect(focus.focusMoves).toBe(1);
        expect(active()).toBe(other);

        other.remove();
    });

    it('moves focus again when the path changes after a query-only navigation', async () => {
        await harness.navigateByUrl('/first', FirstPage);
        await harness.navigateByUrl('/first?page=2', FirstPage);
        await harness.navigateByUrl('/second', SecondPage);

        /* The query-only hop must still update what "the current page" is, or
           this last navigation would be compared against `/first` with no
           query and the rule would still work by accident. It is recorded
           before the early returns for exactly this reason. */
        expect(focus.focusMoves).toBe(1);
        expect(active()).toBe(main);
    });

    it('can be asked to move focus directly', () => {
        focus.focusMain();

        /* Public for the dialog's benefit: when the element focus should
           return to has been destroyed - the page was left - the content is
           where to go instead. */
        expect(active()).toBe(main);
        expect(focus.focusMoves).toBe(1);
    });
});

describe('the route announcement', () => {
    let announcer: Announcer;
    let harness: RouterTestingHarness;

    beforeEach(async () => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            providers: [
                provideRouter(routes),
                { provide: TitleStrategy, useClass: SuffixTitleStrategy }
            ]
        });

        harness = await RouterTestingHarness.create();
        announcer = TestBed.inject(Announcer);
    });

    it('says nothing on the first navigation', async () => {
        await harness.navigateByUrl('/first', FirstPage);

        /* The page is about to be read anyway; announcing its name over the
           top of that is an interruption rather than information. */
        expect(announcer.message()).toBe('');
    });

    it('announces the page name on a later navigation', async () => {
        await harness.navigateByUrl('/first', FirstPage);
        await harness.navigateByUrl('/second', SecondPage);

        expect(announcer.message().trim()).toBe('Second');
    });

    it('announces the name without the build suffix the tab carries', async () => {
        await harness.navigateByUrl('/first', FirstPage);
        await harness.navigateByUrl('/second', SecondPage);

        /* The tab needs the suffix, because a tab is all you can see of a
           backgrounded page. Somebody who just pressed a link does not need to
           be told which build they are still in - and "Second, Day 57,
           Accessibility and Quality Pass" on every navigation is how a live
           region becomes something people turn off. */
        expect(announcer.message()).not.toContain('Day 57');
        expect(document.title).toContain('Day 57');
    });

    it('says nothing when only the query string changed', async () => {
        await harness.navigateByUrl('/first', FirstPage);
        await harness.navigateByUrl('/second', SecondPage);
        expect(announcer.message().trim()).toBe('Second');

        announcer.clear();
        await harness.navigateByUrl('/second?filter=work', SecondPage);

        /* "Second" again would be true and useless: the page did not change,
           the results did. The contacts page announces its own count for this
           case, which is the only component that knows it. */
        expect(announcer.message()).toBe('');
    });

    it('still says something for a route with no title', async () => {
        await harness.navigateByUrl('/first', FirstPage);
        await harness.navigateByUrl('/nameless', SecondPage);

        /* "Page" is not informative and silence is worse: the screen has
           changed completely and a screen reader has been given no reason to
           re-read anything. */
        expect(announcer.message().trim()).toBe('Page');
    });
});

/* The helper both of the above depend on, tested on its own because it is a
   string function and a string function with two consumers deserves a table
   rather than two sets of indirect assertions. */
describe('pathOf', () => {
    it('leaves a plain path alone', () => {
        expect(pathOf('/contacts')).toBe('/contacts');
    });

    it('drops a query string', () => {
        expect(pathOf('/contacts?filter=work&page=2')).toBe('/contacts');
    });

    it('drops a fragment', () => {
        expect(pathOf('/contacts#main')).toBe('/contacts');
    });

    it('drops whichever comes first', () => {
        /* A fragment before a query is not a URL anybody writes on purpose and
           is a URL a router can produce. Taking the minimum of the two
           positions rather than only looking for '?' is one line and removes
           the question. */
        expect(pathOf('/contacts#main?x=1')).toBe('/contacts');
        expect(pathOf('/contacts?x=1#main')).toBe('/contacts');
    });

    it('handles the root', () => {
        expect(pathOf('/')).toBe('/');
        expect(pathOf('/?q=a')).toBe('/');
    });
});
