# KALIX Ice Cream

Production website for KALIX small-batch ice cream, Bengaluru.
Static and dependency-free: HTML + CSS + vanilla JS, no build step.
Orders are **Cash on Delivery only** and arrive on WhatsApp (+91 97447 58625).

```
.
├── index.html            Landing page (SEO/OG meta, JSON-LD)
├── 404.html              Not-found page
├── css/styles.css        Layout + components (design tokens as CSS variables)
├── css/motion.css        Animations: hero carousel, reveals, parallax, micro-interactions
├── js/main.js            Cart, COD checkout, carousel, filters, cone builder, store finder
├── assets/img/           WebP images
├── favicon.svg, site.webmanifest, robots.txt, sitemap.xml
├── vercel.json           Vercel: security headers (CSP, HSTS…) + caching
├── .vercelignore         Keeps design-reference/ out of the deployment
└── design-reference/     Original design-tool export (not deployed)
```

## Run locally

```bash
npx serve .
# open the URL it prints
```

## Deploy (Vercel)

The site lives at the repository root, so Vercel needs no settings:
Framework preset **Other**, Root directory **./**, no build command, no output directory.
Every push to `main` deploys to production once the repo is connected in Vercel.

## Configuration (`js/main.js` → `CONFIG`)

| Key | Default | What it does |
| --- | --- | --- |
| `whatsappNumber` | `919744758625` | Orders open WhatsApp to this number with the full order pre-filled |
| `orderEndpoint` | `''` | Optional: also POST every order as JSON (Formspree, Google Apps Script, your API). Add its origin to `connect-src` in `vercel.json` |
| `freeDeliveryThreshold` | `999` | Free delivery from this subtotal (₹) |
| `deliveryFee` | `49` | Delivery charge below the threshold (₹) |
| `serviceablePincodePrefix` | `560` | Only Bengaluru pincodes accepted; `''` accepts any |
| `newsletterEndpoint` | `''` | Optional newsletter sign-up endpoint |

Always re-check prices on WhatsApp before dispatching: the cart runs in the browser.

### Content Security Policy
If you edit the one inline `<script>` in `<head>` of `index.html`, regenerate its hash in `vercel.json`:
`printf "%s" "<script body>" | openssl dgst -sha256 -binary | openssl base64`

## Features

- Animated hero carousel (4 slides), autoplay with progress bars, pause/prev/next, swipe, arrow keys
- Shop with flavor filters, 3-scoop cone builder, store finder with map pins
- Persistent cart with a 3-step drawer: Cart → Delivery details → Done
- Cash on Delivery checkout with validation (Indian mobile, Bengaluru pincode), delivery slots
- Floating WhatsApp chat button; scroll reveals, parallax, fly-to-cart animation
- Accessible: keyboard support, focus trap, ARIA live regions, `prefers-reduced-motion` respected
