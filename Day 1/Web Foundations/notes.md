# Day 1 - Web Foundations Notes

## Chrome DevTools

### Elements

The Elements panel displayed the HTML structure of my webpage.

I edited the `<h1>` element directly in DevTools and the main title on the webpage changed immediately.

The change was temporary and was not saved to my original `index.html` file.

### Network

I opened the Network panel and refreshed the webpage.

I observed a request for:

`index.html`

The request had:

- Request Method: `GET`
- Status Code: `200 OK`

This showed me that the browser successfully requested the HTML document and received a successful response.

### Basic Request/Response Flow

Browser (client)
→ GET request for `index.html`
→ Server
→ 200 OK response
→ Browser renders the webpage

## What I Learned

- DevTools can be used to inspect the HTML/DOM of a webpage.
- Elements can be temporarily modified through DevTools.
- The Network panel shows requests made by the browser.
- `GET` is the request method I observed when loading my HTML document.
- `200 OK` indicates that the request was successful.