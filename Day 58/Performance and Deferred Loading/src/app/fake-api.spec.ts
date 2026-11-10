/* Day 58 - the first spec that talks to the fake server instead of mocking it.

   Every other HTTP spec in this project uses `HttpTestingController`: the
   request is asserted and an answer is handed back by the test. That is the
   right tool for `contacts.api.spec.ts`, which is about what the CLIENT sends
   and how it reads a reply - and it is structurally incapable of catching what
   Day 57 left behind, because in those specs there is no server, no store and
   nothing that persists.

   `fake-api.ts` had never been tested at all. It is 700 lines of the thing the
   whole app runs against, and a write to it had not worked since the day the
   store moved into `localStorage`:

       PATCH /api/contacts/c4   200   131ms
       GET   /api/contacts/c4   200   123ms    <- the old value, unchanged

   It answered 200 and discarded the write. `row === existing` compared an
   object from one `JSON.parse` with an object from the next one.

   So this file wires the interceptor to a real `HttpClient` with no testing
   backend behind it and asks the only question that matters about a server:
   after a write, what does a read say? */

import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { FakeApiStore, fakeApiInterceptor } from './fake-api';
import { SettingsService } from './settings.service';
import { API_BASE } from './tokens';

/* Three rows, written straight into the store so that nothing falls through
   to the static fixture file. A GET with an empty store seeds itself from
   /api/contacts.json, which is a real network request with no server behind it
   in here - seeding the store first is what keeps this spec about writes. */
const SEED = [
    { id: 'c1', name: 'Ada Lovelace', email: 'ada@example.com', group: 'work', tags: ['maths'], favourite: false, addedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'c2', name: 'Grace Hopper', email: 'grace@example.com', group: 'work', tags: ['compilers'], favourite: true, addedAt: '2026-01-02T00:00:00.000Z' },
    { id: 'c3', name: 'Katherine Johnson', email: 'katherine@example.com', group: 'friends', tags: [], favourite: false, addedAt: '2026-01-03T00:00:00.000Z' }
];

describe('the fake API, end to end', () => {
    let http: HttpClient;
    let store: FakeApiStore;

    beforeEach(() => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            providers: [
                provideHttpClient(withInterceptors([fakeApiInterceptor])),
                { provide: API_BASE, useValue: '/api' }
            ]
        });

        http = TestBed.inject(HttpClient);
        store = TestBed.inject(FakeApiStore);

        /* No latency, or every assertion below waits 150ms for no reason. The
           delay is the one part of this server that exists purely to be looked
           at, and `setLatency` is the same method the settings page calls. */
        TestBed.inject(SettingsService).setLatency(0);

        store.write(SEED.map((row) => ({ ...row })));
    });

    const one = (id: string) =>
        firstValueFrom(http.get<Record<string, unknown>>(`/api/contacts/${id}`));

    it('serves a record it was seeded with', async () => {
        const ada = await one('c1');

        expect(ada['name']).toBe('Ada Lovelace');
        expect(ada['favourite']).toBe(false);
    });

    it('keeps a PATCH, which is the bug this file was written for', async () => {
        const patched = await firstValueFrom(
            http.patch<Record<string, unknown>>('/api/contacts/c1', { favourite: true })
        );

        /* The response was always right. */
        expect(patched['favourite']).toBe(true);

        /* This is the line that failed before the fix, and it failed while
           everything a user could see said the write had worked. */
        expect((await one('c1'))['favourite']).toBe(true);
    });

    it('merges a PATCH rather than replacing the record', async () => {
        await firstValueFrom(http.patch('/api/contacts/c2', { favourite: false }));

        const grace = await one('c2');

        expect(grace['favourite']).toBe(false);
        expect(grace['name']).toBe('Grace Hopper');
        expect(grace['email']).toBe('grace@example.com');
    });

    it('keeps a PUT, and keeps the fields the server owns', async () => {
        await firstValueFrom(
            http.put('/api/contacts/c1', {
                name: 'Ada King',
                email: 'ada@example.com',
                group: 'work',
                tags: ['maths'],
                favourite: false
            })
        );

        const ada = await one('c1');

        expect(ada['name']).toBe('Ada King');
        /* `id` and `addedAt` are the server's, not the client's - the spread
           order in fake-api.ts says so and this is the assertion that holds it
           there. */
        expect(ada['id']).toBe('c1');
        expect(ada['addedAt']).toBe('2026-01-01T00:00:00.000Z');
    });

    it('keeps a DELETE', async () => {
        await firstValueFrom(http.delete('/api/contacts/c3'));

        /* The loud version of the same bug: the notice said "Removed
           Katherine Johnson." and the list still had her in it. */
        await expect(one('c3')).rejects.toThrow();

        const list = await firstValueFrom(
            http.get<{ rows: readonly unknown[]; matched: number }>('/api/contacts')
        );

        expect(list.matched).toBe(2);
    });

    it('keeps a POST, and gives it an id', async () => {
        const created = await firstValueFrom(
            http.post<Record<string, unknown>>('/api/contacts', {
                name: 'Jean Bartik',
                email: 'jean@example.com',
                group: 'work',
                tags: ['eniac'],
                favourite: false
            })
        );

        const id = created['id'];
        expect(typeof id).toBe('string');

        /* Creating worked all along - `[created, ...rows]` never had to
           identify an existing row - which is why the store looked like it
           persisted and three of its five verbs did not. */
        expect((await one(String(id)))['name']).toBe('Jean Bartik');
    });

    it('refuses an email another contact already uses', async () => {
        await expect(
            firstValueFrom(
                http.post('/api/contacts', {
                    name: 'Somebody Else',
                    email: 'ada@example.com',
                    group: 'work',
                    tags: [],
                    favourite: false
                })
            )
        ).rejects.toThrow();

        /* And the rejection did not leave a half-written store behind. */
        const list = await firstValueFrom(
            http.get<{ matched: number }>('/api/contacts')
        );

        expect(list.matched).toBe(3);
    });

    it('404s a write to an id that is not there', async () => {
        await expect(
            firstValueFrom(http.patch('/api/contacts/nope', { favourite: true }))
        ).rejects.toThrow();

        await expect(firstValueFrom(http.delete('/api/contacts/nope'))).rejects.toThrow();
    });
});
