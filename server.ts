import "dotenv/config";
import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";
import { 
  getLearningData, 
  logFailedQuery, 
  generateLearningSuggestion, 
  approveLearningPattern, 
  ignoreFailedQuery 
} from "./learningService";

// Helper to construct a dynamic, enriched instruction for Gemini containing all active learned memory
async function buildAdaptiveInstruction(baseInstruction: string): Promise<string> {
  let instruction = baseInstruction || "You are an expert programming chatbot. You write clean, correct, and well-structured code. Always explain concepts clearly.";
  
  try {
    const { patterns } = await getLearningData();
    if (patterns && patterns.length > 0) {
      instruction += `\n\n=== DYNAMIC ADAPTIVE LEARNING MEMORY ===\n`;
      instruction += `You have learned new custom programming patterns from developer requests. If the user asks about any of these patterns/topics (matching keywords, query words, or semantic equivalents), you MUST reply by outputting the exact predefined 'responseMarkdown' content. DO NOT generate alternative content or trigger any fallback warnings for these topics:\n\n`;
      
      patterns.forEach((p, idx) => {
        instruction += `[Pattern ${idx + 1}]: "${p.pattern}" (Title: "${p.title}", Track: "${p.track}", Level: "${p.level}")\n`;
        instruction += `Response Content to Output:\n${p.responseMarkdown}\n\n`;
      });
      
      instruction += `=========================================\n`;
    }
  } catch (err) {
    console.error("Failed to load learned memory rules:", err);
  }
  
  return instruction;
}

