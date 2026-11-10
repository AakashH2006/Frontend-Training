/* Day 57 - the announcer, and the one test in here that is not obvious.

   Most of this file is small: a message goes in, a message comes out. The test
   worth writing is "announces the same message twice", because that is the
   case the naive implementation gets wrong silently - the signal is set to a
   value it already holds, nothing changes, no DOM mutation, nothing read out,
   and the user who searched twice heard nothing the second time.

   The region component is tested here too rather than in a file of its own,
   because it is four lines whose entire behaviour is "the element exists and
   shows the service's message". Both halves of that are assertions a reader
   would want next to each other. */

import { Component, effect, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ANNOUNCE_GAP, Announcer } from './announcer.service';
import { AnnouncerRegion } from './announcer';

/* Zero gap, and one macrotask to let it fire.

   The service holds the region for 150ms after a message so that the next one
   is a separate mutation rather than an overwrite. Waiting 150ms per
   assertion in here would add about a second to the suite to prove something
   the ordering already proves, so the gap is a token and every test in this
   file sets it to nothing. `flush` is then one turn of the macrotask queue -
   `setTimeout(…, 0)` is still a timeout, and a signal write from inside it is
   still a separate render. */
const NO_GAP = { provide: ANNOUNCE_GAP, useValue: 0 };

const flush = () => new Promise<void>((resolve) => { setTimeout(resolve, 0); });

describe('Announcer', () => {
    let announcer: Announcer;

    beforeEach(() => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({ providers: [NO_GAP] });

        announcer = TestBed.inject(Announcer);
    });

    it('starts silent', () => {
        /* Empty, not a greeting. A live region with text in it on load is
           text that may or may not be read depending on when the screen
           reader attached - and is noise either way. */
        expect(announcer.message()).toBe('');
    });

    it('holds the message it was given', () => {
        announcer.announce('Added Ada Lovelace.');

        expect(announcer.message()).toBe('Added Ada Lovelace.');
    });

    it('trims, and ignores a message that is only whitespace', () => {
        announcer.announce('  Saved.  ');
        expect(announcer.message()).toBe('Saved.');

        announcer.announce('   ');
        /* UNCHANGED rather than cleared. An empty announcement is not a
           reason to throw away the previous one, and a region that empties
           itself is a region whose next identical message will not be heard -
           see below. */
        expect(announcer.message()).toBe('Saved.');
    });

    it('changes the text when the same message is announced twice', async () => {
        announcer.announce('No matches for ada.');
        const first = announcer.message();

        announcer.announce('No matches for ada.');
        await flush();
        const second = announcer.message();

        /* The assertion the implementation exists for. Two searches with the
           same outcome must produce two announcements, and a screen reader
           announces a CHANGE - so identical text is silence. The difference is
           one no-break space, which reads as nothing and is not nothing to the
           DOM. */
        expect(second).not.toBe(first);
        expect(second.trim()).toBe('No matches for ada.');
        /* The escape, not the character. An NBSP typed into a spec file is
           indistinguishable from a space to every reader of it. */
        expect(second.replace(/\u00a0/g, '')).toBe('No matches for ada.');
    });

    it('says a second message after the first rather than instead of it', async () => {
        /* The probe's finding, as a unit test. Two announcements in one tick
           used to render once, with the second message - and the first was
           then something the user was never told. */
        announcer.announce('Removed Jean Bartik.');
        announcer.announce('Contacts');

        expect(announcer.message()).toBe('Removed Jean Bartik.');

        await flush();
        expect(announcer.message()).toBe('Contacts');
    });

    it('keeps the order it was given', async () => {
        announcer.announce('One.');
        announcer.announce('Two.');
        announcer.announce('Three.');

        const heard = [announcer.message()];

        await flush();
        heard.push(announcer.message());

        await flush();
        heard.push(announcer.message());

        /* A stack would read these backwards, which is the kind of mistake
           that is obvious in a list and invisible in a screen reader. */
        expect(heard).toEqual(['One.', 'Two.', 'Three.']);
    });

    it('forgets what is waiting when it is cleared', async () => {
        announcer.announce('One.');
        announcer.announce('Two.');

        announcer.clear();
        await flush();

        /* Not "Two." arriving a moment after the region was emptied. A page
           that asks for quiet and then hears the message it just cancelled is
           worse than one that never cleared at all. */
        expect(announcer.message()).toBe('');
    });

    it('changes the text on every announcement in a sequence', async () => {
        /* The property that matters, stated once over a whole sequence rather
           than as four separate cases - and the test I had to write twice.

           The first version asserted that the third message below differs from
           the first, which is both false and the wrong question. It is false
           because the second message was already a change, so the third needs
           no padding; and it is the wrong question because a screen reader
           reads CHANGES in order and never compares a region's text with what
           it said two changes ago. What has to hold is that consecutive
           renderings differ - every announcement is a mutation - which is
           exactly what this checks.

           It is also the shape of the counter bug. Alternating a nonce per
           call made the padding depend on the number of announcements, so this
           sequence rendered steps 1 and 3 identically AND steps 3 and 4
           identically - and the second of those is a real silence. */
        const heard: string[] = [];

        const say = async (message: string) => {
            announcer.announce(message);
            /* One turn per message, because of the queue: the first renders at
               once and each one after it waits for the gap. */
            await flush();
            heard.push(announcer.message());
        };

        await say('1 match for ada.');
        await say('6 matches for ad.');
        await say('1 match for ada.');
        await say('1 match for ada.');

        for (let i = 1; i < heard.length; i += 1) {
            expect(heard[i], `step ${i + 1} did not change`).not.toBe(heard[i - 1]);
        }

        /* And the part that is deliberately NOT padded: a repeat separated by
           a different message is already distinguishable, so it renders as the
           plain text the caller passed. */
        expect(heard[2]).toBe(heard[0]);
        expect(heard[2]).toBe('1 match for ada.');
    });

    it('does not pad a message that differs from the one before it', async () => {
        /* The other half of the comparison, and the reason the padding is not
           simply always on: a message that is already a change needs no
           invisible character, so the common case stays exactly the text the
           caller passed. */
        announcer.announce('Saved.');
        announcer.announce('Saved.');
        await flush();
        expect(announcer.message()).not.toBe('Saved.');

        announcer.announce('Removed Ada Lovelace.');
        await flush();
        expect(announcer.message()).toBe('Removed Ada Lovelace.');
    });

    it('alternates rather than accumulating', async () => {
        for (let i = 0; i < 6; i += 1) {
            announcer.announce('Saved.');
            await flush();
        }

        /* Six announcements, at most one space. A naive version that appended
           on every call would be building a longer and longer string, and the
           invisible padding would eventually be read as pauses. */
        expect(announcer.message().length).toBeLessThanOrEqual('Saved.'.length + 1);
    });

    it('can be emptied', () => {
        announcer.announce('Saved.');
        announcer.clear();

        expect(announcer.message()).toBe('');
    });
});

