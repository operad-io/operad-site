# operad.io

The landing page for operad. Plain HTML and CSS, one small script (`board.js`),
no build step, no tracking, no external requests (system fonts only).

## Preview

```sh
bunx serve .
# or
python3 -m http.server 8000
```

Then open the address it prints. `index.html` also opens straight from the file system.

## Files

- `index.html` the page
- `zh/index.html` the Chinese page, served at `/zh/`; it shares `style.css` and `board.js`
- `style.css` tokens and layout; colours are the iPhone app's neutrals with `#5672b3` as the primary
- `board.js` tiles rise in on scroll; the example board opens one row at a time
- `favicon.svg`
