# 💻 QUERY agent - Expert Programming Chatbot with Adaptive Learning Memory

An expert programming companion powered by the **Gemini AI Engine (`gemini-3.5-flash`)** with quick coding actions, localized session persistence, secure **Google OAuth 2.0 authentication**, and a dynamic **Adaptive Learning Engine** that can be injected with custom developer guidelines.

---

## 🚀 Key Features

* **Intelligent Conversation Core**: Highly refined multi-turn conversation support utilizing the official modern `@google/genai` SDK on standard `gemini-3.5-flash` for high-efficiency, accurate answers.
* **Dynamic Memory Interceptor**: Catches failed, unhandled, or out-of-scope developer queries automatically and logs them in real-time.
* **Adaptive Pattern Suggestion**: Analyzes intercepted queries and drafts custom-tailored educational code playground boxes using Gemini to answer developer questions.
* **Systemic Prompt Injection**: Injects approved learned patterns directly back into the chatbot's system instruction context at runtime, adapting the model's vocabulary without fine-tuning.
* **Secure Google OAuth 2.0**: State-of-the-art authentication flow which validates users and stores session tokens in robust, secure, and HTTP-only cookies (`SameSite=None; Secure`).
* **Visual Polish**: Fluid UI built with **React**, **Vite**, **Tailwind CSS**, and **Motion** for highly responsive, lag-free structural transitions.

---

## 🛠️ Architecture & Tech Stack

The application is built as a cohesive full-stack web app:

```
┌────────────────────────────────────────────────────────┐
│                        FRONTEND                        │
│             React / Vite / Tailwind / Motion           │
└───────────────────────────┬────────────────────────────┘
                            │ (JSON REST APIs)
                            ▼
┌────────────────────────────────────────────────────────┐
│                        BACKEND                         │
│                    Express.js / Node                   │
└────┬──────────────────────────────────────────────┬────┘
     │                                              │
     ▼                                              ▼
┌────────────────────────┐                    ┌──────────┐
│       AI ENGINE        │                    │ STORAGE  │
│   Gemini 3.5 Flash     │                    │ JSON files│
│  (@google/genai SDK)   │                    │  (/data) │
└────────────────────────┘                    └──────────┘
```

* **Frontend**: Single Page Application (SPA) powered by **React** with **Vite** as the build pipeline. Styled with utility classes from **Tailwind CSS** and animated using **Motion**.
* **Backend**: **Express.js API server** running on Node.js. It acts as a secure reverse proxy for Gemini requests to prevent Client-Side API key leaks.
* **Storage**: A lightweight, resilient, and cloud-container-friendly local JSON database under `/data` managing query logs (`failed_queries.json`) and learned custom patterns (`learned_patterns.json`).

---

## 🔑 Environment Configuration

Create a `.env` file in the root directory and specify the following configurations:

```env
# Server Runtime
NODE_ENV=development

# Application Public Host URL (Used to compute OAuth redirects)
# e.g., http://localhost:3000
APP_URL=http://localhost:3000

# Google Gemini API Key
GEMINI_API_KEY=your_gemini_api_key_here

# Google OAuth Client Credentials
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
```

---

## 📦 Getting Started

### 1. Install Dependencies
Restore the backend and frontend package registers:
```bash
npm install
```

### 2. Start Local Development Environment
Launches the full-stack server using `tsx` on port `3000` with hot-reloading for server code:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your web browser.

### 3. Build for Production
Compiles the React frontend files and bundles the Express backend server into a single, high-performance CommonJS file (`dist/server.cjs`) using `esbuild`:
```bash
npm run build
```

### 4. Run Production Build
Boots up the production-ready optimized build:
```bash
npm run start
```

---

## 🔍 Troubleshooting & Adaptive Learning FAQ

### Why does the bot sometimes fail to give answers on my local terminal/code editor?

If your local instance fails to respond to new queries or does not trigger custom memory answers, check the following checklist:

1. **Missing or Expired Gemini API Key**:
   * Inspect your terminal's server console logs. If `GEMINI_API_KEY` is empty, incorrect, or expired, requests to `/api/chat` will fail. Ensure your `.env` contains the correct `GEMINI_API_KEY`.
2. **Missing `.env` load declaration**:
   * The backend server must load environmental variables. Verify `server.ts` imports environment files right away with `import "dotenv/config";` at the very first file line.
3. **Out-Of-Scope Query Catching**:
   * The chatbot carries structured safety guidelines. If a user asks a query outside programming (e.g. unrelated topics), the AI response gets flagged as an **unresolved fallback message**. 
   * These queries are logged locally under `data/failed_queries.json`. You can manage and teach the bot these answers on the companion dashboard. Once approved, the pattern will be injected into downstream chat systems.
4. **Google OAuth Redirect Mismatch**:
   * Ensure that `APP_URL` in `.env` matches the port your server binds to (default is `http://localhost:3000`). If they disagree, the server's generated Google callback URLs will lead to token rejection errors.
