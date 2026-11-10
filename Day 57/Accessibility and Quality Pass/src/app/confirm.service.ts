/* Day 56 - asking the user a yes/no question, as an Observable<boolean>.

   This exists because of `canDeactivate`. A guard can return a boolean, a
   Promise or an Observable, and the interesting case is the one where the
   answer comes from the user - so the guard has to ASK and then wait, without
   blocking anything.

   The obvious implementation is `window.confirm`, and it is one line:

       canDeactivate: () => window.confirm('Discard your changes?')

   It is also wrong for three reasons I can state rather than assert.

     1. It BLOCKS the main thread and every timer on it. The poll on the detail
        page stops, pending requests do not settle, and nothing renders until
        the dialog is dismissed.
     2. It cannot be styled, cannot be tested without stubbing a global, and
        looks like a browser warning rather than part of the app - which is
        exactly the look people have been trained to dismiss.
     3. It is not available everywhere. In an embedded webview, and in jsdom,
        `confirm` either does nothing or throws - so a probe cannot drive the
        very flow the guard exists for. Day 54's note about not triggering
        modal dialogs in an automated browser is the same problem from the
        other end.

   So the question becomes state: the service holds the pending question, the
   shell renders it, and the guard gets an Observable that emits once when the
   user chooses. `Subject` rather than `BehaviorSubject`, because there is no
   "current value" of a question nobody has answered. */

import { Injectable, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';

export interface Question {
    readonly title: string;
    readonly body: string;
    readonly confirmLabel: string;
    readonly cancelLabel: string;
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
    private readonly questionSignal = signal<Question | null>(null);

    /* The subject for the question currently on screen. There is at most one,
       because a second question while one is open would be a bug in whatever
       asked - and the router cannot start a second navigation while the first
       is waiting on a guard. */
    private answer: Subject<boolean> | null = null;

    readonly question = this.questionSignal.asReadonly();

    ask(question: Partial<Question> & { body: string }): Observable<boolean> {
        /* If something asks while a question is open, the old one is answered
           "no" rather than left hanging. A guard waiting on an Observable that
           never emits is a navigation that never completes and a UI with no
           way out - the worst failure this file could have. */
        this.answer?.next(false);
        this.answer?.complete();

        const subject = new Subject<boolean>();
        this.answer = subject;

        this.questionSignal.set({
            title: question.title ?? 'Are you sure?',
            confirmLabel: question.confirmLabel ?? 'Yes',
            cancelLabel: question.cancelLabel ?? 'No',
            body: question.body
        });

        return subject.asObservable();
    }

    respond(confirmed: boolean): void {
        const subject = this.answer;

        this.questionSignal.set(null);
        this.answer = null;

        subject?.next(confirmed);
        /* `complete()` as well as `next()`, because a guard subscribes and
           waits for the FIRST value - but an Observable that emits and never
           completes leaves the router's subscription open. Completing is what
           makes this a one-shot question rather than a stream of answers. */
        subject?.complete();
    }
}
