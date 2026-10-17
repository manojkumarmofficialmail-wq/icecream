# KALIX Ice Cream — production site

Static, dependency-free build of the "Landing page — desktop" design.
No framework, no build step: HTML + CSS + vanilla JS (~20 KB uncompressed).

```
site/
├── index.html          Landing page (semantic HTML, SEO/OG meta, JSON-LD)
├── 404.html            Not-found page
├── css/styles.css      All styles; design tokens as CSS custom properties
├── js/main.js          Cart, filters, cone builder, store finder, forms
├── assets/img/         Optimised WebP images (descriptive names)
├── favicon.svg, site.webmanifest, robots.txt, sitemap.xml
└── _headers, netlify.toml, vercel.json   Hosting config (security + caching)
```

## Run locally

```bash
cd site
python -m http.server 8080      # or: npx serve .
# open http://localhost:8080
```

## Before launch — checklist

1. **Domain** — replace every `https://kalix.example` (index.html meta tags,
   JSON-LD, robots.txt, sitemap.xml) with your real domain.
2. **Newsletter** — set `CONFIG.newsletterEndpoint` in `js/main.js`. It receives
   `POST {"email": "..."}` as JSON and should return 2xx. Works with any
   form backend (Mailchimp/Buttondown proxy, Formspree, a serverless function).
3. **Orders (Cash on Delivery only)** — checkout collects name, mobile, address,
   pincode (Bengaluru `560xxx` only, see `serviceablePincodePrefix`) and a delivery
   slot. **You must set at least one of these in `js/main.js` or orders never reach you:**
   - `CONFIG.orderEndpoint` — receives the order as `POST` JSON
     (`{id, items, subtotal, delivery, total, payment:"COD", slot, notes, customer}`).
     Works with Formspree, a Google Apps Script web app (→ Google Sheet), or your own API.
     Add its origin to `connect-src` in `_headers`.
   - `CONFIG.whatsappNumber` — e.g. `'919876543210'`. The confirmation screen shows a
     "Confirm on WhatsApp" button that sends the full order to that number.
   Delivery is free from ₹999, otherwise `CONFIG.deliveryFee` (₹49).
   Always re-check prices on your side before dispatching.
4. **CSP** — if you add an external API, add its origin to `connect-src` in
   `_headers`. If you edit the one inline `<script>` in `<head>`, regenerate
   its hash:
   `printf "%s" "<script body>" | openssl dgst -sha256 -binary | openssl base64`
5. **Social links / emails** — update the footer `href`s.
6. **OG image** — optionally add a 1200×630 JPG and point `og:image` at it.

## Deploy

- **Netlify / Cloudflare Pages**: publish directory `site`. `_headers` is applied automatically.
- **Vercel**: set root directory to `site`; `vercel.json` handles headers.
- **Any static host / S3 + CDN**: upload the folder; set long cache on `/assets/*`.

## What's included

- Faithful to the design's colours, type, spacing and 1100px / 760px breakpoints
- Sticky header with active-section highlighting; accessible mobile menu
- Persistent cart (localStorage, synced across tabs) with a focus-trapped drawer,
  quantity controls, free-delivery progress bar
- Flavor filters, 3-scoop cone builder, store search with live map pins
- Keyboard support (Esc closes menu/drawer), skip link, ARIA live regions,
  `prefers-reduced-motion` respected, works without JS for all content
- Lazy-loaded images with intrinsic sizes (no layout shift), hero preloaded

## Motion (`css/motion.css` + the motion sections of `js/main.js`)

- Hero carousel (4 slides: Ube Cloud, Mango Chili Pop, Build a cone, Party packs):
  autoplay every 6.5 s with filling progress bars, background colour morph,
  headline lines rise out of a mask, image tilts out / scales in then floats.
  Pauses on hover, focus, when off-screen or the tab is hidden; pause/play button,
  prev/next, arrow keys and touch swipe. No autoplay under reduced motion.
- Scroll progress bar; header hides on scroll down, returns on scroll up
- Staggered scroll reveals, image zoom/wipe reveals, parallax on hero/cone/story
- Infinite flavour ticker (pauses on hover)
- Cards: 3D tilt + light that follows the pointer; filter re-entry animation
- Fly-to-cart arc + badge bump; cone-builder pops; map pins drop in, active pin ripples
- All of it is off under `prefers-reduced-motion`; content never depends on JS to be visible
