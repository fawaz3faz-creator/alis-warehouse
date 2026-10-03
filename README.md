# Product Media Extractor

This app lets you paste a product link and extract image/video URLs from the page for download.

## Run locally

```bash
node server.js
```

Then open:

```text
http://localhost:3000
```

## Notes

- This is a best-effort extractor for public product pages.
- Some sites block direct scraping from browsers, but the server-side fetch still helps for many pages.
- If a page blocks everything, you can still use the upload feature in the UI.

## API

```text
GET /api/extract?url=https://example.com/product
```

Returns JSON with a `media` array of image/video URLs.
