# Day 48 - Component communication patterns

## Topics Covered

- The four mechanisms, and what each one is actually for
- The question that decides between them
- Prop drilling, written out rather than described
- When a service is the right answer
- The opposite failure: everything coupled to the application
- A service that is not a store
- Why `BookCard` still takes inputs

## Practical Work

Nothing new in the app's behaviour. The work was deciding where each piece of
communication belongs, and building the one case that makes the answer obvious.

```text
src/app/notifications.service.ts   a service with no state worth the name
src/app/notice-bar.ts              the consumer - takes no inputs
src/app/deep-toolbar.ts            the producer - five levels down
src/app/nesting.ts                 three components that exist to be in the way
src/app/app.ts + .html             all four mechanisms, with the reasons
```

## The Four

```text
input()     parent -> child, a value
output()    child -> parent, something happened
model()     both, when the child owns the value
a service   anyone -> anyone, when there is no useful common parent
```

The question that decides it, and it is one question:

> **Do the producer and the consumer have a useful common parent?**
>
> If yes, start with inputs and outputs. If no, it is a service.

Everything below is that applied.

## The Case That Makes It Obvious

```text
App > Panel > SectionA > SectionB > SectionC > DeepToolbar
```

`DeepToolbar` needs the reading list and the notifications. The three sections
in between need neither.

With inputs and outputs, each of those three would carry **two inputs and two
outputs they never read** — twelve declarations to move two values three
levels. I wrote the three components out rather than describing them, because
"three levels of pass-through" is easy to wave away and tedious to actually
look at:

```ts
@Component({
    selector: 'app-section-b',
    imports: [SectionC],
    template: `<div class="nest"><p class="text-sm text-muted">SectionB</p><app-section-c /></div>`
})
export class SectionB {}
```

With injection, `DeepToolbar` takes nothing from its parents at all:

```text
deep toolbar : It can see 7 books and 0 notices.
raised a notice : A notice from five levels down.
marked all      : Marked 3 books finished.
stats now       : On the list=6, Unread=0, Reading=0, Finished=6
```

This is what Week 7 solved with context — and Angular needs no provider
component wrapped round the tree, because a `providedIn: 'root'` service is
already application-wide.

## The Notice Bar Is The Cleaner Half

The notices are a better example than the list, because there is genuinely **no
binding that could work**:

- raised by `DeepToolbar`, five levels down, and by `App`'s own handlers
- shown by `NoticeBar`, in the header

Neither is an ancestor of the other. There is no common parent to lift to
except `App`, and lifting it there means `App` holding state it does not use so
it can pass it down two different branches.

```ts
@Component({ selector: 'app-notice-bar', template: `...` })
export class NoticeBar {
    protected readonly notifications = inject(NotificationsService);
}
```

No inputs. That is the signal.

### A service does not have to be a store

`NotificationsService` has one signal, three methods and no persistence. It is
not a reducer, not a repository and not a "state management solution".

I had assumed a service meant a store, because `ReadingListService` is one. It
does not — it means *something that is not a component*, and the smallest
useful one is three methods.

```text
after status  : "Beloved" is now finished.
after remove  : Removed "Kindred."   (tone: danger)
after dismiss : "Beloved" is now finished.   <- the previous one
```

The dismiss falling back to the previous notice is `latest()` being a computed
over the array rather than a separate "current" signal — Day 20's rule, still
earning its place.

## Why BookCard Still Takes Inputs

The most useful conclusion of the day, and it is a decision *not* to use the
new tool.

`BookCard` could inject `ReadingListService` and call `list.remove(id)` itself.
It would be fewer lines in `app.html`. It would also be worse in four ways:

- the card would only work inside an app that has that service
- it could not be rendered twice against two different lists
- a test would need the whole service to render one card
- **the parent could no longer do anything when a book is removed**

That last one is not hypothetical — it is exactly what `onRemove` does:

