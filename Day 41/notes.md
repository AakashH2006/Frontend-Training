# Day 41 - Angular CLI and project setup

## Topics Covered

- `ng new`, and what the CLI actually generates in Angular 22
- `bootstrapApplication` against `bootstrapModule`
- What `app.config.ts` is, and what the NgModule it replaced did
- A `@Component` decorator: selector, imports, templateUrl, styleUrl
- Why the template is a separate file, and what it can see
- `strict` not being on by default, and turning it on
- `strictTemplates`, and what it catches
- Scoped component styles
- `ng generate`, and what I changed about its output
- First look at `signal()`, `@if` and `@for`

## Practical Work

The reading list again, in Angular. A root component, one generated component,
and three books from a constant.

```text
angular.json              the build, serve and test targets
tsconfig.json             solution-style, with `strict` added
tsconfig.app.json         the app
tsconfig.spec.json        the specs
src/index.html            <base href> and <app-root>
src/main.ts               bootstrapApplication
src/styles.css            the global stylesheet - Day 10's tokens, third framework
src/app/app.config.ts     the providers
src/app/app.ts + .html    the root component
src/app/book-card.ts + .html + .css   generated with `ng generate`
src/app/domain.ts         the model
```

```bash
npm install
npm start          # ng serve
npm run build      # ng build
npm run typecheck  # tsc -b --force
```

## The Setup Is The Day

```bash
npx @angular/cli@22 new reading-list --style=css --routing=false
```

That produces 20 files, and reading each one was the point. Three things
surprised me.

### bootstrapApplication, not a module

```ts
// Angular 22
bootstrapApplication(App, appConfig);

// what every tutorial older than ~2023 starts with
platformBrowserDynamic().bootstrapModule(AppModule);
```

The old form needed an `NgModule` whose entire job was to list what the app
used — `declarations`, `imports`, `providers`, `bootstrap`. **This project has
no NgModule at all**, and standalone components are why: a component declares
its own `imports`, so there is nothing left for a module to declare on its
behalf.

What is left is `app.config.ts`, and it is small:

```ts
export const appConfig: ApplicationConfig = {
    providers: [provideBrowserGlobalErrorListeners()]
};
```

One provider, and it is a thing I wrote by hand on Day 18 —
`window.addEventListener("unhandledrejection", ...)`, for the same reason: a
rejected promise with no catch is the async version of an uncaught error,
except nothing stops and nothing looks broken.

### A component is a class plus a decorator

```ts
@Component({
    selector: 'app-root',
    imports: [BookCard],
    templateUrl: './app.html',
    styleUrl: './app.css'
})
export class App {
    protected readonly title = 'Reading List';
}
```

In React a component **is** a function that returns markup. Here the class
holds the data and the behaviour and the decorator points at a template
compiled separately. Three consequences I had to get used to:

- the template is a separate file, so no JSX and no `return`
- the template can only see what is **on the class**
- `imports` is per component — `BookCard` is listed because `app.html`
  contains `<app-book-card>`

That last one is better than React's equivalent. Forgetting the import is a
compile error naming the unknown element; forgetting to import a component in
React gives a lowercase-tag silent failure, which is the Day 26 trap.

### protected, for the template

```ts
protected readonly title = 'Reading List';
protected readonly books = signal<readonly Book[]>(SEED_BOOKS);
```

The template is compiled as part of the class, so it can read `protected`
members. That is a visibility level React has no equivalent of — a React
component's state is a local variable, visible to nothing else by
construction.

The CLI generates `protected readonly` on everything it scaffolds, and after a
day the reasoning is clear: a field that exists only for the template should
say so.

The exception is an input, which has to be settable from outside:

```ts
readonly book = input.required<Book>();
```

`strictInputAccessModifiers` makes a private input an error, which is the
compiler explaining the rule rather than me having to remember it.

## strict Is Not On By Default

The thing I did not expect. `ng new` in Angular 22 turns on
`noImplicitOverride`, `noPropertyAccessFromIndexSignature`,
`noImplicitReturns` and `noFallthroughCasesInSwitch` — **but not `strict`**.

So `strictNullChecks` and `noImplicitAny` are off in a fresh Angular project.
After Weeks 5 to 8 that is not something I am willing to work without, so it is
on, along with the four extras this repo has used since Day 21.

It cost me one fix immediately. The CLI generates:

```ts
bootstrapApplication(App, appConfig).catch((err) => console.error(err));
```

`err` is an implicit `any`, which under `strict` is an error. Changed to
`(error: unknown)` — Week 5's lesson arriving on day one of Angular.

### strictTemplates

The Angular-specific one, and the reason the templates below are safe:

```html
{{ book().title }}
```

Without `strictTemplates`, a typo in an HTML file is a runtime `undefined` that
renders as nothing. With it, the template is type-checked against the class,
including through component inputs. `{{ book().titl }}` does not compile.

This is the feature that makes a separate template file acceptable to me. A
template that is not type-checked is a large blind spot in exchange for not
having JSX.

## The Template Language

An HTML file, so `class` rather than `className`, a real `for` on a label, and
nothing that is not valid HTML.

```html
<h1>{{ title }}</h1>
<li><app-book-card [book]="book" /></li>
```

`{{ }}` evaluates against the class and escapes the result — the same safety as
JSX's braces by a different route.

`[book]="book"` binds the *expression*; without the brackets it would pass the
literal string `"book"`. That is precisely JSX's `books="BOOKS"` mistake from
Day 26, and `strictTemplates` catches it here.

### The built-in control flow

