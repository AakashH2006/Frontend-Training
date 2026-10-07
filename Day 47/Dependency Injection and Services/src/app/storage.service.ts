/* Day 47 - the storage boundary, as a service.

   Week 5's repository.ts and Week 7's persistence.ts, in Angular's shape. The
   logic is unchanged because it was never framework code - four failure modes,
   a version envelope, and a guard over anything already on disk.

   What is new is that it is INJECTED, which is the thing that makes it
   testable: a test provides a different implementation and the reading list
   service never knows. That is what Week 5 achieved by passing `storage` as a
   constructor parameter with a default; Angular's injector does the same job
   without the parameter. */

import { Injectable, inject } from '@angular/core';

import { STORAGE_KEY } from './tokens';
import { isStatus, type Book } from './domain';

const VERSION = 1;

interface Envelope {
    readonly version: number;
    readonly savedAt: string;
    readonly books: readonly Book[];
}

@Injectable({ providedIn: 'root' })
export class StorageService {
    /* Injecting a VALUE rather than a class.

       `STORAGE_KEY` is an InjectionToken, which exists because you cannot
       inject a string by its type - every string has the same type. The token
       is the identity.

       This is the DI concept I found least obvious and it is the one that
       makes configuration injectable: a test or a second app can provide a
       different key without touching this file. */
    private readonly key = inject(STORAGE_KEY);

    /* Probed once, with a real write inside a try. In Safari private mode and
       with site data blocked, `localStorage` exists and throws on access - so
       a typeof check is not enough. Day 19 found that the hard way, and it has
       been the same four lines in three frameworks. */
    readonly available = ((): boolean => {
        try {
            const probe = '__probe__';
            localStorage.setItem(probe, probe);
            localStorage.removeItem(probe);
            return true;
        } catch {
            return false;
        }
    })();

    /* The last problem, so the UI can say what happened rather than failing
       quietly. Day 24: "empty" and "broken" are different states. */
    private lastProblem: string | null = null;

    problem(): string | null {
        return this.lastProblem;
    }

    load(): readonly Book[] | null {
        if (!this.available) {
            this.lastProblem =
                'This browser is blocking local storage, so the list will be lost on reload.';
            return null;
        }

        const raw = localStorage.getItem(this.key);
        if (raw === null) return null;

        let parsed: unknown;

        try {
            /* `unknown`, never `any`. JSON.parse's declared return type is the
               one place the no-any rule is not mine to enforce. */
            parsed = JSON.parse(raw);
        } catch {
            this.lastProblem = 'The saved list could not be read, so it has been reset.';
            return null;
        }

        if (typeof parsed !== 'object' || parsed === null) {
            this.lastProblem = 'The saved list was not in the expected shape.';
            return null;
        }

        const envelope = parsed as Partial<Envelope>;

        if (envelope.version !== VERSION) {
            this.lastProblem = `The saved list is version ${String(envelope.version)}, and this app expects ${VERSION}.`;
            return null;
        }

        if (!Array.isArray(envelope.books)) {
            this.lastProblem = 'The saved list was not in the expected shape.';
            return null;
        }

        const books = envelope.books.filter(isBook);
        const skipped = envelope.books.length - books.length;

        this.lastProblem =
            skipped === 0
                ? null
                : skipped === 1
                  ? '1 saved entry could not be read and was skipped.'
                  : `${skipped} saved entries could not be read and were skipped.`;

        return books;
    }

    save(books: readonly Book[]): void {
        if (!this.available) return;

        const envelope: Envelope = { version: VERSION, savedAt: new Date().toISOString(), books };

        try {
            localStorage.setItem(this.key, JSON.stringify(envelope));
            this.lastProblem = null;
        } catch (error) {
            const quota =
                error instanceof DOMException &&
                (error.name === 'QuotaExceededError' ||
                    error.name === 'NS_ERROR_DOM_QUOTA_REACHED');

            this.lastProblem = quota
                ? 'The list is too large to save in this browser.'
                : 'Could not save the list in this browser.';
        }
    }

    clear(): void {
        if (!this.available) return;
        localStorage.removeItem(this.key);
    }
}

/* A guard over data that was written by an older version of this code and is
   untrusted. Week 5's storage boundary, unchanged. */
function isBook(value: unknown): value is Book {
    if (typeof value !== 'object' || value === null) return false;

    const candidate = value as Record<string, unknown>;

    return (
        typeof candidate['id'] === 'string' &&
        typeof candidate['title'] === 'string' &&
        Array.isArray(candidate['authors']) &&
        candidate['authors'].every((name) => typeof name === 'string') &&
        typeof candidate['addedAt'] === 'string' &&
        isStatus(candidate['status'])
    );
}
