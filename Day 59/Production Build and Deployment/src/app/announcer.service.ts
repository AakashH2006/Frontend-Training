/* Day 57 - one live region, and why the four this app already had did not work.

   A live region is an element a screen reader watches. When its text changes,
   the change is read out. The important word is CHANGES: the region has to be
   in the accessibility tree BEFORE the message appears, because what gets
   announced is a mutation of something already being observed.

   Every live region in this app failed that, and they failed it invisibly:

       @if (notifications.latest(); as notice) {
           <p role="status" id="notice">{{ notice.message }}</p>
       }

   The element and its text arrive together. There was nothing to mutate, so
   there is nothing reliably announced - and nothing on screen looks wrong,
   which is why four of these accumulated over nine days without one of them
   being noticed. The probe for Day 56 counted the live regions present on a
   resting page: one, and that one only because a malformed fixture row meant
   its `@if` happened to be true.

   The fix is not "add `aria-live` in more places". It is ONE region, rendered
   once by the shell, never removed, whose text changes - and this service is
   the only way to change it. Anything that wants to say something to a screen
   reader calls `announce`, exactly as anything that wants to show a notice
   calls `NotificationsService.show` (Day 48, same argument: a thing with no
   common parent needs a service).

   Which also removes the duplicate-announcement problem the naive fix creates.
   With one region, nothing can be announced twice by two different mechanisms,
   and the visible status paragraphs go back to being ordinary text. */

import { InjectionToken, Injectable, computed, inject, signal, untracked } from '@angular/core';

/* How long a message keeps the region to itself.

   A token rather than a constant for the same reason as Day 56's
   API_RETRY_DELAY: the tests and the probe set it to 0 and do not spend real
   seconds proving an ordering property. 150ms is a guess with a reason - long
   enough that the two messages below are two separate mutations of the
   accessibility tree rather than one, short enough that a person who removes a
   contact and lands on the list does not wait for the second sentence. I have
   no way to measure what a particular screen reader does with two changes
   150ms apart, and the notes say so rather than pretending otherwise. */
export const ANNOUNCE_GAP = new InjectionToken<number>('ANNOUNCE_GAP', {
    providedIn: 'root',
    factory: () => 150
});

/* U+00A0, as an escape rather than as the character.

   The first version of this file had the character itself in the string
   literal, which worked and is unreviewable: an invisible character in source
   looks like an empty string to everybody reading it, including me three
   minutes later. A named constant with an escape says what it is. */
const PAD = '\u00a0';

@Injectable({ providedIn: 'root' })
export class Announcer {
    private readonly gap = inject(ANNOUNCE_GAP);

    private readonly messageSignal = signal('');

    /* Messages waiting their turn, and the probe is the reason there is a
       queue at all.

       Removing a contact announces the notice and then navigates, and the
       navigation announces the page it lands on. Two calls, one change
       detection cycle, and the region's text is a signal - so the DOM was
       rendered ONCE, with the second message. The MutationObserver in the
       probe recorded exactly one change:

           announced in order : "Contacts"

       and the sentence the user needed - "Removed Jean Bartik." - had been
       overwritten before it was ever in the document. A live region announces
       mutations, so a message that never renders is a message that was never
       said, and signals are glitch-free precisely so that intermediate values
       do not render. The mechanism that makes the rest of this app correct is
       the mechanism that lost this message.

       One at a time, then: the first renders at once, and anything that
       arrives while it is current waits a gap and renders after it. */
    private readonly queue: string[] = [];
    private timer: ReturnType<typeof setTimeout> | null = null;

    /* The same message twice is a real case and it needs this.

       "No matches for ada" announced, then announced again after another
       search with the same outcome: the text is identical, so the DOM does not
       change, so there is no mutation and nothing is read. The user searched
       and heard nothing, which is indistinguishable from the app being broken.

       A trailing no-break space is the smallest fix that does not involve
       emptying the region and filling it again on a timer. The text differs by
       one invisible character, so the DOM changes; screen readers read the
       space as nothing.

       WHETHER to pad is a comparison, not a counter, and that distinction was
       a bug the probe found. The first version alternated a nonce on every
       call, so the padding depended on how many announcements had been made
       rather than on what the region currently said. Two identical messages
       with one DIFFERENT message between them therefore landed on the same
       parity and rendered the same string:

           ada -> "1 match for ada."      (odd, clean)
           ad  -> "6 matches for ad."     (even, padded)
           ada -> "1 match for ada."      (odd, clean - identical to the first)

       which the probe measured as `same search again : IDENTICAL - silent`.
       Comparing against the message in hand cannot get that wrong: pad only
       when this text is what the region already holds, and drop the padding
       otherwise, because a different message is already a change. */
    private readonly padded = signal(false);

    readonly message = computed(() =>
        this.messageSignal() === ''
            ? ''
            : `${this.messageSignal()}${this.padded() ? PAD : ''}`
    );

    announce(message: string): void {
        const text = message.trim();
        if (text.length === 0) return;

        /* Nothing is current and nothing is waiting: say it now, so a single
           announcement is still synchronous and a caller that does not care
           about queueing cannot tell there is one. */
        if (this.timer === null && this.queue.length === 0) {
            this.show(text);
            this.hold();
            return;
        }

        this.queue.push(text);
    }

    /* For a page that wants the region quiet again - and for tests, which
       would otherwise carry the previous test's message into the next one. */
    clear(): void {
        this.queue.length = 0;

        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        this.messageSignal.set('');
    }

    private show(text: string): void {
        /* `untracked`, and this is the second thing the comparison cost that
           the counter did not.

           Every caller of this method is an effect: the typeahead announces
           its count, the contacts page announces its summary, the title
           strategy announces the page. So this body runs INSIDE a reactive
           context, and a plain `this.messageSignal()` there is not just a read
           - it makes the calling effect depend on the signal this method is
           about to write. The effect re-runs, announces again, writes again,
           and does not stop.

           The counter version was accidentally safe: `signal.update` reads the
           current value without registering a dependency, so nothing was ever
           tracked. Swapping it for a comparison introduced a tracked read in
           the same breath, and the whole app hung on the first keystroke in
           the typeahead - with 281 passing specs, because a spec calls
           `announce` directly and there is no effect to re-run.

           `untracked` for the read, and `update` rather than `set(!this.
           padded())` for the write, for the same reason in the same line. */
        const repeat = text === untracked(this.messageSignal);

        this.padded.update((padded) => (repeat ? !padded : false));
        this.messageSignal.set(text);
    }

    /* The quiet period after a message, and the thing that drains the queue.

       It is armed even when nothing is waiting, which looks wasteful and is
       the point: without it, a message arriving a millisecond later would find
       `timer === null`, decide nothing is current, and overwrite the message
       that has not been read yet. The timer IS the "something is current"
       flag. */
    private hold(): void {
        this.timer = setTimeout(() => {
            this.timer = null;

            const next = this.queue.shift();
            if (next === undefined) return;

            this.show(next);
            this.hold();
        }, this.gap);
    }
}