```html
@if (books().length === 0) {
    <p class="empty-state">Nothing on the list yet.</p>
} @else {
    @for (book of books(); track book.id) { ... }
}
```

`@if` and `@for` are Angular 17+ and are part of the template *language*. The
old forms were attribute directives — `*ngIf`, `*ngFor` — which needed
`CommonModule` in `imports` and read, to me, much worse: `*ngIf` with an
`; else templateRef` was the thing I found least approachable about Angular
from the outside.

**`track` is not optional.** It is React's `key` with the same job — telling
the framework which item is which across renders — and Angular makes omitting
it a *compile error* rather than a console warning. Given that Week 6 spent
three days on why keys matter, making it impossible to forget is the better
design.

### Signals, barely

```ts
protected readonly books = signal<readonly Book[]>(SEED_BOOKS);
```

`signal()` returns a getter, so the template reads `books()`. That call is what
Angular tracks to know which templates depend on which value. Day 46 is the
real version; today it is here to establish that the parentheses are not
optional.

And not everything is a signal. `statuses` and `statusLabels` are plain fields
because they never change, and making a constant into a signal would be noise.

I also used a getter deliberately:

```ts
protected get total(): number { return this.books().length; }
```

It runs on **every change-detection pass**, which is fine for three books and
is exactly the argument for `computed()` — worth seeing the simpler thing
before the thing that replaces it.

## Scoped Styles, By Default

```css
/* book-card.css */
.book-card__title { margin-bottom: var(--space-1); }
```

Angular adds an attribute to the component's elements and rewrites these
selectors to match it. Verified in the rendered output:

```text
scoped attrs : _ngcontent-ng-c110964967,class
```

So `.book-card__title` in that file cannot affect a `.book-card__title`
anywhere else. That is what I would have reached for CSS Modules to get in the
React weeks, and it is on by default with no configuration.

The trade: a selector in a component's stylesheet cannot reach *into* a child
component either. That is the right default and occasionally inconvenient.

The tokens and shared classes stay in `src/styles.css`, listed in
`angular.json` rather than imported from code — scoping a design token would
defeat it.

## ng generate, and what I changed

```bash
ng generate component book-card
```

Three things about its output:

- **It made a folder** with four files. I flattened it to two: at this size, a
  folder per component is more navigation than information. `--flat` is the
  flag; the CLI's default is right for a large app.
- **No `standalone: true`**, because it is the default in Angular 19+. Every
  tutorial that includes it predates that.
- **It generated a spec** containing `expect(component).toBeTruthy()`. I
  deleted it. Day 37's lesson: a test asserting that a component instance
  exists tests the framework, not my code. Real tests on Day 45.

## What I Learned

Angular 22 has no NgModule. `bootstrapApplication` plus per-component
`imports` replaces it entirely, and most Angular material online still starts
with the module.

A component is a class and a decorator, not a function. The template is
separate and can only see the class — including its `protected` members, which
is a visibility React has no use for.

`strict` is **not** on in a new Angular project. The CLI's generated
`main.ts` does not compile once it is.

`strictTemplates` type-checks the HTML against the class. Without it a separate
template file is a blind spot; with it, it is fine.

`[prop]="x"` binds an expression and `prop="x"` binds a string. Same class of
mistake as JSX, caught by the compiler here.

`track` in `@for` is mandatory. Angular made the thing React warns about into a
compile error.

Component styles are scoped by default, via a generated attribute I could see
in the output.

A getter in a template runs on every change-detection pass, which is the
argument for `computed()`.

## Verification

```text
npm run typecheck   ->  tsc -b --force, 0 errors
npm run build       ->  Application bundle generation complete

main-QHER3CSN.js    | main    | 117.23 kB | 35.65 kB transfer
styles-CRSAMHH4.css | styles  |   7.50 kB |  1.70 kB transfer
                    | total   | 124.74 kB | 37.35 kB transfer
```

Then the built bundle loaded into jsdom:

```text
h1            : Reading List
panels        : Summary | Your list
summary tiles : On the list=3, Unread=1, Reading=1, Finished=1
cards         : 3
   - Things Fall Apart   | Chinua Achebe  | First published 1958     | note: yes | Finished
   - Beloved             | Toni Morrison  | First published 1987     | note: no  | Reading
   - An Undated Anthology| Author unknown | Publication year unknown | note: no  | Unread
scoped attrs  : _ngcontent-ng-c110964967,class
problems      : none
```

The third book is the one with no author and no year, falling back correctly —
the same deliberate hole in the data that Weeks 5 and 6 carried.

### The size comparison

Worth writing down, because I expected the opposite:

```text
Week 8 React app   92 kB gzipped  (83 kB of it React + router)
Day 41 Angular app 37 kB transfer
```

Angular has the reputation for being the heavy one. This is a smaller app than
the Week 8 capstone, so it is not a fair fight — but it is nowhere near the
difference the reputation implies, and the reason is that Angular's compiler
strips what the templates do not use while React ships its runtime whole.

## Day 41 Outcome

A standalone Angular 22 application with no NgModule: `bootstrapApplication`,
an `ApplicationConfig` with one provider, a root component composing a
generated one, scoped component styles, and the Week 2 design tokens as the
global stylesheet.

`strict` turned on over the CLI's default, which immediately broke the
generated `main.ts`, plus `strictTemplates` so the HTML is type-checked against
the class. Type-checks and builds clean, and the rendered output is verified
against jsdom.

Day 42 is components properly: several focused ones, composition through
`<ng-content>`, and where the boundaries go in a framework that makes a
component a class.
