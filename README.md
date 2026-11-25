<div align="center">
  <img src="./public/logo.svg" alt="BrosDev Logo" width="80" height="80" />
  <h1>BrosDev Services</h1>
  <p><strong>Production-grade Form Builder, Resend Email Routing, Campaign Studio & Website Widgets Platform</strong></p>

  <p>
    <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/bulidwithbrosdev/brosdev-service">
      <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare Pages" />
    </a>
  </p>

  <p>
    <img src="https://img.shields.io/badge/React-19-blue?logo=react" alt="React 19" />
    <img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite" alt="Vite" />
    <img src="https://img.shields.io/badge/TailwindCSS-v4-38B2AC?logo=tailwindcss" alt="Tailwind CSS v4" />
    <img src="https://img.shields.io/badge/Cloudflare_Pages-Compatible-F38020?logo=cloudflare" alt="Cloudflare Pages" />
    <img src="https://img.shields.io/badge/Email_Delivery-Resend-000000?logo=resend" alt="Resend" />
    <img src="https://img.shields.io/badge/Database-Firebase_Firestore-FFCA28?logo=firebase" alt="Firebase" />
  </p>
</div>

---

## ⚡ Quick Start & Run Commands

### 1. Run Locally (One Command)
Clone the repository, configure your environment, and launch the dev server:

```bash
# Install dependencies and start server
pnpm install && pnpm run dev
# or with npm:
npm install && npm run dev
```

The application will be live at: **`http://localhost:3000`**

---

## 🚀 One-Click Deploy to Cloudflare Pages

### Option A: Web Button (Fastest)

Click the button below to fork and deploy directly to Cloudflare Pages:

[![Deploy to Cloudflare Pages](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/bulidwithbrosdev/brosdev-service)

---

### Option B: One-Click CLI Deploy

Deploy directly from your terminal using Wrangler:

```bash
# Build and deploy to Cloudflare Pages
pnpm run deploy
# or with npm:
npm run deploy
```

---

### Option C: Manual Cloudflare Pages Dashboard Setup

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/) &rarr; **Workers & Pages** &rarr; **Create application** &rarr; **Pages** &rarr; **Connect to Git**.
2. Select your repository: `bulidwithbrosdev/brosdev-service`.
3. In **Build settings**, configure:
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build` *(or `pnpm run build`)*
   - **Build output directory**: `dist`
   - **Root directory**: `/`
4. Under **Environment variables**, add the required variables (see [Environment Variables](#-environment-variables)).
5. Click **Save and Deploy**. SPA routing is pre-configured via `wrangler.jsonc` (`not_found_handling: single-page-application`).

---

## 🔐 Environment Variables

Create a `.env` file in the root directory (based on `.env.example`):

| Variable | Required | Default / Example | Description |
| :--- | :---: | :--- | :--- |
| `RESEND_API_KEY` | **Yes** | `re_1234567890abcdef` | Platform Resend API key for server-side email dispatch. Can also be set dynamically in Super Admin &rarr; Resend Configuration. |
| `ENCRYPTION_KEY` | **Yes** | `32+ char hex/string` | High-entropy secret for AES-256-GCM form routing tokens and webhook HMAC signatures. |
| `APP_URL` | **Yes** | `https://brosdev-service.pages.dev` | Public URL where the application is hosted (used for short links and email redirects). |
| `ALLOWED_FRONTEND_ORIGINS` | Optional | `http://localhost:3000,https://...` | Comma-separated list of allowed origins for API CORS. |
| `FIREBASE_PROJECT_ID` | Optional | `serious-airlock-smn89` | Google Cloud / Firebase project ID. |
| `FIRESTORE_DATABASE_ID` | Optional | `ai-studio-brosdevforms-...` | Cloud Firestore database ID. |
| `VITE_API_BASE_URL` | Optional | `""` or `https://api.yourdomain.com` | Base URL for API endpoints if running backend on a separate domain from Cloudflare Pages. |
| `UNSUBSCRIBE_SIGNING_SECRET`| Optional | `32+ char string` | HMAC signing key for one-click campaign unsubscribe links. |
| `RAZORPAY_KEY_ID` | Optional | `rzp_live_...` | Razorpay public key for payments & subscriptions. |
| `RAZORPAY_KEY_SECRET` | Optional | `secret_...` | Server-side Razorpay webhook and order signing secret. |

---

## 🛠 Features & Capabilities

- **Form Builder**: Drag-and-drop form creator with 15+ field types, regex validations, honeypot spam protection, and custom styling.
- **Resend Email Routing**:
  - Outbound form notifications delivered via verified Resend infrastructure.
  - Automatic unverified domain fallback (`onboarding@resend.dev`) so emails never drop during DNS setup.
  - Dynamic in-memory key caching and instant test mode.
- **Email Campaigns Studio**: Drag-and-drop newsletter builder, list segmentation, scheduled broadcasts, and real-time open/click delivery logs.
- **Website Components & Widgets**: Embeddable widgets (banners, modals, feedback popups, announcement bars) with analytics tracking.
- **Developer Utilities**: Short URL generator (`/r/:slug`), dynamic QR codes, CSV export, and PDF receipt rendering.
- **Super Admin Operations Panel**: Global platform management, Resend rate limit tracking, 2FA security, role-based access control, and audit logs.

---

## 📂 Project Structure

```text
├── api/                       # Serverless API routes (Resend, Webhooks, Form Submissions)
│   ├── index.js               # API entrypoint router
│   ├── _lib.js                # Core API helpers, crypto & Resend dispatch logic
│   └── _campaigns.js          # Campaign Studio delivery & domain verification
├── public/                    # Static assets (favicons, redirects, logo)
│   ├── _redirects             # Cloudflare Pages SPA rewrite rules
│   └── logo.svg               # Official BrosDev vector mark
├── src/
│   ├── campaigns/             # Email Campaign Studio views & renderer
│   ├── components/            # UI components (Customer & Admin portals)
│   │   ├── admin/             # Super Admin management views (Resend, Billing, Users)
│   │   ├── customer/          # Customer dashboard, forms & settings
│   │   └── shared/            # Reusable UI components & BrosDev logo
│   ├── context/               # AuthContext (Firebase authentication)
│   ├── lib/                   # Firestore API client & plan limit helpers
│   ├── server/                # Express & Vite development server
│   └── widgets/               # Website widgets builder & catalog
├── server.ts                  # Local development & production Node server
├── vite.config.ts             # Vite build configuration
└── package.json               # Scripts & dependencies
```

---

## 📜 Available Scripts

| Command | Action |
| :--- | :--- |
| `npm run dev` | Starts local Express + Vite development server on `http://localhost:3000` |
| `npm run build` | Compiles production bundle with Vite into `dist/` |
| `npm run lint` | Runs TypeScript type checking (`tsc --noEmit`) |
| `npm run preview` | Previews the compiled production build locally |
| `npm run deploy` | Builds the client and deploys to Cloudflare Pages via Wrangler |

---

## 📄 License

Private & Proprietary — Developed for **BrosDev Services**.
