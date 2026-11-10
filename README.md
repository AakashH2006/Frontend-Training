# Front-end training — sixty days

A learning journal, written one day at a time. Twelve weeks from
`<!doctype html>` to a routed Angular application with 355 tests and a
production build, with a folder per day and notes that record what was
measured rather than what was intended.

The repository had no README until Day 60, which is the honest order: I did not
need an index while I was the only person reading it.

## What is in here

Sixty `Day N/` folders. Each one has `notes.md`, and most have a complete,
runnable project beside it. Every fifth day is a weekly build with a
`README.md` covering the five days before it.

```
Day 7/
  Typography, Color and Variables/   a project, runnable on its own
  notes.md                            what I did, what broke, what I measured
Day 10/
  Responsive Design and Weekly Build/
  notes.md
  README.md                           Week 2
```

In the weeks that build one application - 16 to 20, 21 to 25, 26 to 40 and 41
to 60 - each day's project is a **full copy** of the one before it, not a
branch. That is deliberate and it is the reason this repository is large: the
diff between `Day 57/` and `Day 58/` is the actual history of one day's work,
readable without git, and every day's folder still runs on its own. The earlier
days, where the subject changed daily, are separate small projects.

## The twelve weeks

| week | days | README | what it built |
| --- | --- | --- | --- |
| 1 | 1–5 | [Week 1](Day%205/README.md) | HTML, semantics, forms, accessibility |
| 2 | 6–10 | [Week 2](Day%2010/README.md) | CSS: cascade, box model, flexbox, grid, responsive |
| 3 | 11–15 | [Week 3](Day%2015/README.md) | JavaScript: values, control flow, functions, objects |
| 4 | 16–20 | [Week 4](Day%2020/README.md) | the DOM, events, `fetch`, modules, `localStorage`, git |
| 5 | 21–25 | [Week 5](Day%2025/README.md) | TypeScript: types, narrowing, interfaces, generics |
| 6 | 26–30 | [Week 6](Day%2030/README.md) | React: JSX, props, state, forms |
| 7 | 31–35 | [Week 7](Day%2035/README.md) | reducers, context, effects, custom hooks |
| 8 | 36–40 | [Week 8](Day%2040/README.md) | routing, testing, accessibility, a production build and three hosts' deployment config |
| 9 | 41–45 | [Week 9](Day%2045/README.md) | Angular: standalone components, templates, inputs |
| 10 | 46–50 | [Week 10](Day%2050/README.md) | signals, DI, services, reactive forms |
| 11 | 51–55 | [Week 11](Day%2055/README.md) | the router, `HttpClient`, RxJS, `ng test` |
| 12 | 56–60 | [Week 12](Day%2060/README.md) | guards, accessibility, performance, deployment |

## The two applications

The weekly builds are not twelve unrelated exercises. They are two apps, each
rebuilt as the tools changed.

**A reading list**, Days 20 to 40. Vanilla JS and the DOM (Day 20), the same
app in TypeScript (25), in React (30), with reducers and effects (35), and
finally routed, tested and built for production with deployment config for
three hosts (40). It was never actually deployed, which the Week 8 README says
in its own limitations.

**A contact manager**, Days 50 to 60. Angular signals and forms (50), then a
routed application talking to a server (55), and the capstone (60): the URL is
the query, the server answers it, and the client is honest about what it does
not hold.

The finished one is [`Day 60/Final Capstone/`](Day%2060/Final%20Capstone):

```bash
cd "Day 60/Final Capstone"
npm install
npm start             # http://localhost:4200
npm test              # 355 tests, ~7s, no browser
npm run typecheck
npm run build:pages   # with the base href and the SPA fallback
```

There is no backend to start. `src/app/fake-api.ts` is an HTTP interceptor that
answers `/api/*` itself, seeds from `public/api/*.json` and keeps its rows in
`localStorage`. Deployment is written up in
[`DEPLOYING.md`](Day%2060/Final%20Capstone/DEPLOYING.md).

## How the notes work

Three rules, which are the only reason this was worth keeping:

**Nothing is claimed that was not run.** Every number in every `notes.md` is
copied from output. Where something could not be measured, the note says so in
the same breath as the claim — the CI workflow has never run, `npm ci` has
never been run here, the five host rewrite rules in `DEPLOYING.md` come from
documentation rather than from use.

**Wrong predictions stay in.** Day 59 predicted that a root-absolute API path
would produce an empty list with no error; the probe found a visible failure
state instead, and both the prediction and the correction are in the comment
that made the prediction. Day 58 expected `@defer` to shrink the bundle; it
grew it by 10 kB, and that is the headline of the day.

**Tests that assert a limitation get inverted, not deleted.** When Day 58 made
the detail page fetch one record instead of two, the test named *fetches the
record twice* became *fetches the record once*, with the old name in the
comment. Same on Day 60 for the tag suggestions. The file keeps the history.

Each day also has a **probe**: a script that loads the built bundle into jsdom,
drives it and prints measurements. The probes live outside the repository
because they are scratch tooling, but their output is pasted into the notes
verbatim, including the lines that say what a probe could *not* show.

## Stack, by week

| weeks | tools |
| --- | --- |
| 1–2 | HTML, CSS, no build step |
| 3–4 | JavaScript, ES modules, no build step - an `index.html` and a `js/` folder |
| 5 | TypeScript |
| 6–8 | React 19, Vite, Vitest, Testing Library, React Router |
| 9–12 | Angular 22, TypeScript, Vitest + jsdom, zoneless, RxJS |

Dependencies are not committed; each project's `package.json` is. Day 60 also
has a `package-lock.json`, because CI needs one.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs `npm ci`, the
typecheck, the tests and the production build against the latest day's app, and
deploys it to GitHub Pages on `main`.

**It has never run.** It needs a push to GitHub and the repository's Pages
source set to "GitHub Actions". Verified locally: the YAML parses, the paths
exist, and every command in it except `npm ci` succeeds on this machine in that
order. `npm ci` deletes `node_modules` first, which here is a junction to one
shared install that all sixty folders point at.

## Fixtures and privacy

Nothing in this repository talks to anything. Every project is local: fake
backends, static JSON fixtures and `localStorage`. The fixture data is invented
`example.com` and `example.org` addresses attached to the names of historical
scientists — Ada Lovelace, Grace Hopper, Katherine Johnson, Jean Bartik,
Margaret Hamilton.

The sign-in added on Day 56 is a name in `localStorage` with no password and no
server. Its own comments say so. It gates a page, not data.

## Author

Aakash — sixty days, twelve weeks, two applications and one habit worth
keeping: break the line the test covers, watch the test fail, and only then
believe it.