// Helper to perform robust, retryable, and model-fallback content generation to gracefully handle 503 Spike Capacity/High Demand errors
async function generateContentWithFallback(
  ai: GoogleGenAI,
  params: {
    contents: any;
    config?: any;
  }
): Promise<any> {
  const primaryModel = "gemini-3.5-flash";
  const fallbackModel = "gemini-3.1-flash-lite";
  
  let lastError: any = null;

  // Attempt up to 2 times with primary model using exponential backoff
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`[Gemini API] Primary model attempt ${attempt} starting for: ${primaryModel}`);
      const response = await ai.models.generateContent({
        model: primaryModel,
        contents: params.contents,
        config: params.config,
      });
      return response;
    } catch (error: any) {
      lastError = error;
      const isTransient = 
        error?.status === "UNAVAILABLE" || 
        error?.code === 503 || 
        (error?.message && (
          error.message.includes("high demand") || 
          error.message.includes("temporary") || 
          error.message.includes("RESOURCE_EXHAUSTED") ||
          error.message.includes("503") ||
          error.message.includes("UNAVAILABLE")
        ));
      
      if (!isTransient) {
        throw error;
      }

      console.warn(`[Gemini API] Primary model attempt ${attempt} failed with transient demand/congestion error:`, error.message || error);
      if (attempt < 2) {
        const delay = attempt * 1200;
        console.log(`[Gemini API] Waiting ${delay}ms before retrying primary model...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // If primary model options failed, fall back to gemini-3.1-flash-lite
  console.log(`[Gemini API] Primary model attempts exhausted. Falling back to lightweight resilient model: ${fallbackModel}`);
  try {
    const response = await ai.models.generateContent({
      model: fallbackModel,
      contents: params.contents,
      config: params.config,
    });
    return response;
  } catch (fallbackError: any) {
    console.error(`[Gemini API] Fallback model ${fallbackModel} also failed:`, fallbackError.message || fallbackError);
    throw fallbackError || lastError;
  }
}

// In-memory sessions
interface SessionUser {
  email: string;
  name: string;
  picture: string;
}
const sessions = new Map<string, SessionUser>();

function parseCookies(cookieString?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieString) return cookies;
  
  cookieString.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    const name = parts[0]?.trim();
    const val = parts.slice(1).join('=')?.trim();
    if (name) {
      cookies[name] = decodeURIComponent(val || '');
    }
  });
  return cookies;
}

function getCleanGeminiApiKey(): { key: string; error?: string } {
  let activeApiKey = (process.env.GEMINI_API_KEY || "").trim();
  
  if (!activeApiKey) {
    console.error("[Diagnostic] GEMINI_API_KEY is not defined or is empty.");
    return {
      key: "",
      error: "GEMINI_API_KEY is not configured in environment variables. Please check Settings/Secrets."
    };
  }

  // Handle wrapped quotes or double quotes
  if (activeApiKey.startsWith('"') && activeApiKey.endsWith('"')) {
    activeApiKey = activeApiKey.slice(1, -1).trim();
  }
  if (activeApiKey.startsWith("'") && activeApiKey.endsWith("'")) {
    activeApiKey = activeApiKey.slice(1, -1).trim();
  }

  // Securely log basic signature info (not revealing the key!) for developer logs
  console.log(`[Diagnostic] Loaded GEMINI_API_KEY - length: ${activeApiKey.length}, prefix: "${activeApiKey.substring(0, 6)}", suffix: "${activeApiKey.substring(Math.max(0, activeApiKey.length - 4))}"`);

  if (activeApiKey.includes("apps.googleusercontent.com")) {
    return {
      key: "",
      error: "GEMINI_API_KEY is incorrectly configured with a Google OAuth Client ID (ending in .apps.googleusercontent.com) instead of a Gemini API key. Please check your credentials and make sure GEMINI_API_KEY is set to a valid Gemini API Key (usually starting with 'AIzaSy') from Google AI Studio."
    };
  }

  if (activeApiKey.startsWith("ya29.")) {
    return {
      key: "",
      error: "GEMINI_API_KEY is incorrectly configured with a Google OAuth Access Token (starting with 'ya29.') instead of a Gemini API key. Please check your credentials and make sure GEMINI_API_KEY is set to a valid Gemini API Key (usually starting with 'AIzaSy') from Google AI Studio."
    };
  }

  if (activeApiKey.startsWith("GOCSPX-")) {
    return {
      key: "",
      error: "GEMINI_API_KEY is incorrectly configured with a Google OAuth Client Secret (starting with 'GOCSPX-') instead of a Gemini API key. Please configure the Client Secret as GOOGLE_CLIENT_SECRET, and set GEMINI_API_KEY to a valid Gemini API Key (usually starting with 'AIzaSy') from Google AI Studio."
    };
  }

  // Support standard Google AI Studio "AIzaSy" keys, alternative/enterprise headers (like "AQ.Ab8..."), or any valid token format of reasonable length
  if (!activeApiKey.startsWith("AIzaSy") && !activeApiKey.startsWith("AQ.")) {
    if (activeApiKey.length < 15) {
      return {
        key: "",
        error: `GEMINI_API_KEY appears to have an incorrect prefix ("${activeApiKey.substring(0, 6)}...") and is too short to be a valid API Key. A valid Gemini API Key from Google AI Studio usually starts with "AIzaSy" or is a valid service API Key format.`
      };
    } else {
      console.warn(`[Diagnostic] GEMINI_API_KEY prefix "${activeApiKey.substring(0, 6)}..." is non-standard but of correct length (${activeApiKey.length}). Allowing backup bypass.`);
    }
  }

  return { key: activeApiKey };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Trust reverse proxies to resolve protocol and host headers correctly
  app.set("trust proxy", true);

  // Middleware to parse JSON request bodies
  app.use(express.json());

  // OAuth Endpoints
  app.get("/api/auth/url", (req, res) => {
    try {
      const redirectUri = process.env.APP_URL
        ? `${process.env.APP_URL.trim().replace(/\/$/, "")}/auth/callback`
        : `${req.protocol}://${req.get("host")}/auth/callback`;

      const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid email profile",
        access_type: "offline",
        prompt: "consent",
      });

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
      res.json({ url: authUrl });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to generate auth url" });
    }
  });

  app.get(["/auth/callback", "/auth/callback/"], async (req, res) => {
    const { code } = req.query;
    if (!code) {
      return res.status(400).send("Authorization code is required");
    }

    try {
      const redirectUri = process.env.APP_URL
        ? `${process.env.APP_URL.trim().replace(/\/$/, "")}/auth/callback`
        : `${req.protocol}://${req.get("host")}/auth/callback`;

      // Exchange authorization code for token
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code: String(code),
          client_id: process.env.GOOGLE_CLIENT_ID || "",
          client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error("Token exchange failed:", errorText);
        let detailedError = errorText;
        try {
          const parsed = JSON.parse(errorText);
          if (parsed.error_description) {
            detailedError = `${parsed.error} - ${parsed.error_description}`;
          } else if (parsed.error) {
            detailedError = parsed.error;
          }
        } catch (_) {}
        throw new Error(`Token exchange failed (HTTP ${tokenResponse.status}): ${detailedError}. Expected Redirect URI config: ${redirectUri}`);
      }

      const tokenData = (await tokenResponse.json()) as any;
      const accessToken = tokenData.access_token;

      // Get user info from Google
      const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!userInfoResponse.ok) {
        throw new Error(`Failed to fetch userinfo: ${userInfoResponse.statusText}`);
      }

      const userInfo = (await userInfoResponse.json()) as any;

      // Create session
      const sessionId = "session_" + Date.now() + "_" + Math.floor(Math.random() * 1000000);
      sessions.set(sessionId, {
        email: userInfo.email || "",
        name: userInfo.name || "",
        picture: userInfo.picture || "",
      });

      // Set cookie secure sameSite none for iframe compatibility
      res.setHeader(
        "Set-Cookie",
        `session_id=${sessionId}; Path=/; SameSite=None; Secure; HttpOnly; Max-Age=86400`
      );

      // Return popup success HTML
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. You can close this window now.</p>
          </body>
        </html>
      `);
    } catch (err: any) {
      console.error("Authentication callback error:", err);
      res.status(500).send(`Authentication failed: ${err.message || err}`);
    }
  });

  app.get("/api/auth/me", (req, res) => {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const sessionId = cookies["session_id"];
      if (sessionId && sessions.has(sessionId)) {
        res.json({ loggedIn: true, user: sessions.get(sessionId) });
      } else {
        res.json({ loggedIn: false });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to fetch user session" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const sessionId = cookies["session_id"];
      if (sessionId) {
        sessions.delete(sessionId);
      }
      res.setHeader(
        "Set-Cookie",
        `session_id=; Path=/; SameSite=None; Secure; HttpOnly; Max-Age=0`
      );
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to log out" });
    }
  });

  // API endpoint to process chat requests
  app.post("/api/chat", async (req, res) => {
    let lastQueryText = "";
    try {
      const { contents, systemInstruction } = req.body;

      if (!contents || !Array.isArray(contents)) {
        return res.status(400).json({ error: "Invalid requests. 'contents' array is required." });
      }

      // Extract the last user query text for dynamic exception interception logging
      const lastUserMessage = [...contents].reverse().find(msg => msg.role === "user");
      lastQueryText = lastUserMessage?.parts?.[0]?.text || "";

      const { key: activeApiKey, error: keyError } = getCleanGeminiApiKey();
      if (keyError || !activeApiKey) {
        return res.status(keyError && keyError.includes("incorrectly configured") ? 400 : 500).json({ 
          error: keyError || "GEMINI_API_KEY is not configured in environment variables. Please check Settings/Secrets." 
        });
      }

      // Lazy initialization inside route handler
      const ai = new GoogleGenAI({
        apiKey: activeApiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Inject learned patterns dynamically into system instruction
      const enrichedSystemInstruction = await buildAdaptiveInstruction(systemInstruction);

      // Generate content using gemini-3.5-flash with automatic retry and lightweight model fallback mechanisms for 530/503 spikes.
      const response = await generateContentWithFallback(ai, {
        contents: contents,
        config: {
          systemInstruction: enrichedSystemInstruction,
          temperature: 0.7,
        },
      });

      const responseText = response.text || "";

      // Interception engine: Automatically detect fallback/out-of-scope replies (e.g. "related to my knowledge")
      const lowerResponse = responseText.toLowerCase();
      const isFallback = 
        lowerResponse.includes("related to my knowledge") || 
        lowerResponse.includes("happy to give you answers") || 
        lowerResponse.includes("ask something related") ||
        lowerResponse.includes("can you ask something related");

      if (isFallback && lastQueryText) {
        await logFailedQuery(lastQueryText, responseText, "out_of_scope").catch(err => {
          console.error("Logger Interceptor error:", err);
        });
      }

      res.json({ text: responseText, intercepted: isFallback });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      
      // Auto-log the failed query as an API failure to enable retry suggestions
      if (lastQueryText) {
        await logFailedQuery(lastQueryText, error?.message || "Gemini API failure", "api_error").catch(() => {});
      }
      
      res.status(500).json({ error: error?.message || "An unexpected error occurred during generating content." });
    }
  });

  // GET: Fetch logs and current learned patterns
  app.get("/api/learning", async (req, res) => {
    try {
      const data = await getLearningData();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to get learning logs." });
    }
  });

  // POST: Explicitly log a failed query (manual user report / flag)
  app.post("/api/learning/report", async (req, res) => {
    try {
      const { query, response } = req.body;
      if (!query) {
        return res.status(400).json({ error: "Query is required to log feedback." });
      }
      const log = await logFailedQuery(query, response || "", "user_flagged");
      res.json({ success: true, log });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to log query." });
    }
  });

  // POST: Let Gemini analyze and suggest a patterns match configuration
  app.post("/api/learning/suggest", async (req, res) => {
    try {
      const { logId } = req.body;
      if (!logId) {
        return res.status(400).json({ error: "logId is required to generate a suggestion." });
      }

      const { key: activeApiKey, error: keyError } = getCleanGeminiApiKey();
      if (keyError || !activeApiKey) {
        return res.status(keyError && keyError.includes("incorrectly configured") ? 400 : 500).json({ 
          error: keyError || "GEMINI_API_KEY is not configured. Cannot generate suggestion." 
        });
      }

      const suggestion = await generateLearningSuggestion(logId, activeApiKey);
      res.json({ success: true, suggestion });
    } catch (err: any) {
      console.error("AI Pattern Suggestion Error:", err);
      res.status(500).json({ error: err?.message || "Failed to generate AI learning suggestion." });
    }
  });

  // POST: Approve and save a learned pattern definition
  app.post("/api/learning/teach", async (req, res) => {
    try {
      const { logId, customPattern } = req.body;
      if (!logId) {
        return res.status(400).json({ error: "logId is required to register learned pattern." });
      }

      const pattern = await approveLearningPattern(logId, customPattern);
      res.json({ success: true, pattern });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to save dynamic learned pattern." });
    }
  });

  // POST: Mark query as ignored
  app.post("/api/learning/ignore", async (req, res) => {
    try {
      const { logId } = req.body;
      if (!logId) {
        return res.status(400).json({ error: "logId is required." });
      }
      await ignoreFailedQuery(logId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to ignore log item." });
    }
  });

  // Serve static assets or use Vite's development middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Serve client application for all other requests (SPA Routing)
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://0.0.0.0:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
