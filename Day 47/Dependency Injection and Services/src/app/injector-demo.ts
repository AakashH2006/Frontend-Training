/* Day 47 - what "provided at the right scope" means.

   Three instances of the same component, injecting the same class. Two take
   the root instance; the third provides its own, so it gets a separate one.

   That is the whole of injection scope, and watching two counters disagree
   made it concrete in a way the documentation diagram did not. */

import { Component, Injectable, inject, input, signal } from '@angular/core';

/* No `providedIn`, so this class is NOT automatically available anywhere.
   Something has to provide it - which is exactly what makes it useful for
   demonstrating scope.

   `providedIn: 'root'` would make every injector resolve to one instance and
   there would be nothing to see. */
@Injectable()
export class CounterService {
    private readonly count = signal(0);
    readonly value = this.count.asReadonly();

    /* An id, so two instances are distinguishable on the page. Generated in
       the field initialiser, which runs once per instance. */
    readonly id = Math.random().toString(36).slice(2, 7);

    increment(): void {
        this.count.update((n) => n + 1);
    }
}

@Component({
    selector: 'app-counter',
    imports: [],
    template: `
        <div class="demo">
            <p class="text-sm">
                <strong>{{ label() }}</strong> &mdash; instance
                <code>{{ counter.id }}</code>, count
                <strong>{{ counter.value() }}</strong>
            </p>
            <button type="button" class="button button--small" (click)="counter.increment()">
                Increment
            </button>
        </div>
    `
})
export class Counter {
    readonly label = input.required<string>();

    /* `protected`, because the template reads `counter.id` and
       `counter.value()`. A template can reach protected members; `private`
       would be a compile error under strictTemplates, which is
       `strictInputAccessModifiers` and friends doing their job. */
    protected readonly counter = inject(CounterService);
}

/* The same component, with its own provider.

   `providers` on a @Component creates a new injector for that component and
   everything below it. So this one gets its own CounterService, and the two
   plain <app-counter> elements share the root one.

   The real use for this is a component that should not share state with
   another instance of itself - a dialog, a wizard step, a row editor. The
   mistake it prevents is the opposite of the usual one: not "two things
   sharing state by accident" but "two things that must NOT share, sharing". */
@Component({
    selector: 'app-counter-own',
    imports: [Counter],
    providers: [CounterService],
    template: `<app-counter [label]="label()" />`
})
export class CounterOwn {
    readonly label = input.required<string>();
}
