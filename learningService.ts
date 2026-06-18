import fs from "fs/promises";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";

export interface LearnedPattern {
  pattern: string;
  title: string;
  track: string;
  level: string;
  responseMarkdown: string;
}

export interface FailedQueryLog {
  id: string;
  query: string;
  response: string;
  category: "out_of_scope" | "api_error" | "user_flagged";
  timestamp: string;
  status: "pending" | "resolved" | "ignored";
  suggestion?: LearnedPattern;
}

const DATA_DIR = path.join(process.cwd(), "data");
const FAILED_QUERIES_FILE = path.join(DATA_DIR, "failed_queries.json");
const LEARNED_PATTERNS_FILE = path.join(DATA_DIR, "learned_patterns.json");

// Helper to ensure database files exist
async function ensureFiles() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (e) {}

  try {
    await fs.access(FAILED_QUERIES_FILE);
  } catch (e) {
    await fs.writeFile(FAILED_QUERIES_FILE, JSON.stringify([], null, 2), "utf8");
  }

  try {
    await fs.access(LEARNED_PATTERNS_FILE);
  } catch (e) {
    await fs.writeFile(LEARNED_PATTERNS_FILE, JSON.stringify([], null, 2), "utf8");
  }
}

// Get all logs and pattern definitions
export async function getLearningData() {
  await ensureFiles();
  const [logsRaw, patternsRaw] = await Promise.all([
    fs.readFile(FAILED_QUERIES_FILE, "utf8"),
    fs.readFile(LEARNED_PATTERNS_FILE, "utf8"),
  ]);

  return {
    logs: JSON.parse(logsRaw) as FailedQueryLog[],
    patterns: JSON.parse(patternsRaw) as LearnedPattern[],
  };
}

// Log a failed or intercepted query
export async function logFailedQuery(
  query: string,
  response: string,
  category: "out_of_scope" | "api_error" | "user_flagged"
): Promise<FailedQueryLog | null> {
  if (!query || !query.trim()) return null;
  await ensureFiles();

  const { logs } = await getLearningData();

  // Avoid logging exact duplicates in quick succession (e.g. within same minute)
  const isDuplicate = logs.some(
    (l) => l.query.toLowerCase().trim() === query.toLowerCase().trim() && l.status === "pending"
  );
  if (isDuplicate) return null;

  const newLog: FailedQueryLog = {
    id: "log_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
    query: query.trim(),
    response: response || "No response received",
    category,
    timestamp: new Date().toISOString(),
    status: "pending",
  };

  logs.unshift(newLog);
  await fs.writeFile(FAILED_QUERIES_FILE, JSON.stringify(logs, null, 2), "utf8");
  return newLog;
}

