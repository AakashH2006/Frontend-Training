/* Day 59 - the first spec this project has for a token's factory.

   `API_BASE` was the string `/api` for seven days and nothing could have
   tested it: a constant is not behaviour. It is now derived from the
   document's `<base href>`, which is behaviour, and it is behaviour with a
   deployment riding on it - get it wrong and the app routes correctly while
   fetching from a path the host does not have.

   Two levels of test, deliberately:

   - `apiBase`, the pure string function, with a table. Trailing slashes,
     absolute base hrefs and the empty string are the cases I would otherwise
     have had to reason about every time I read it.
   - the token itself, with a configured base href, because the thing worth
     checking is that the factory asks `PlatformLocation` at all. A test of the
     function alone would pass with the factory wired to nothing. The first
     attempt at that test put a `<base>` element in the document and failed for
     a reason worth reading - see the note above the describe. */

import { MOCK_PLATFORM_LOCATION_CONFIG } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { API_BASE, apiBase } from './tokens';

describe('apiBase', () => {
    it('stays at the root when there is no base href', () => {
        /* What `getBaseHrefFromDOM()` returns when the document has no <base>,
           which is every other spec in this project. */
        expect(apiBase('')).toBe('/api');
        expect(apiBase('   ')).toBe('/api');
    });

    it('stays at the root for a base href of /', () => {
        expect(apiBase('/')).toBe('/api');
    });

    it('follows the app into a subdirectory', () => {
        /* The GitHub Pages case, which is the reason this function exists. */
        expect(apiBase('/Frontend-Training/')).toBe('/Frontend-Training/api');
    });

    it('does not mind a missing trailing slash', () => {
        /* `ng build --base-href /app` is accepted by the CLI and writes
           exactly that, so this is not a hypothetical. */
        expect(apiBase('/app')).toBe('/app/api');
    });

    it('collapses repeated slashes at the end', () => {
        expect(apiBase('/app//')).toBe('/app/api');
    });

    it('takes the path out of an absolute base href', () => {
        /* `<base href="https://example.com/app/">` is legal HTML, and keeping
           the origin would turn every request in the app into a cross-origin
           one - which would fail CORS against a host that has no reason to
           allow it, for requests going back to the very page that is running. */
        expect(apiBase('https://example.com/app/')).toBe('/app/api');
        expect(apiBase('https://example.com/')).toBe('/api');
    });
});

describe('API_BASE, through PlatformLocation', () => {
    /* NOT by putting a <base> element in the document, which is what I tried
       first and what the test below would otherwise be:

           AssertionError: expected '/api' to be '/Frontend-Training/api'

       because `TestBed` does not use the browser's `PlatformLocation`. It
       provides `MockPlatformLocation`, whose `getBaseHrefFromDOM()` returns
       whatever `MOCK_PLATFORM_LOCATION_CONFIG` says and never looks at the
       document at all. Half an hour of staring at a correct factory, and the
       lesson is a good one: a test environment that replaces the thing you are
       testing against will not tell you so.

       So the base href is configured the way the framework intends, and the
       assertion is about the factory - that it asks `PlatformLocation` and
       passes the answer through `apiBase`. Whether the real browser
       implementation reads `<base>` correctly is Angular's test, not mine; the
       probe checks the end-to-end result against a built bundle. */
    const withBaseHref = (appBaseHref: string) => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            providers: [{ provide: MOCK_PLATFORM_LOCATION_CONFIG, useValue: { appBaseHref } }]
        });

        return TestBed.inject(API_BASE);
    };

    afterEach(() => {
        TestBed.resetTestingModule();
    });

    it('reads the base href the build wrote', () => {
        expect(withBaseHref('/Frontend-Training/')).toBe('/Frontend-Training/api');
    });

    it('is /api when the app is served from the root', () => {
        expect(withBaseHref('/')).toBe('/api');
    });

    it('is /api when nothing has configured a base at all', () => {
        /* The factory must survive a document without a `<base>`, because that
           is what a test fixture is - and because an index.html without one is
           a valid way to serve an app from the root. */
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({ providers: [] });

        expect(TestBed.inject(API_BASE)).toBe('/api');
    });
});
