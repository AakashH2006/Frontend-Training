/* Day 46 - the entry point.

   Three lines, and the comparison with React is the point of reading it.

       React:   createRoot(container).render(<App />)
       Angular: bootstrapApplication(App, appConfig)

   React is handed a DOM node. Angular is handed a *component* and goes
   looking for an element matching its selector - which is why index.html has
   <app-root> rather than <div id="root">.

   `bootstrapApplication` is the standalone API. The thing it replaced,
   `platformBrowserDynamic().bootstrapModule(AppModule)`, needed an NgModule
   whose only job was to list what the app used. Every tutorial older than
   about 2023 starts with that module, and none of this project has one. */

import { bootstrapApplication } from '@angular/platform-browser';

import { App } from './app/app';
import { appConfig } from './app/app.config';

bootstrapApplication(App, appConfig).catch((error: unknown) => {
    /* `unknown`, not `any`. The CLI generates `(err)` here, which is an
       implicit any - and under the `strict` I added to tsconfig.json that is
       an error, so this was the first thing I had to change in generated
       code. Week 5's lesson arriving on day one of Angular. */
    console.error(error);
});
