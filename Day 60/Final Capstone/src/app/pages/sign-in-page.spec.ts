/* Day 56 - the sign-in page, which is mostly a test of one pure function.

   `safeReturnUrl` is four lines and gets most of this file, because it is the
   only place in six weeks of this course where a string from a URL is turned
   into a navigation. Day 51 put `javascript:alert(1)` into a query parameter
   to see what would happen and the answer was "nothing, it was rendered as
   text". This value is READ AND THEN NAVIGATED TO, which is a different kind
   of thing entirely, and the whitelist is the reason the difference is handled
   rather than noticed.

   The table below is written as one test per shape rather than a loop with
   data, because each row is a different reason - and a failing row should name
   what it was protecting against, not an index. */

import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { SignInPage, safeReturnUrl } from './sign-in-page';
import { SessionService } from '../session.service';
import { SESSION_STORE_KEY } from '../tokens';

describe('safeReturnUrl', () => {
    it('allows a path on this origin', () => {
        expect(safeReturnUrl('/settings')).toBe('/settings');
    });

    it('allows a path with a query string, which is the point of the feature', () => {
        expect(safeReturnUrl('/contacts?filter=work&page=2')).toBe('/contacts?filter=work&page=2');
    });

    it('sends somebody who arrived without a returnUrl to the list', () => {
        /* undefined is the ordinary case: somebody clicked "Sign in" in the
           nav rather than being redirected here. */
        expect(safeReturnUrl(undefined)).toBe('/contacts');
    });

    it('rejects a protocol-relative URL', () => {
        /* `//evil.test/` is the one that catches people out. It has no scheme,
           it starts with a slash, and it is a fully qualified URL to another
           origin - so a check for "starts with /" alone is an open redirect,
           and that check is what I wrote first. */
        expect(safeReturnUrl('//evil.test/')).toBe('/contacts');
    });

    it('rejects an absolute URL', () => {
        expect(safeReturnUrl('https://evil.test/settings')).toBe('/contacts');
    });

    it('rejects a javascript: URL', () => {
        expect(safeReturnUrl('javascript:alert(1)')).toBe('/contacts');
    });

    it('rejects a relative path, which is ambiguous rather than dangerous', () => {
        /* "settings" would resolve against wherever the router happens to be,
            which is not an attack and is not predictable either. A whitelist
            refuses things it cannot reason about, not only things it fears. */
        expect(safeReturnUrl('settings')).toBe('/contacts');
    });

    it('rejects an empty string', () => {
        expect(safeReturnUrl('')).toBe('/contacts');
    });
});

describe('SignInPage', () => {
    const KEY = 'day56.session.signin.spec';

    let navigated: string[];

    const render = async (returnUrl?: string) => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            providers: [provideRouter([]), { provide: SESSION_STORE_KEY, useValue: KEY }]
        });

        navigated = [];

        const router = TestBed.inject(Router);

        /* Replacing one method rather than providing a fake Router.

           The component's only interaction with the router is this call, and a
           whole fake Router would be forty members of which one matters -
           which is Day 54's lesson about mocks that are bigger than the thing
           they stand for. Keeping the real router means `provideRouter([])` is
           still what wires up everything else. */
        router.navigateByUrl = ((url: string) => {
            navigated.push(String(url));
            return Promise.resolve(true);
        }) as never;

        const fixture = TestBed.createComponent(SignInPage);

        if (returnUrl !== undefined) fixture.componentRef.setInput('returnUrl', returnUrl);

        await fixture.whenStable();

        return fixture;
    };

    const element = (fixture: Awaited<ReturnType<typeof render>>) =>
        fixture.nativeElement as HTMLElement;

    const type = async (fixture: Awaited<ReturnType<typeof render>>, value: string) => {
        const input = element(fixture).querySelector<HTMLInputElement>('#sign-in-name')!;

        input.value = value;
        input.dispatchEvent(new Event('input'));

        await fixture.whenStable();
    };

    const submit = async (fixture: Awaited<ReturnType<typeof render>>) => {
        element(fixture).querySelector('form')!.dispatchEvent(new Event('submit'));
        await fixture.whenStable();
    };

    beforeEach(() => {
        localStorage.removeItem(KEY);
    });

    it('says nothing about a redirect when nobody was redirected', async () => {
        const fixture = await render();

        expect(element(fixture).querySelector('#sign-in-reason')).toBeNull();
    });

    it('explains why it is showing when a guard sent the visitor here', async () => {
        const fixture = await render('/settings');

        /* The sentence that stops a guard being a dead end. Without it,
           somebody who asked for /settings arrives at a sign-in form with no
           explanation of what happened to their click. */
        expect(element(fixture).querySelector('#sign-in-reason')?.textContent).toContain(
            '/settings'
        );
    });

    it('refuses an empty name without navigating', async () => {
        const fixture = await render('/settings');

        await submit(fixture);

        expect(element(fixture).querySelector('#sign-in-error')).not.toBeNull();
        expect(navigated).toEqual([]);
        expect(TestBed.inject(SessionService).signedIn()).toBe(false);
    });

    it('shows no error before the first submit', async () => {
        const fixture = await render();

        /* An empty field is not a mistake until somebody has tried to use it.
           Day 49's rule about `submitted`, and the reason it is a separate
           signal from the value. */
        expect(element(fixture).querySelector('#sign-in-error')).toBeNull();
    });

    it('signs in and finishes the navigation the guard interrupted', async () => {
        const fixture = await render('/settings?tab=api');

        await type(fixture, 'Ada Lovelace');
        await submit(fixture);

        expect(TestBed.inject(SessionService).name()).toBe('Ada Lovelace');
        expect(navigated).toEqual(['/settings?tab=api']);
    });

    it('sends somebody who signed in of their own accord to the list', async () => {
        const fixture = await render();

        await type(fixture, 'Grace');
        await submit(fixture);

        expect(navigated).toEqual(['/contacts']);
    });

    it('does not follow a returnUrl pointing off this origin', async () => {
        const fixture = await render('//evil.test/');

        await type(fixture, 'Ada');
        await submit(fixture);

        /* Signed in, and sent to the list rather than off the origin. The
           sign-in still succeeds, because the bad parameter is somebody else's
           doing and not a reason to refuse the person in front of us. */
        expect(TestBed.inject(SessionService).signedIn()).toBe(true);
        expect(navigated).toEqual(['/contacts']);
    });
});
