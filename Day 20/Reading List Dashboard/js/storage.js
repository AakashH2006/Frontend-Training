/* Day 20 - localStorage, wrapped. Unchanged from Day 19 apart from the key.

   Nothing else in the app calls localStorage directly. Every read and write
   goes through here, because raw localStorage has four sharp edges:

     1. It stores strings only. Objects have to be serialised by hand.
     2. Reading can return corrupt JSON that throws on parse.
     3. Writing can throw QuotaExceededError.
     4. It can be unavailable entirely - Safari private mode, or a browser
        configured to block site data - and the throw happens on ACCESS, not
        on use, so it has to be tested inside a try block. */

const KEY = "day20.readingList";
const VERSION = 1;


/* Feature-detect once. `typeof localStorage` is not enough: in a blocked
   context the object exists and throws when touched. */
const available = (() => {
    try {
        const probe = "__probe__";
        localStorage.setItem(probe, probe);
        localStorage.removeItem(probe);
        return true;
    } catch {
        return false;
    }
})();


/* The in-memory fallback. If storage is unavailable the app still works for
   the session - it just forgets on reload. That is a better failure than a
   page that refuses to start. */
let memoryFallback = null;

export const isPersistent = available;


function readRaw() {
    if (!available) return memoryFallback;

    try {
        return localStorage.getItem(KEY);
    } catch {
        return null;
    }
}


function writeRaw(value) {
    if (!available) {
        memoryFallback = value;
        return { ok: true, persisted: false };
    }

    try {
        localStorage.setItem(KEY, value);
        return { ok: true, persisted: true };
    } catch (error) {
        // QuotaExceededError is the one that actually happens. The name
        // differs between engines, so the code is checked too.
        const isQuota =
            error.name === "QuotaExceededError" ||
            error.name === "NS_ERROR_DOM_QUOTA_REACHED";

        return { ok: false, persisted: false, reason: isQuota ? "quota" : "unknown" };
    }
}


/* A version number in the envelope. Today it only ever reads version 1, but
   the check is what makes it possible to change the shape later without
   every existing user hitting a crash on load. */
export function load() {
    const raw = readRaw();
    if (!raw) return [];

    try {
        const parsed = JSON.parse(raw);

        if (!parsed || typeof parsed !== "object") return [];
        if (parsed.version !== VERSION) {
            console.warn(`Stored data is version ${parsed.version}, expected ${VERSION}. Ignoring it.`);
            return [];
        }
        if (!Array.isArray(parsed.items)) return [];

        return parsed.items;
    } catch {
        // Corrupt JSON. Someone edited it in DevTools, or a write was cut off.
        // Returning [] loses the data, which is better than never loading.
        console.warn("Stored reading list was not valid JSON. Starting empty.");
        return [];
    }
}


export function save(items) {
    const envelope = JSON.stringify({
        version: VERSION,
        savedAt: new Date().toISOString(),
        items
    });

    return writeRaw(envelope);
}


export function clear() {
    memoryFallback = null;
    if (!available) return;

    try {
        localStorage.removeItem(KEY);
    } catch {
        /* nothing useful to do */
    }
}


/* Roughly how much room the list is taking. Two bytes per character is the
   usual assumption for the UTF-16 strings localStorage holds. */
export function usage() {
    const raw = readRaw() ?? "";
    return { characters: raw.length, approximateBytes: raw.length * 2 };
}
