import React, { useState, useEffect, useRef } from "react";
import { 
  Plus, Trash2, Edit3, Check, Copy, AlertTriangle, Send, Code, 
  Sparkles, BookOpen, SlidersHorizontal, Layers, Search, 
  MessageSquareCode, ChevronRight, HelpCircle, CornerDownLeft, RefreshCcw, FileCode, CheckCheck,
  Database, ThumbsDown, Menu, X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ChatSession, Message, ActionTemplate } from "../types";
import DataGuide from "./DataGuide";

// Custom code block renderer helper
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className={`text-xs px-2.5 py-1.5 rounded-md flex items-center gap-1.5 font-sans transition-all border ${
        copied 
         ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
         : "bg-slate-800 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
      }`}
      title="Copy to clipboard"
    >
      {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function ProgrammingChatbot() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [inputMessage, setInputMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sysInstruction, setSysInstruction] = useState<string>(
    "You are an expert programming chatbot. You write clean, correct, and well-structured code. Always explain concepts clearly with proper terminology."
  );
  const [activeSection, setActiveSection] = useState<"chat" | "data-guide">("chat");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitleRaw, setEditingTitleRaw] = useState<string>("");
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  interface User {
    email: string;
    name: string;
    picture: string;
  }
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  const checkAuth = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        if (data.loggedIn && data.user) {
          setUser(data.user);
        } else {
          setUser(null);
        }
      }
    } catch (err) {
      console.error("Failed to check auth status:", err);
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith(".run.app") && !origin.includes("localhost")) {
        return;
      }
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        checkAuth();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleGoogleLogin = async () => {
    try {
      const res = await fetch("/api/auth/url");
      if (!res.ok) throw new Error("Failed to load Google Auth URL");
      const { url } = await res.json();
      
      const width = 500;
      const height = 650;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      
      const popup = window.open(
        url,
        "google_login_popup",
        `width=${width},height=${height},left=${left},top=${top}`
      );
      if (!popup) {
        alert("Please enable popups to sign in with Google.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to initiate Google sign-in.");
    }
  };

  const handleGoogleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        setUser(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // List of pre-configured templates
  const ActionTemplates: ActionTemplate[] = [
    {
      id: "explain",
      label: "Explain Code",
      icon: "Code",
      description: "Analyze a snippet line-by-line",
      templateText: "Please analyze the following code, explain its execution step-by-step, outline the time & space complexity, and look for any hidden edge cases:\n\n```python\n# Paste code here\n```"
    },
    {
      id: "debug",
      label: "Debug Buggy Code",
      icon: "AlertTriangle",
      description: "Identify and resolve runtime errors",
      templateText: "This code produces unexpected results or throws an error. Please find the root cause, explain why it fails, and provide a clean, corrected version:\n\n```javascript\n// Paste buggy code here\n```"
    },
    {
      id: "refactor",
      label: "Refactor / Optimize",
      icon: "Sparkles",
      description: "Improve performance and clarity",
      templateText: "Please refactor the following code to improve execution speed/memory usage while preserving its original functionality and code clarity:\n\n```typescript\n// Paste code to optimize here\n```"
    },
    {
      id: "unittests",
      label: "Generate Unit Tests",
      icon: "FileCode",
      description: "Ensure test coverage",
      templateText: "Write complete unit tests covering healthy flows, empty outputs, boundary values, and negative cases for this function:\n\n```python\n# Paste function here\n```"
    }
  ];

  // Load chats from localStorage on mount
  useEffect(() => {
    const cached = localStorage.getItem("devchat_sessions");
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as ChatSession[];
        if (parsed.length > 0) {
          setSessions(parsed);
          setActiveSessionId(parsed[0].id);
        } else {
          createNewSession();
        }
      } catch (err) {
        createNewSession();
      }
    } else {
      createNewSession();
    }
  }, []);

  // Save chats to localStorage dynamically
  const saveSessions = (updated: ChatSession[]) => {
    setSessions(updated);
    localStorage.setItem("devchat_sessions", JSON.stringify(updated));
  };

  // Scroll current chat to bottom on new updates
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessions, activeSessionId, isLoading]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  // Helper to create a new session
  const createNewSession = (title = "New Programming Session", customInstruction?: string) => {
    const newSessionId = "session_" + Date.now();
    const newSession: ChatSession = {
      id: newSessionId,
      title: title,
      messages: [
        {
          id: "welcome_" + Date.now(),
          role: "model",
          text: `👋 Greetings! I am your AI Development Companion.\n\nLet me help you write, debug, and explain code, or design data structures. Click any action block above to get started instantly or use the bottom text bar!`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        }
      ],
      systemInstruction: customInstruction || sysInstruction,
      activeLanguage: "any",
      createdAt: new Date().toLocaleDateString()
    };

    const nextSessions = [newSession, ...sessions];
    saveSessions(nextSessions);
    setActiveSessionId(newSessionId);
    setError(null);
  };

  // Handle renaming sessions
  const startEditingSession = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditingTitleRaw(session.title);
  };

  const saveEditedSessionTitle = (sessionId: string) => {
    if (editingTitleRaw.trim()) {
      const updated = sessions.map((s) => 
        s.id === sessionId ? { ...s, title: editingTitleRaw.trim() } : s
      );
      saveSessions(updated);
    }
    setEditingSessionId(null);
  };

  // Handle deleting a session
  const deleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = sessions.filter((s) => s.id !== sessionId);
    if (filtered.length === 0) {
      // Maintain at least one active chat session
      const newSessionId = "session_" + Date.now();
      const defaultSession: ChatSession = {
        id: newSessionId,
        title: "New Programming Session",
        messages: [
          {
            id: "welcome_" + Date.now(),
            role: "model",
            text: "👋 Welcome back! Let's build and debug some amazing code together.",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          }
        ],
        systemInstruction: sysInstruction,
        activeLanguage: "any",
        createdAt: new Date().toLocaleDateString()
      };
      saveSessions([defaultSession]);
      setActiveSessionId(newSessionId);
    } else {
      saveSessions(filtered);
      if (activeSessionId === sessionId) {
        setActiveSessionId(filtered[0].id);
      }
    }
  };

  // Handle sending user input
  const handleSendMessage = async (customPrompt?: string) => {
    const textSend = customPrompt || inputMessage;
    if (!textSend.trim() || isLoading || !activeSessionId) return;

    setError(null);
    setIsLoading(true);
    if (!customPrompt) setInputMessage(""); // Clear text bar

    // Construct the user message
    const userMessage: Message = {
      id: "msg_" + Date.now(),
      role: "user",
      text: textSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    // Append to active session and retrieve the session's chat history
    let currentSession = sessions.find((s) => s.id === activeSessionId);
    if (!currentSession) return;

    const nextMessages = [...currentSession.messages, userMessage];
    
    // Update active memory session instantly for UI responsive design
    const sessionUpdates = sessions.map((s) => 
      s.id === activeSessionId ? { ...s, messages: nextMessages } : s
    );
    // If the session title was default, auto-generate a summary title later or use first 30 chars
    if (currentSession.title === "New Programming Session") {
      const charLimit = 30;
      const snippet = textSend.length > charLimit ? textSend.substring(0, charLimit) + "..." : textSend;
      const index = sessionUpdates.findIndex(s => s.id === activeSessionId);
      if (index !== -1) {
        sessionUpdates[index].title = snippet;
      }
    }
    setSessions(sessionUpdates);

    try {
      // Map message history to Gemini SDK specifications: role user/model, parts list
      // Note: mapping standard strings safely
      const apiContents = nextMessages.map((msg) => ({
        role: msg.role,
        parts: [{ text: msg.text }]
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: apiContents,
          systemInstruction: currentSession.systemInstruction
        })
      });

      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        throw new Error(errPayload.error || `HTTP error ${res.status}`);
      }

      const data = await res.json();
      const aiResponseText = data.text || "No response received from the assistant.";

      // Construct AI message
      const aiMessage: Message = {
        id: "msg_ai_" + Date.now(),
        role: "model",
        text: aiResponseText,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      };

      // Add AI reply to storage
      const finalSessions = sessionUpdates.map((s) => 
        s.id === activeSessionId ? { ...s, messages: [...s.messages, aiMessage] } : s
      );
      saveSessions(finalSessions);

    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Could not complete request. Ensure your Gemini API Key is configured in Settings.");
      
      // Keep UI clean, but don't drop user message if call failed
    } finally {
      setIsLoading(false);
    }
  };

  // Quick Action template trigger
  const applyTemplate = (template: ActionTemplate) => {
    setActiveSection("chat");
    setInputMessage(template.templateText);
  };

  // Parsing helper to isolate text descriptions from blocks of code
  const renderMessageContent = (text: string) => {
    const sections = text.split("```");
    return sections.map((section, idx) => {
      // Odd indices are the raw content inside code tags
      if (idx % 2 === 1) {
        const lines = section.split("\n");
        let language = "code";
        let codeBody = section;

        // Try to identify the code language flag (e.g. javascript, python, sql)
        if (lines.length > 0) {
          const firstLineTrimmed = lines[0].trim();
          if (
            firstLineTrimmed !== "" && 
            firstLineTrimmed.length < 15 && 
            !firstLineTrimmed.includes(" ") &&
            !firstLineTrimmed.includes("=") &&
            !firstLineTrimmed.includes(":") &&
            !firstLineTrimmed.includes("{") &&
            !firstLineTrimmed.includes("(")
          ) {
            language = firstLineTrimmed;
            codeBody = lines.slice(1).join("\n");
          }
        }

        // Clean trailing newlines
        codeBody = codeBody.trim();

        return (
          <div key={idx} className="my-4 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden font-mono text-sm max-w-full">
            <div className="flex items-center justify-between px-4 py-2 bg-slate-950 text-slate-400 border-b border-slate-800 text-xs">
              <span className="font-semibold uppercase tracking-wider text-blue-400">{language}</span>
              <CopyButton text={codeBody} />
            </div>
            <pre className="p-4 overflow-x-auto text-slate-100 whitespace-pre scrollbar-thin scrollbar-thumb-slate-800 leading-relaxed font-mono">
              <code>{codeBody}</code>
            </pre>
          </div>
        );
      } else {
        // Plain text content
        return (
          <p key={idx} className="whitespace-pre-wrap leading-relaxed text-slate-800 text-[14px]">
            {section}
          </p>
        );
      }
    });
  };

  // Simple search filter
  const filteredSessions = sessions.filter((s) => 
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden text-slate-800 font-sans relative">
      
      {/* Backdrop overlay for mobile sidebar */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-30 md:hidden transition-opacity duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      
      {/* LEFT SIDEBAR: Session Control and Navigation */}
      <aside className={`fixed md:static inset-y-0 left-0 z-40 w-80 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 flex-shrink-0 transform ${
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      } md:translate-x-0 transition-transform duration-300 ease-in-out`}>
        
        {/* Workspace Brand Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-lg">
              <MessageSquareCode className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-slate-100 text-[15px] tracking-tight block">Query & Programming Agent</span>
              <span className="text-[10px] text-slate-400 leading-none">Programming Helper</span>
            </div>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg md:hidden transition-colors"
            title="Close Sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Button: Create New Chat */}
        <div className="p-4">
          <button
            onClick={() => {
              createNewSession();
              setActiveSection("chat");
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded-xl transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Programming Chat
          </button>
        </div>

        {/* Search filter panel */}
        <div className="px-4 py-2 mt-2">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              placeholder="Search chat history..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-800/60 hover:bg-slate-800 focus:bg-slate-800 border border-slate-700/50 focus:border-slate-600 rounded-lg text-xs placeholder-slate-500 text-slate-200 focus:outline-none transition-all"
            />
          </div>
        </div>

        {/* Chat history list */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1 scrollbar-thin scrollbar-thumb-slate-800">
          <span className="text-[10px] font-semibold text-slate-500 tracking-wider uppercase px-3 block mb-1">
            Recent Conversations
          </span>
          <AnimatePresence initial={false}>
            {filteredSessions.map((session) => {
              const isActive = session.id === activeSessionId;
              const isEditing = editingSessionId === session.id;

              return (
                <div
                  key={session.id}
                  onClick={() => {
                    setActiveSessionId(session.id);
                    setActiveSection("chat");
                  }}
                  className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                    isActive 
                      ? "bg-slate-800 text-slate-100" 
                      : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
                  }`}
                >
                  <Code className={`w-4 h-4 shrink-0 ${isActive ? "text-blue-400" : "text-slate-500"}`} />
                  
                  {isEditing ? (
                    <input
                      type="text"
                      value={editingTitleRaw}
                      onChange={(e) => setEditingTitleRaw(e.target.value)}
                      onBlur={() => saveEditedSessionTitle(session.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEditedSessionTitle(session.id);
                      }}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 bg-slate-700 text-white text-xs px-1 py-0.5 rounded focus:outline-none"
                    />
                  ) : (
                    <span className="flex-1 text-xs font-medium truncate pr-8 leading-normal">
                      {session.title}
                    </span>
                  )}

                  {/* Quick Inline Actions */}
                  <div className="absolute right-2 opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                    {!isEditing && (
                      <button
                        onClick={(e) => startEditingSession(session, e)}
                        className="p-1 hover:text-blue-400 text-slate-500 transition-colors"
                        title="Rename Session"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      onClick={(e) => deleteSession(session.id, e)}
                      className="p-1 hover:text-red-400 text-slate-500 transition-colors"
                      title="Delete Session"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </AnimatePresence>

          {filteredSessions.length === 0 && (
            <div className="text-center py-8 text-xs text-slate-600">
              No sessions found
            </div>
          )}
        </div>

        {/* Footer Area: Info and status */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 text-slate-500 text-[11px] space-y-1.5 flex-shrink-0">
          <div className="flex items-center justify-between text-slate-400">
            <span>Powered by:</span>
            <span className="bg-slate-800 px-1.5 py-0.5 rounded text-[10px] text-blue-400 font-mono">Gemini 3.5</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 block"></span>
            <span className="text-slate-400">API connection active</span>
          </div>
          {user && (
            <div className="text-slate-500 text-left truncate pt-1 border-t border-slate-800/50 mt-1">
              User: <span className="text-slate-300 font-semibold">{user.email}</span>
            </div>
          )}
        </div>
      </aside>

      {/* MAIN CONTENT STAGE */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50">
        
        {/* Main Header */}
        <header className="bg-white border-b border-slate-200 h-16 px-4 sm:px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 -ml-1 text-slate-600 hover:text-slate-800 focus:outline-none md:hidden rounded-lg hover:bg-slate-100 transition-colors shrink-0"
              title="Toggle Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-bold text-slate-800 text-[15px] sm:text-[16px] tracking-tight truncate">
              {activeSession ? activeSession.title : "Workspace"}
            </h1>
            {activeSession && (
              <span className="hidden sm:inline-block text-[11px] bg-slate-100 text-slate-500 px-2.5 py-0.5 rounded-full font-medium shrink-0 font-sans">
                Created: {activeSession.createdAt}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {user ? (
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 pl-2.5 pr-3.5 py-1 rounded-xl">
                <img
                  src={user.picture}
                  alt={user.name}
                  referrerPolicy="no-referrer"
                  className="w-7 h-7 rounded-full border border-slate-300"
                />
                <div className="flex flex-col text-left">
                  <span className="text-[11px] font-bold text-slate-800 leading-tight">{user.name}</span>
                  <button
                    onClick={handleGoogleLogout}
                    className="text-[10px] text-red-500 hover:text-red-650 font-medium text-left leading-none hover:underline cursor-pointer"
                  >
                    Logout
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleGoogleLogin}
                className="flex items-center gap-2 px-3.5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl font-bold text-xs text-slate-700 shadow-sm transition-all cursor-pointer"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Sign in with Google</span>
              </button>
            )}
          </div>
        </header>

        {/* MAIN WORKSPACE REGION */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Regular chat workspace */}
          <div className="flex-1 flex flex-col justify-between overflow-hidden">
              
              {/* Messages viewport */}
              <div className="flex-grow overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 scrollbar-thin scrollbar-thumb-slate-300">
                
                {/* Onboarding welcome tiles if there are standard template requirements */}
                {activeSession && activeSession.messages.length <= 1 && (
                  <div className="max-w-3xl mx-auto space-y-5 sm:space-y-6 py-3 sm:py-6">
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-5 sm:p-6 text-slate-700">
                      <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-1.5">
                        <Sparkles className="w-5 h-5 text-blue-600 shrink-0" />
                        AI Programming Helper Loaded
                      </h2>
                      <p className="text-xs text-slate-600 leading-relaxed mb-4 font-sans">
                        Query & Programming Agent runs securely on your Node.js backend to make requests directly to Gemini 3.5. Select an action template to get started instantly, or learn more about data storage under the Architecture Guide.
                      </p>
                      
                      {/* Interactive Onboarding Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div className="bg-white/80 border border-slate-200/60 p-4 rounded-xl space-y-1.5">
                          <span className="text-xs font-bold text-slate-800 block">🗄️ Storing Chat Data</span>
                          <span className="text-[11px] text-slate-500 leading-relaxed block">
                            This chatbot contains and persists history files on the client using <code>localStorage</code>. For live hosting, save chats in PostgreSQL or Firestore.
                          </span>
                        </div>
                        <div className="bg-white/80 border border-slate-200/60 p-4 rounded-xl space-y-1.5">
                          <span className="text-xs font-bold text-slate-800 block">🔌 Free AI API Calls</span>
                          <span className="text-[11px] text-slate-500 leading-relaxed block">
                            Leverage free API structures on the system via <b>Google AI Studio</b>. This makes building sandboxed prototypes completely free of cost!
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Pre-made Template Tiles */}
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                        Quick-Action Snippet Templates
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        {ActionTemplates.map((tpl) => (
                          <div 
                            key={tpl.id}
                            onClick={() => applyTemplate(tpl)}
                            className="bg-white border border-slate-200 p-4 rounded-2xl cursor-pointer hover:border-blue-400 hover:shadow-xs transition-all group flex flex-col justify-between h-28"
                          >
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-semibold text-xs text-slate-800 group-hover:text-blue-600 transition-colors">
                                  {tpl.label}
                                </span>
                                <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 transition-all" />
                              </div>
                              <p className="text-[11px] text-slate-500 leading-relaxed">
                                {tpl.description}
                              </p>
                            </div>
                            <span className="text-[10px] text-blue-500 bg-blue-50 font-medium self-start px-2 py-0.5 rounded-full">
                              Use Template
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Main Dialog Threads */}
                {activeSession && (
                  <div className="max-w-4xl mx-auto space-y-6">
                    {activeSession.messages.map((msg) => {
                      const isUser = msg.role === "user";
                      return (
                        <div
                          key={msg.id}
                          className={`flex gap-4 ${isUser ? "justify-end" : "justify-start"}`}
                        >
                          {/* AI Avatar */}
                          {!isUser && (
                            <div className="w-8 h-8 rounded-lg bg-blue-600 flex-shrink-0 flex items-center justify-center text-white font-mono text-sm shadow-sm select-none">
                              AI
                            </div>
                          )}

                          {/* Message bubble */}
                          <div className={`max-w-[88%] sm:max-w-[85%] rounded-2xl px-4 sm:px-5 py-2.5 sm:py-3.5 shadow-xs border relative group/bubble ${
                            isUser
                              ? "bg-slate-800 border-slate-700 text-slate-100 rounded-tr-xs"
                              : "bg-white border-slate-200 text-slate-800 rounded-tl-xs"
                          }`}
                        >
                            <div className="space-y-2">
                              {renderMessageContent(msg.text)}
                            </div>
                            
                            <div className="flex items-center justify-between gap-1.5 mt-2.5 text-[10px] text-slate-400 border-t border-slate-100/10 pt-1.5">
                              <span>{msg.timestamp}</span>
                            </div>
                          </div>

                          {/* User Avatar */}
                          {isUser && (
                            <div className="w-8 h-8 rounded-lg bg-slate-700 flex-shrink-0 flex items-center justify-center text-white font-bold text-xs shadow-sm select-none uppercase">
                              U
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Pending Response Indicator */}
                    {isLoading && (
                      <div className="flex gap-4 justify-start">
                        <div className="w-8 h-8 rounded-lg bg-blue-600 flex-shrink-0 flex items-center justify-center text-white font-mono text-sm animate-pulse">
                          AI
                        </div>
                        <div className="max-w-[85%] rounded-2xl px-5 py-4 bg-white border border-slate-200 shadow-xs rounded-tl-xs space-y-2">
                          <div className="flex items-center gap-2 text-slate-400 text-xs">
                            <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce"></span>
                            <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                            <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                            <span className="ml-1 text-[11px] text-slate-500 font-medium">Programming model is reviewing request...</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Error Alerts */}
                    {error && (
                      <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 flex gap-3 max-w-3xl mx-auto">
                        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-xs font-bold block">Execution Alert</span>
                          <span className="text-[11px] leading-relaxed text-red-700">{error}</span>
                          <div className="mt-2.5">
                            <button
                              onClick={() => handleSendMessage()}
                              className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-900 border border-red-300 rounded-lg text-[10px] font-bold transition-all"
                            >
                              Retry Request
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div ref={chatEndRef} />
                  </div>
                )}

              </div>

              {/* Chat Input Console Form */}
              <div className="bg-white border-t border-slate-200 p-3 sm:p-4 md:p-5 shrink-0">
                <div className="max-w-4xl mx-auto space-y-2 sm:space-y-3">
                  
                  {/* Prompt Box */}
                  <div className="flex items-end gap-2.5 sm:gap-3 bg-slate-50 border border-slate-300 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 rounded-2xl p-2 transition-all">
                    <textarea
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      placeholder="Ask programming questions, request refactoring, explain algorithms..."
                      rows={Math.min(6, inputMessage.split("\n").length || 1)}
                      onKeyDown={(e) => {
                        // Support Ctrl+Enter for sending
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      className="flex-1 bg-transparent border-0 px-3 py-2 text-sm focus:outline-none placeholder-slate-400 text-slate-800 resize-none min-h-[36px]"
                    />
                    
                    <button
                      onClick={() => handleSendMessage()}
                      disabled={!inputMessage.trim() || isLoading}
                      className={`p-3 rounded-xl transition-all ${
                        inputMessage.trim() && !isLoading
                          ? "bg-blue-600 hover:bg-blue-500 text-white shadow-sm"
                          : "bg-slate-200 text-slate-400 cursor-not-allowed"
                      }`}
                      title="Send prompt to AI"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Context controls/hints */}
                  <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] uppercase bg-slate-100 border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded">
                        Shift + Enter
                      </span>
                      <span>for new line</span>
                    </div>

                    <button 
                      onClick={() => {
                        if (activeSession) {
                          const reset = [{
                            id: "welcome_" + Date.now(),
                            role: "model",
                            text: "Context cleared. How can I help you write code now?",
                            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          }];
                          const updated = sessions.map(s => s.id === activeSessionId ? { ...s, messages: reset } : s);
                          saveSessions(updated);
                        }
                      }}
                      className="flex items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors bg-transparent border-0"
                    >
                      <RefreshCcw className="w-3 h-3" />
                      Clear active context
                    </button>
                  </div>

                </div>
              </div>

            </div>
        </div>

      </main>
    </div>
  );
}