// Generate dynamic educational suggestion from a failed query log using Gemini
export async function generateLearningSuggestion(
  logId: string,
  apiKey: string
): Promise<LearnedPattern | null> {
  await ensureFiles();
  const { logs } = await getLearningData();
  const logIndex = logs.findIndex((l) => l.id === logId);

  if (logIndex === -1) {
    throw new Error("Logged query not found");
  }

  const log = logs[logIndex];

  const ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  const prompt = `
    Analyze this failed, out-of-scope, or unanswered query from a developer:
    Query: "${log.query}"
    Previous System Response: "${log.response}"

    As our AI Expert, generate a highly informative, production-ready educational response to help the developer.
    Your response must contain a clear title, specify which language/track it is for, design level, conceptual explanation, and complete working syntax in a code sandbox.
    Fulfill this request by returning valid JSON conforming strictly to the requested schema.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
    config: {
      temperature: 0.3,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          pattern: {
            type: Type.STRING,
            description: "Standard clean query words/trigger (e.g., 'python basics', 'c loops') to match",
          },
          title: {
            type: Type.STRING,
            description: "Short topic title (e.g. 'Python Loops and Iteration', 'C System-Level Loops')",
          },
          track: {
            type: Type.STRING,
            description: "Programming language or track (e.g., 'Python', 'Java', 'C', 'General')",
          },
          level: {
            type: Type.STRING,
            description: "Complexity tier (e.g., 'Basic', 'System-Level', 'Intermediate')",
          },
          responseMarkdown: {
            type: Type.STRING,
            description:
              "The full markdown-formatted response. Use specific visual styling, start with emojis (e.g. 🐍, 🚀, 💻), include sections (📘 Conceptual Breakdown, 💻 Applied Code Sandbox), and wrap code blocks in standard markdown code tags.",
          },
        },
        required: ["pattern", "title", "track", "level", "responseMarkdown"],
      },
    },
  });

  if (!response.text) {
    throw new Error("Failed to generate response from Gemini");
  }

  const suggestion = JSON.parse(response.text.trim()) as LearnedPattern;

  // Cache suggestion inside logs list to view/approve later
  logs[logIndex].suggestion = suggestion;
  await fs.writeFile(FAILED_QUERIES_FILE, JSON.stringify(logs, null, 2), "utf8");

  return suggestion;
}

// Approve suggestion and save it as a learned pattern
export async function approveLearningPattern(logId: string, customPattern?: LearnedPattern) {
  await ensureFiles();
  const { logs, patterns } = await getLearningData();
  const logIndex = logs.findIndex((l) => l.id === logId);

  if (logIndex === -1) {
    throw new Error("Logged query not found");
  }

  const log = logs[logIndex];
  const patternToSave = customPattern || log.suggestion;

  if (!patternToSave) {
    throw new Error("No suggestion available to learn from. Please generate a suggestion first.");
  }

  // Add search pattern
  const existsIndex = patterns.findIndex(
    (p) => p.pattern.toLowerCase().trim() === patternToSave.pattern.toLowerCase().trim()
  );
  if (existsIndex !== -1) {
    patterns[existsIndex] = patternToSave;
  } else {
    patterns.unshift(patternToSave);
  }

  // Update status in log
  logs[logIndex].status = "resolved";
  logs[logIndex].suggestion = patternToSave;

  await Promise.all([
    fs.writeFile(FAILED_QUERIES_FILE, JSON.stringify(logs, null, 2), "utf8"),
    fs.writeFile(LEARNED_PATTERNS_FILE, JSON.stringify(patterns, null, 2), "utf8"),
  ]);

  return patternToSave;
}

// Ignore a logged query
export async function ignoreFailedQuery(logId: string) {
  await ensureFiles();
  const { logs } = await getLearningData();
  const logIndex = logs.findIndex((l) => l.id === logId);

  if (logIndex === -1) {
    throw new Error("Logged query not found");
  }

  logs[logIndex].status = "ignored";
  await fs.writeFile(FAILED_QUERIES_FILE, JSON.stringify(logs, null, 2), "utf8");
}

// Get rich dynamic prompt containing learned memory patterns
export async function getLearnedPatternsInstructionSegment(): Promise<string> {
  try {
    const { patterns } = await getLearningData();
    if (patterns.length === 0) return "";

    let segment = `\n\n=== DYNAMIC ADAPTIVE LEARNING MEMORY ===\n`;
    segment += `You have learned new custom programming patterns from user requests. If the user asks about any of these patterns/topics (both matching keywords or semantic equivalents), you MUST reply by outputting the exact predefined 'responseMarkdown' content. DO NOT generate alternative content or trigger the fallback warning for these topics:\n`;

    patterns.forEach((p) => {
      segment += `- Pattern/Topic Match: "${p.pattern}" (Title: "${p.title}", Track: "${p.track}", Level: "${p.level}")\n`;
      segment += `  Reply EXACTLY with this content:\n${p.responseMarkdown}\n\n`;
    });

    segment += `=========================================\n`;
    return segment;
  } catch (e) {
    return "";
  }
}