/* The test the probe had to find, twice in one day.

   Everything that announces in this app does it from an effect, because the
   thing worth announcing is a signal changing: a result count, a status, a
   page title. `announce` therefore runs inside a reactive context, and a
   tracked read of its own signal in there is an effect that re-runs forever.
   The symptom was not a failing test - all 281 passed - it was the built app
   hanging on the first keystroke in the typeahead, with the probe stopping
   dead after step 4. */
@Component({
    selector: 'app-announcing-thing',
    template: `<p>{{ announcer.message() }}</p>`
})
class AnnouncingThing {
    readonly announcer = inject(Announcer);
    readonly count = signal(1);

    /* Something upstream changing without the message changing - a second
       search with the same outcome, which is the case the padding is for. */
    readonly nudge = signal(0);

    /* Deliberately the shape of DirectorySearch's effect, and deliberately
       without its early returns: contacts-page.ts has a `lastAnnounced` guard
       that happened to stop the loop after one extra pass, which is how half
       the app survived the bug and the typeahead did not. */
    constructor() {
        effect(() => {
            this.nudge();
            this.announcer.announce(`${this.count()} matches.`);
        });
    }
}

describe('announcing from an effect', () => {
    it('settles instead of re-running forever', async () => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({ providers: [NO_GAP] });

        const fixture = TestBed.createComponent(AnnouncingThing);

        /* Put back the tracked read and this is what this line reports:

               AssertionError: expected '1 matches.[NBSP]' to be '1 matches.'

           - the effect ran a second time because it had been made to depend on
           the signal it writes, announced the same message again, and the
           padding went on. A test fixture bounds the re-runs; the built app
           does not, and there the same bug stopped the page dead on the first
           keystroke in the typeahead. So this assertion is about one invisible
           character and the failure it catches is an infinite loop. */
        await fixture.whenStable();
        expect(TestBed.inject(Announcer).message()).toBe('1 matches.');

        /* And the same message announced again by a real change upstream still
           has to mutate the region. This is the padding path, exercised
           through an effect rather than directly. */
        fixture.componentInstance.nudge.update((n) => n + 1);
        await fixture.whenStable();
        await flush();

        expect(TestBed.inject(Announcer).message()).not.toBe('1 matches.');
        expect(TestBed.inject(Announcer).message().trim()).toBe('1 matches.');
    });
});

describe('the announcer region', () => {
    const render = async () => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({ providers: [NO_GAP] });

        const fixture = TestBed.createComponent(AnnouncerRegion);
        await fixture.whenStable();

        return fixture;
    };

    it('is in the DOM before there is anything to announce', async () => {
        const fixture = await render();
        const region = (fixture.nativeElement as HTMLElement).querySelector('#announcer');

        /* THE test of the day. Every live region this app had before today
           failed exactly here: they were inside an `@if` and arrived with
           their message, so there was nothing already being observed for the
           message to be a change to. */
        expect(region).not.toBeNull();
        expect(region?.textContent).toBe('');
    });

    it('is a polite status region, and visually hidden rather than display:none', async () => {
        const fixture = await render();
        const region = (fixture.nativeElement as HTMLElement).querySelector('#announcer');

        expect(region?.getAttribute('role')).toBe('status');
        expect(region?.getAttribute('aria-live')).toBe('polite');
        /* `.sr-only`, which clips the element to 1px and leaves it in the
           accessibility tree. `display: none` or `hidden` would remove it from
           the tree, so its changes would not be announced - the same bug in a
           different disguise. */
        expect(region?.className).toContain('sr-only');
        expect(region?.hasAttribute('hidden')).toBe(false);
    });

    it('shows whatever the service was last told', async () => {
        const fixture = await render();

        TestBed.inject(Announcer).announce('Page 2 of 2.');
        await fixture.whenStable();

        expect(
            (fixture.nativeElement as HTMLElement).querySelector('#announcer')?.textContent?.trim()
        ).toBe('Page 2 of 2.');
    });
});
