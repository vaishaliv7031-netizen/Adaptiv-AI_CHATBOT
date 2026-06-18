import React, { useState } from "react";
import { 
  Database, Server, Key, Eye, HelpCircle, HardDrive, Info, 
  Share2, Layers, Terminal, Check, Copy, Code, Sparkles, FileText
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function DataGuide() {
  const [activeTab, setActiveTab] = useState<"architecture" | "openai-compat" | "official-sdk" | "env-setup">("architecture");
  const [copiedTextId, setCopiedTextId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTextId(id);
    setTimeout(() => setCopiedTextId(null), 2000);
  };

  const codeOpenAICompat = `import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

# ✅ Connect to Gemini using the standard OpenAI SDK client!
# This requires ZERO changes to your existing client.chat.completions.create() structure.
client = OpenAI(
    api_key=os.getenv("GEMINI_API_KEY"),
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
)

#-------Ai Api callback
def get_ai_response(prompt):
    try:
        print("🔥 AI API CALLED with:", prompt)

        # Simply replace standard models with one of these free-tier models:
        # - "gemini-2.5-flash"
        # - "gemini-1.5-flash"
        response = client.chat.completions.create(
            model="gemini-2.5-flash",
            messages=[{"role": "user", "content": prompt}]
        )

        return response.choices[0].message.content

    except Exception as e:
        print("❌ AI ERROR:", e)
        return None`;

  const codeOfficialSDK = `import os
from google import genai
from dotenv import load_dotenv

load_dotenv()

# ✅ Initialize the official modern Google GenAI Client
# Handles connection to free-tier models natively!
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

#-------Ai Api callback (Official SDK replacement)
def get_ai_response(prompt):
    try:
        print("🔥 GEMINI API CALLED with:", prompt)

        # Uses the super-fast free-tier, perfect for coding and debugging!
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt
        )

        return response.text

    except Exception as e:
        print("❌ GEMINI ERROR:", e)
        return None`;

  const codeEnvSetup = `# ------ requirements.txt additions ------
# If using Option A (OpenAI Compatibility), append:
openai>=1.50.0

# If using Option B (Official Google SDK), append:
google-genai>=1.2.0
python-dotenv>=1.0.0

# ------ .env configuration ------
# Get your FREE API key instantly from Google AI Studio (no credit card)
GEMINI_API_KEY="AIzaSyYourFreeKeyHere"`;

  return (
    <div id="data-guide-container" className="bg-slate-50 rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
      
      {/* Brand Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/60 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Programming Chatbot Hub & Integration</h2>
            <p className="text-xs text-slate-500 font-medium">Map data storage answers & inject the free Gemini AI API into Python/Flask</p>
          </div>
        </div>
        
        {/* Dynamic Nav Tabs */}
        <div className="flex flex-wrap p-1 bg-slate-200/70 rounded-xl text-xs gap-1">
          <button
            onClick={() => setActiveTab("architecture")}
            className={`px-3 py-1.5 rounded-lg transition-all font-medium ${
              activeTab === "architecture" ? "bg-white text-slate-800 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            1. Where is Data Contained?
          </button>
          <button
            onClick={() => setActiveTab("openai-compat")}
            className={`px-3 py-1.5 rounded-lg transition-all font-medium ${
              activeTab === "openai-compat" ? "bg-white text-slate-800 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            2. OpenAI Client (Zero-Code-Change)
          </button>
          <button
            onClick={() => setActiveTab("official-sdk")}
            className={`px-3 py-1.5 rounded-lg transition-all font-medium ${
              activeTab === "official-sdk" ? "bg-white text-slate-800 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            3. Google GenAI (Official SDK)
          </button>
          <button
            onClick={() => setActiveTab("env-setup")}
            className={`px-3 py-1.5 rounded-lg transition-all font-medium  ${
              activeTab === "env-setup" ? "bg-white text-slate-800 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            4. ENV Setup
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        
        {/* TAB 1: Architecture Guidelines */}
        {activeTab === "architecture" && (
          <motion.div
            key="architecture-tab"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Topic 1: Where to Contain the Data */}
              <div id="data-containment-card" className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 hover:shadow-sm transition-all">
                <div className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-blue-600" />
                  <h3 className="font-semibold text-sm text-slate-800">Where to Contain Python/Chatbot Data?</h3>
                </div>
                
                <p className="text-xs text-slate-600 leading-relaxed">
                  Depending on your chatbot's scope and scale, you should store data using standard modular layers:
                </p>

                <div className="space-y-3 pt-1">
                  <div className="p-3 bg-slate-50/70 rounded-lg border border-slate-100 flex gap-2.5 items-start">
                    <HardDrive className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-xs font-semibold text-slate-700 block">A. Chat History (Client or SQLite)</span>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Store history on <strong>localStorage</strong> (client-side) or a lightweight, integrated <strong>SQLite</strong> database files. This requires zero setup costs or complex servers.
                      </p>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50/70 rounded-lg border border-slate-100 flex gap-2.5 items-start">
                    <Server className="w-4 h-4 text-violet-600 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-xs font-semibold text-slate-700 block">B. User Auth & Persistent History</span>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Use cloud-backed systems like <strong>Firebase Firestore</strong> or standard relational PostgreSQL databases. This secures logs, allows sync, and supports searching easily.
                      </p>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50/70 rounded-lg border border-slate-100 flex gap-2.5 items-start">
                    <Share2 className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-xs font-semibold text-slate-700 block">C. Custom Dataset Knowledge (RAG)</span>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        To fetch answers from local manuals, PDF guides, or `DATA.json`, read them into memory at runtime (or query a lightweight vectors catalog for large amounts of records).
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Topic 2: Free AI Access */}
              <div id="free-ai-access-card" className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 hover:shadow-sm transition-all">
                <div className="flex items-center gap-2">
                  <Key className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-semibold text-sm text-slate-800">Where to Get Free AI API Access?</h3>
                </div>
                
                <p className="text-xs text-slate-600 leading-relaxed">
                  Getting cost-free developer limits to run your Python chatbot is extremely straightforward today:
                </p>

                <div className="space-y-3 pt-1">
                  <div className="p-3 bg-emerald-50/45 rounded-lg border border-emerald-100/60 flex gap-2.5 items-start">
                    <Info className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-xs font-semibold text-emerald-800 block">Google AI Studio Free Tier</span>
                      <p className="text-[11px] text-emerald-700 leading-relaxed">
                        Google’s <strong>Gemini series</strong> provides generous free-of-charge API access for registered developers. It's built perfectly for fast streaming responses and code writing!
                      </p>
                    </div>
                  </div>

                  <div className="p-3 bg-blue-50/45 rounded-lg border border-blue-100/60 flex gap-2.5 items-start">
                    <Eye className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-xs font-semibold text-blue-800 block">No-Leak Environment Variables</span>
                      <p className="text-[11px] text-blue-600 leading-relaxed">
                        Never hardcode API keys in code repository files. Safe practice mandates utilizing <code>os.getenv("GEMINI_API_KEY")</code> on Python backends loaded from <code>.env</code>.
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="pt-2 flex justify-between items-center text-[10px] text-slate-400">
                  <span className="italic">Supports up to 15 requests per minute completely free</span>
                  <button 
                    onClick={() => setActiveTab("openai-compat")}
                    className="text-xs text-blue-600 font-semibold hover:underline bg-transparent border-0"
                  >
                    View Code Adapters ➔
                  </button>
                </div>
              </div>
            </div>

            {/* Recommended secure data flow architecture */}
            <div className="bg-slate-800 text-slate-200 rounded-xl p-4 space-y-2.5">
              <h4 className="text-xs font-semibold tracking-wide text-slate-400 uppercase flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5" />
                Recommended Secure Software Flow
              </h4>
              
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center py-2 text-xs">
                <div className="bg-slate-700/60 border border-slate-600 rounded-lg p-2.5 w-full sm:w-1/3">
                  <div className="font-semibold text-[11px] text-blue-300">Frontend Chat View</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Captures code prompt, displays assistant state, saves history</div>
                </div>
                
                <div className="text-slate-500 font-bold hidden sm:block">➔</div>
                
                <div className="bg-slate-700/60 border border-slate-600 rounded-lg p-2.5 w-full sm:w-1/3">
                  <div className="font-semibold text-[11px] text-violet-300">Python Backend (Flask)</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Proxies calls to Gemini endpoint using your secret key</div>
                </div>

                <div className="text-slate-500 font-bold hidden sm:block">➔</div>

                <div className="bg-slate-700/60 border border-slate-600 rounded-lg p-2.5 w-full sm:w-1/3">
                  <div className="font-semibold text-[11px] text-green-300">Gemini Cloud Engine</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Processes programmers' inputs using secure models</div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* TAB 2: OpenAI Compatibility API */}
        {activeTab === "openai-compat" && (
          <motion.div
            key="openai-compat-tab"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="space-y-4"
          >
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3 text-slate-700 text-xs">
              <Sparkles className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-blue-900 block">Option A: Zero Code Line Re-writes! (OpenAI SDK Mapping)</span>
                <p className="mt-0.5 leading-relaxed text-blue-800">
                  Google Gemini supports the standard OpenAI Python client library. By simply updating the client constructor to guide calls to Google's compatibility URL, your existing chat, functions, and prompt structures continue working perfectly with free Gemini access!
                </p>
              </div>
            </div>

            <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950 text-slate-400 text-xs border-b border-slate-800">
                <span className="font-mono text-blue-400 flex items-center gap-1.5 font-semibold">
                  <Terminal className="w-3.5 h-3.5" />
                  main.py (OpenAI Wrapper Integration)
                </span>
                <button
                  onClick={() => handleCopy(codeOpenAICompat, "openai-compat-copy")}
                  className={`px-2.5 py-1 rounded flex items-center gap-1.5 font-sans border text-[11px] ${
                    copiedTextId === "openai-compat-copy" 
                    ? "bg-slate-800 border-emerald-500/30 text-emerald-400" 
                    : "bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  {copiedTextId === "openai-compat-copy" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedTextId === "openai-compat-copy" ? "Copied" : "Copy Code"}
                </button>
              </div>
              <pre className="p-4 overflow-x-auto text-slate-100 whitespace-pre scrollbar-thin text-xs leading-relaxed font-mono">
                <code>{codeOpenAICompat}</code>
              </pre>
            </div>
          </motion.div>
        )}

        {/* TAB 3: Official Google GenAI SDK */}
        {activeTab === "official-sdk" && (
          <motion.div
            key="official-sdk-tab"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="space-y-4"
          >
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex gap-3 text-slate-700 text-xs">
              <Code className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-emerald-900 block">Option B: The Official modern `google-genai` Python library</span>
                <p className="mt-0.5 leading-relaxed text-emerald-800">
                  This integrates Google's newly consolidated client SDK. It's clean, modern, and supports both standard text completions, code streaming, image understandings, and structured JSON responses perfectly.
                </p>
              </div>
            </div>

            <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950 text-slate-400 text-xs border-b border-slate-800">
                <span className="font-mono text-emerald-400 flex items-center gap-1.5 font-semibold">
                  <Terminal className="w-3.5 h-3.5" />
                  main.py (Official Client Integration)
                </span>
                <button
                  onClick={() => handleCopy(codeOfficialSDK, "official-sdk-copy")}
                  className={`px-2.5 py-1 rounded flex items-center gap-1.5 font-sans border text-[11px] ${
                    copiedTextId === "official-sdk-copy" 
                    ? "bg-slate-800 border-emerald-500/30 text-emerald-400" 
                    : "bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  {copiedTextId === "official-sdk-copy" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedTextId === "official-sdk-copy" ? "Copied" : "Copy Code"}
                </button>
              </div>
              <pre className="p-4 overflow-x-auto text-slate-100 whitespace-pre scrollbar-thin text-xs leading-relaxed font-mono">
                <code>{codeOfficialSDK}</code>
              </pre>
            </div>
          </motion.div>
        )}

        {/* TAB 4: Environment & Dependencies */}
        {activeTab === "env-setup" && (
          <motion.div
            key="env-setup-tab"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="space-y-4"
          >
            <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 flex gap-3 text-slate-750 text-xs">
              <FileText className="w-5 h-5 text-slate-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-800 block">Configuring `requirements.txt` and `.env`</span>
                <p className="mt-0.5 leading-relaxed text-slate-500">
                  Ensure your host server possesses the specific pip libraries. Place your API key securely into `.env` so that your Flask application can extract it automatically.
                </p>
              </div>
            </div>

            <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950 text-slate-400 text-xs border-b border-slate-800">
                <span className="font-mono text-slate-400 flex items-center gap-1.5 font-semibold">
                  <Terminal className="w-3.5 h-3.5" />
                  Configuration Files
                </span>
                <button
                  onClick={() => handleCopy(codeEnvSetup, "env-setup-copy")}
                  className={`px-2.5 py-1 rounded flex items-center gap-1.5 font-sans border text-[11px] ${
                    copiedTextId === "env-setup-copy" 
                    ? "bg-slate-800 border-emerald-500/30 text-emerald-400" 
                    : "bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  {copiedTextId === "env-setup-copy" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedTextId === "env-setup-copy" ? "Copied" : "Copy Settings"}
                </button>
              </div>
              <pre className="p-4 overflow-x-auto text-slate-100 whitespace-pre scrollbar-thin text-xs leading-relaxed font-mono">
                <code>{codeEnvSetup}</code>
              </pre>
            </div>
          </motion.div>
        )}

      </AnimatePresence>

    </div>
  );
}

