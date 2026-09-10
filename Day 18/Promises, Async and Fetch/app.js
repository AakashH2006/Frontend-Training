/* Day 18 - Promises, async/await and Fetch
   A small directory app over a public JSON API. The interesting part is not
   the happy path, it is the other three states: loading, empty and error.

   API: https://jsonplaceholder.typicode.com - public, no key, CORS enabled. */

console.log("=== Day 18 - Promises, async/await and Fetch ===");


/* ---------------------------------------------------------------
   1. Promise fundamentals, in the console
   --------------------------------------------------------------- */

// A promise is an object representing a value that is not there yet. It is
// pending, then either fulfilled with a value or rejected with a reason, and
// once settled it never changes again.

const wait = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

const mightFail = (shouldFail) =>
    new Promise((resolve, reject) => {
        setTimeout(() => {
            if (shouldFail) reject(new Error("deliberate failure"));
            else resolve("worked");
        }, 50);
    });

// then / catch / finally is the older form. async/await is the same machinery
// with different syntax - awaiting is not an alternative to promises.
mightFail(false)
    .then((result) => console.log("then:", result))
    .catch((error) => console.log("catch:", error.message))
    .finally(() => console.log("finally: runs either way"));

mightFail(true)
    .then((result) => console.log("not reached:", result))
    .catch((error) => console.log("catch:", error.message));

// Ordering. Synchronous code finishes first; then queued promise callbacks
// (microtasks); then timers (macrotasks), even a zero-delay one.
console.log("\n--- Ordering ---");
console.log("1 - synchronous");
setTimeout(() => console.log("4 - setTimeout 0 (macrotask)"), 0);
Promise.resolve().then(() => console.log("3 - promise callback (microtask)"));
console.log("2 - synchronous");

// Sequential against parallel. Two independent requests should not queue up
// behind each other.
(async () => {
    const startSequential = Date.now();
    await wait(120, "a");
    await wait(120, "b");
    console.log(`\nSequential awaits: ~${Date.now() - startSequential}ms`);

    const startParallel = Date.now();
    // Start both, THEN await both. Promise.all rejects as soon as any one
    // rejects, and resolves with an array of results in the original order.
    await Promise.all([wait(120, "a"), wait(120, "b")]);
    console.log(`Promise.all:       ~${Date.now() - startParallel}ms`);

    // allSettled never rejects. Every entry is {status, value} or
    // {status, reason}, which is what I want when a partial answer is useful.
    const settled = await Promise.allSettled([mightFail(false), mightFail(true)]);
    console.log("allSettled:", settled.map((entry) => entry.status).join(", "));

    // race settles with whichever finishes first, win or lose. This is the
    // hand-rolled timeout pattern, before AbortSignal.timeout existed.
    const raced = await Promise.race([wait(30, "fast"), wait(300, "slow")]);
    console.log("race winner:", raced);
})();


/* ---------------------------------------------------------------
   2. Elements and state
   --------------------------------------------------------------- */

const API = "https://jsonplaceholder.typicode.com";

const searchInput = document.getElementById("search");
const reloadButton = document.getElementById("reload");
const results = document.getElementById("results");
const detail = document.getElementById("detail");
const statusLine = document.getElementById("status");
const cardTemplate = document.getElementById("card-template");
const skeletonTemplate = document.getElementById("skeleton-template");

const state = {
    users: [],
    search: "",
    phase: "idle"   // idle | loading | success | empty | error
};

// One controller per in-flight request, so a new request can cancel the last.
let controller = null;


/* ---------------------------------------------------------------
   3. The fetch helper
   --------------------------------------------------------------- */

class HttpError extends Error {
    constructor(status, statusText, url) {
        super(`${status} ${statusText}`);
        this.name = "HttpError";
        this.status = status;
        this.url = url;
    }
}

async function getJSON(url, { signal } = {}) {
    const response = await fetch(url, {
        signal,
        headers: { Accept: "application/json" }
    });

    // The trap: fetch only rejects on a NETWORK failure. A 404 or a 500 is a
    // successful round trip as far as fetch is concerned, so response.ok has
    // to be checked by hand or the error page gets parsed as data.
    if (!response.ok) {
        throw new HttpError(response.status, response.statusText, url);
    }

    // .json() is itself async, because the body may still be arriving. It
    // rejects if the body is not valid JSON, which is what an HTML error page
    // from a proxy looks like.
    return response.json();
}