```ts
protected onRemove(id: string): void {
    const book = this.list.books().find((entry) => entry.id === id);
    this.list.remove(id);
    this.notifications.show(`Removed "${book?.title ?? id}".`, 'danger');
}
```

Two services coordinated by the component that knows about both. A card that
called `list.remove` directly would silently drop the notice, and the fix would
be to inject the notifications service into the card as well — coupling it to
two application services to render a title and a badge.

> **A presentational component should stay a function of its inputs.** DI is
> the tool that makes that easy to break.

## The Opposite Failure

Prop drilling is the famous problem and it is the one every article is about.
The opposite is easier to cause and harder to see: **a service is so easy to
inject that every component ends up coupled to the application**, and nothing
can be rendered on its own.

The symptom is a component with no inputs that is not a page. The test I
settled on:

> Could this component be rendered twice on one page, against different data?

`BookCard`: yes. `FilterBar`: yes — it takes the three values as inputs.
`NoticeBar` and `DeepToolbar`: no, and they are not meant to be.

## When A Handler Earns Its Place

Day 47 reduced `App` to four one-line forwards and I noted that a one-line
forward is noise. Day 48 kept two of them and they are no longer one-liners:

```html
<button (click)="list.reset()">Reset</button>                  <!-- nothing to coordinate -->
(statusChange)="onStatusChange(book.id, $event)"               <!-- two services -->
```

The rule: **call the service from the template when there is nothing to add;
write a handler when the component is coordinating.**

## model(), and where it went

`model()` is in `FilterBar` and the parent no longer uses the `[(query)]`
sugar, because `list.query` is `asReadonly()` and a readonly signal cannot be
assigned back into.

So the mechanism is still there and the binding is written out. Day 47's trade
showing up as a constraint a day later, which is the useful kind of
consequence.

## What I Learned

One question decides it: do the producer and the consumer have a useful common
parent? Everything else is detail.

Writing three pass-through components out is more convincing than the phrase
"prop drilling". Twelve declarations to move two values three levels.

A service does not have to be a store. One signal and three methods is a
service.

The opposite of prop drilling is everything being coupled to the application,
and it is the easier mistake to make once DI is available.

The test for a presentational component: could it be rendered twice, against
different data?

A component should keep a handler when it is coordinating two things, and call
the service straight from the template when it is not.

A readonly signal from a service cannot be the target of `[(x)]`, so protecting
state costs the two-way sugar.

## Verification

```text
npm run typecheck   ->  tsc -b --force, 0 errors
npm run build       ->  141.44 kB raw, 42.09 kB transfer
```

Driven through jsdom:

```text
notice at start : (none - nothing has happened)
deep toolbar    : It can see 7 books and 0 notices.
nesting depth   : 3 levels of pass-through that pass nothing

after status    : "Beloved" is now finished.
after remove    : Removed "Kindred."  | tone: danger
after dismiss   : "Beloved" is now finished.     <- the previous one

five levels down:
  raised a notice : A notice from five levels down.
  marked all      : Marked 3 books finished.
  stats now       : On the list=6, Unread=0, Reading=0, Finished=6
  deep sees       : It can see 6 books and 3 notices.
  marked again    : Everything was already finished.

persisted       : 6 finished
problems        : none
```

The last two lines of the deep section are the ones worth having: a component
with no inputs changed six books and the header's notice updated, through two
services neither of them passed to the other. And pressing it twice produced
"Everything was already finished", which is the service counting what actually
changed rather than what it was asked to change.

The probe also caught "1 notices" and a claim of four pass-through levels when
there are three. Both fixed.

## Day 48 Outcome

The same app, with every piece of communication deliberately placed: inputs and
outputs for the card and the filter bar, a `model()` in the child whose parent
binding is now written out, and two services for the things with no useful
common parent. A three-component pass-through chain written out to show what
the alternative costs, and a `BookCard` left taking inputs on purpose — with
the four reasons recorded next to it.

Day 49 is reactive forms: a typed `FormGroup`, synchronous validators, error
messages and submit handling.