// One retry, for network failures only. Retrying a 404 would just fail again;
// retrying a dropped connection often works.
async function getJSONWithRetry(url, options = {}, attempts = 2) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await getJSON(url, options);
        } catch (error) {
            const isLast = attempt === attempts;
            const worthRetrying = error.name === "TypeError";   // network-level
            if (isLast || !worthRetrying) throw error;
            console.log(`Retrying after ${error.name}, attempt ${attempt + 1}`);
            await wait(300 * attempt);
        }
    }
}

// A timeout, so a request that never answers does not leave the UI loading for
// ever. AbortSignal.any combines it with the manual cancel signal where the
// browser supports it.
function requestSignal(userController, ms = 8000) {
    const timeout = AbortSignal.timeout(ms);
    return typeof AbortSignal.any === "function"
        ? AbortSignal.any([userController.signal, timeout])
        : userController.signal;
}


/* ---------------------------------------------------------------
   4. Rendering the four states
   --------------------------------------------------------------- */

function renderSkeletons(count = 6) {
    const list = document.createElement("ul");
    list.className = "result-grid";
    // aria-hidden, because a screen reader should hear the status message
    // rather than a list of empty placeholder boxes.
    list.setAttribute("aria-hidden", "true");

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
        fragment.append(skeletonTemplate.content.cloneNode(true));
    }
    list.append(fragment);
    results.replaceChildren(list);
}

function renderError(error) {
    const box = document.createElement("div");
    box.className = "error-box";

    const title = document.createElement("p");
    title.className = "error-box__title";

    const body = document.createElement("p");
    body.className = "text-sm";

    // A different message per failure type. "Something went wrong" tells the
    // user nothing about whether to retry, fix their connection, or give up.
    if (error.name === "HttpError" && error.status === 404) {
        title.textContent = "Not found (404)";
        body.textContent = "The address exists but there is nothing at it.";
    } else if (error.name === "HttpError") {
        title.textContent = `Request failed (${error.status})`;
        body.textContent = "The server answered, but not with data.";
    } else if (error.name === "TimeoutError") {
        title.textContent = "Timed out";
        body.textContent = "The request took longer than 8 seconds.";
    } else if (error.name === "AbortError") {
        title.textContent = "Cancelled";
        body.textContent = "A newer request replaced this one.";
    } else if (error.name === "TypeError") {
        title.textContent = "Could not reach the server";
        body.textContent = "Check the connection, then try again.";
    } else if (error.name === "SyntaxError") {
        title.textContent = "Unreadable response";
        body.textContent = "The server replied with something that is not JSON.";
    } else {
        title.textContent = "Unexpected error";
        body.textContent = `${error.name}: ${error.message}`;
    }

    const retry = document.createElement("button");
    retry.className = "button button--small";
    retry.type = "button";
    retry.textContent = "Try again";
    retry.addEventListener("click", () => loadUsers());

    box.append(title, body, retry);
    results.replaceChildren(box);
}

function renderEmpty(message) {
    const box = document.createElement("p");
    box.className = "empty-state";
    box.textContent = message;
    results.replaceChildren(box);
}

function buildCard(user) {
    const card = cardTemplate.content.cloneNode(true);

    card.querySelector(".result-card__name").textContent = user.name;
    card.querySelector('[data-field="email"]').textContent = user.email;
    card.querySelector('[data-field="company"]').textContent = user.company?.name ?? "No company";
    card.querySelector('[data-field="city"]').textContent = user.address?.city ?? "Unknown city";

    const button = card.querySelector('[data-action="detail"]');
    button.dataset.id = String(user.id);
    button.setAttribute("aria-label", `View posts by ${user.name}`);

    return card;
}

function renderUsers(users) {
    if (users.length === 0) {
        renderEmpty("Nobody matches that filter.");
        return;
    }

    const list = document.createElement("ul");
    list.className = "result-grid";

    const fragment = document.createDocumentFragment();
    for (const user of users) {
        fragment.append(buildCard(user));
    }
    list.append(fragment);
    results.replaceChildren(list);
}

function setStatus(text, isError = false) {
    statusLine.textContent = text;
    statusLine.classList.toggle("status--error", isError);
}

function render() {
    if (state.phase === "loading") {
        renderSkeletons();
        setStatus("Loading the directory...");
        return;
    }

    if (state.phase === "error") {
        setStatus("The request failed.", true);
        return;
    }

    const term = state.search.trim().toLowerCase();
    const visible = state.users.filter((user) =>
        term === "" ||
        user.name.toLowerCase().includes(term) ||
        (user.company?.name ?? "").toLowerCase().includes(term)
    );

    renderUsers(visible);
    setStatus(`${visible.length} of ${state.users.length} people`);
}


/* ---------------------------------------------------------------
   5. Loading the list
   --------------------------------------------------------------- */

async function loadUsers(url = `${API}/users`) {
    // Cancel whatever was still in flight. Without this, a slow first response
    // can arrive after a fast second one and overwrite the newer results.
    controller?.abort();
    controller = new AbortController();
    const signal = requestSignal(controller);

    state.phase = "loading";
    render();

    try {
        const users = await getJSONWithRetry(url, { signal });

        state.users = Array.isArray(users) ? users : [];
        state.phase = state.users.length === 0 ? "empty" : "success";

        if (state.phase === "empty") {
            renderEmpty("The API returned an empty list.");
            setStatus("0 people");
            return;
        }

        render();
    } catch (error) {
        // A cancelled request is not a failure worth showing - the newer
        // request is already on screen.
        if (error.name === "AbortError") {
            console.log("Request aborted, newer one in progress");
            return;
        }
        console.log("Request failed:", error.name, error.message);
        state.phase = "error";
        setStatus("The request failed.", true);
        renderError(error);
    }
}


/* ---------------------------------------------------------------
   6. Loading the detail - two requests in parallel
   --------------------------------------------------------------- */

async function loadDetail(userId, name) {
    detail.replaceChildren();
    const loading = document.createElement("p");
    loading.className = "status";
    loading.textContent = `Loading posts and to-dos for ${name}...`;
    detail.append(loading);

    // Independent requests, so they start together. Sequential awaits here
    // would take twice as long for no reason.
    const [posts, todos] = await Promise.allSettled([
        getJSON(`${API}/posts?userId=${userId}`),
        getJSON(`${API}/todos?userId=${userId}`)
    ]);

    const heading = document.createElement("h3");
    heading.textContent = name;

    const summary = document.createElement("p");
    summary.className = "text-sm text-muted";

    // allSettled rather than all, so one failing request still leaves the
    // other half of the panel useful.
    const postCount = posts.status === "fulfilled" ? posts.value.length : null;
    const openTodos = todos.status === "fulfilled"
        ? todos.value.filter((todo) => !todo.completed).length
        : null;

    summary.textContent = [
        postCount === null ? "posts unavailable" : `${postCount} posts`,
        openTodos === null ? "to-dos unavailable" : `${openTodos} open to-dos`
    ].join(" | ");

    const list = document.createElement("ul");
    list.className = "detail-list";

    if (posts.status === "fulfilled") {
        for (const post of posts.value.slice(0, 5)) {
            const item = document.createElement("li");

            const title = document.createElement("p");
            title.className = "detail-list__title";
            title.textContent = post.title;

            const body = document.createElement("p");
            body.className = "text-sm text-muted";
            body.textContent = post.body;

            item.append(title, body);
            list.append(item);
        }
    } else {
        const item = document.createElement("li");
        item.textContent = `Posts could not be loaded: ${posts.reason.message}`;
        list.append(item);
    }

    detail.replaceChildren(heading, summary, list);
}


/* ---------------------------------------------------------------
   7. Events
   --------------------------------------------------------------- */

const debounce = (fn, delay) => {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
};

searchInput.addEventListener("input", debounce((event) => {
    state.search = event.target.value;
    // Filtering happens locally - the whole list is already here, so there is
    // no reason to ask the server again on every keystroke.
    if (state.phase === "success") render();
}, 200));

reloadButton.addEventListener("click", () => loadUsers());

// The three failure buttons. A path that is never exercised is a path that
// does not work.
document.getElementById("force-404")
    .addEventListener("click", () => loadUsers(`${API}/users/does-not-exist/nope`));

document.getElementById("force-network")
    .addEventListener("click", () => loadUsers("https://this-host-does-not-exist.invalid/users"));

document.getElementById("force-empty")
    .addEventListener("click", () => loadUsers(`${API}/users?id=99999`));

// Delegated, because the cards are rebuilt on every render.
results.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="detail"]');
    if (!button) return;

    const card = button.closest(".result-card");
    loadDetail(Number(button.dataset.id), card.querySelector(".result-card__name").textContent);
});


/* ---------------------------------------------------------------
   8. Start
   --------------------------------------------------------------- */

loadUsers();

// An unhandled rejection is the async version of an uncaught error, and it is
// easy to miss because nothing stops. Logging it makes a forgotten catch
// visible instead of silent.
window.addEventListener("unhandledrejection", (event) => {
    console.log("Unhandled rejection:", event.reason?.message ?? event.reason);
});

console.log("=== End of Day 18 setup ===");
