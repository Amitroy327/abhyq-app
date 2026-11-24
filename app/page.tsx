"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatConversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
};

type MemoryItem = {
  id: number;
  category: string;
  content: string;
  created_at: string;
  updated_at: string;
};

type AttachmentItem = {
  name: string;
  type: "image" | "file";
  content: string;
};

type UserSettings = {
  defaultVoiceLang: "en-IN" | "hi-IN";
  defaultWebSearch: boolean;
  autoSpeakReplies: boolean;
};

const STORAGE_KEY = "abhyq_conversations";
const SETTINGS_KEY = "abhyq_user_settings";
const AI_MODE_KEY = "abhyq_ai_mode";

const DEFAULT_SETTINGS: UserSettings = {
  defaultVoiceLang: "en-IN",
  defaultWebSearch: false,
  autoSpeakReplies: false,
};

function getChatStorageKey(uid: string | null) {
  return uid ? `${STORAGE_KEY}_${uid}` : `${STORAGE_KEY}_guest`;
}

const suggestions = [
  {
    icon: "✦",
    title: "Create something",
    description: "Turn your ideas into reality",
    prompt: "Help me create something amazing.",
  },
  {
    icon: "⌘",
    title: "Write code",
    description: "Build and explore new things",
    prompt: "Write a clean React counter component with TypeScript.",
  },
  {
    icon: "◈",
    title: "Learn something",
    description: "Understand anything easily",
    prompt: "Teach me something interesting today.",
  },
  {
    icon: "↗",
    title: "Explore ideas",
    description: "Discover new possibilities",
    prompt: "Give me some innovative business ideas.",
  },
];

// RENDER FORMATTED TEXT & CODE BLOCKS WITH ONE-CLICK COPY
function FormattedMessage({ content }: { content: string }) {
  const [copiedBlock, setCopiedBlock] = useState<number | null>(null);

  const parts = content.split(/(```[\s\S]*?```)/g);

  async function handleCopyCode(code: string, idx: number) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedBlock(idx);
      setTimeout(() => setCopiedBlock(null), 1500);
    } catch {
      // ignore clipboard error
    }
  }

  return (
    <div className="formatted-message">
      {parts.map((part, index) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const inner = part.slice(3, -3);
          const firstNewLine = inner.indexOf("\n");
          const lang =
            firstNewLine !== -1
              ? inner.slice(0, firstNewLine).trim() || "code"
              : "code";
          const code =
            firstNewLine !== -1
              ? inner.slice(firstNewLine + 1).replace(/\n$/, "")
              : inner;

          return (
            <div className="code-box" key={index}>
              <div className="code-box-header">
                <span className="code-lang">{lang}</span>
                <button
                  type="button"
                  className="code-copy-btn"
                  onClick={() => handleCopyCode(code, index)}
                >
                  {copiedBlock === index ? "✓ Copied!" : "▢ Copy code"}
                </button>
              </div>
              <pre className="code-box-pre">
                <code>{code}</code>
              </pre>
            </div>
          );
        }

        if (!part) return null;

        const inlineParts = part.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
        return (
          <span key={index} className="text-segment">
            {inlineParts.map((seg, segIdx) => {
              if (seg.startsWith("**") && seg.endsWith("**")) {
                return <strong key={segIdx}>{seg.slice(2, -2)}</strong>;
              }
              if (seg.startsWith("`") && seg.endsWith("`")) {
                return (
                  <code className="inline-code" key={segIdx}>
                    {seg.slice(1, -1)}
                  </code>
                );
              }
              return <span key={segIdx}>{seg}</span>;
            })}
          </span>
        );
      })}
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [settingsSavedToast, setSettingsSavedToast] = useState(false);
  const [aiMode, setAiMode] = useState<"cloud" | "local">("cloud");

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [savedChats, setSavedChats] = useState<ChatConversation[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [parsingFile, setParsingFile] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [error, setError] = useState("");

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState<"chat" | "memory" | "settings">(
    "chat"
  );

  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryError, setMemoryError] = useState("");

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceLang, setVoiceLang] = useState<"en-IN" | "hi-IN">("en-IN");
  const [webSearch, setWebSearch] = useState(false);
  const [attachment, setAttachment] = useState<AttachmentItem | null>(null);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // LOAD SAVED SETTINGS & AI MODE
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<UserSettings>;
        const merged: UserSettings = {
          defaultVoiceLang:
            parsed.defaultVoiceLang === "hi-IN" ? "hi-IN" : "en-IN",
          defaultWebSearch: Boolean(parsed.defaultWebSearch),
          autoSpeakReplies: Boolean(parsed.autoSpeakReplies),
        };
        setSettings(merged);
        setVoiceLang(merged.defaultVoiceLang);
        setWebSearch(merged.defaultWebSearch);
      }

      const savedMode = localStorage.getItem(AI_MODE_KEY);
      if (savedMode === "local" || savedMode === "cloud") {
        setAiMode(savedMode);
      }
    } catch {
      // ignore invalid settings JSON
    }
  }, []);

  function toggleAiMode() {
    setAiMode((prev) => {
      const next = prev === "cloud" ? "local" : "cloud";
      localStorage.setItem(AI_MODE_KEY, next);
      return next;
    });
  }

  function updateSettings(patch: Partial<UserSettings>) {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      if (patch.defaultVoiceLang) setVoiceLang(patch.defaultVoiceLang);
      if (typeof patch.defaultWebSearch === "boolean") {
        setWebSearch(patch.defaultWebSearch);
      }
      return next;
    });
    setSettingsSavedToast(true);
    setTimeout(() => setSettingsSavedToast(false), 1800);
  }

  // LOGIN GUARD + LOAD LOGGED-IN USER FROM SUPABASE
  useEffect(() => {
    let active = true;
    const supabase = getSupabaseBrowserClient();

    const fallbackTimer = setTimeout(() => {
      if (active) {
        setAuthLoading(false);
        router.replace("/login");
      }
    }, 3000);

    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!active) return;
        clearTimeout(fallbackTimer);
        const user = data.user ?? null;
        setUserEmail(user?.email ?? null);
        setUserId(user?.id ?? null);
        setAuthLoading(false);
        if (!user) {
          router.replace("/login");
        }
      })
      .catch(() => {
        if (!active) return;
        clearTimeout(fallbackTimer);
        setAuthLoading(false);
        router.replace("/login");
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      clearTimeout(fallbackTimer);
      const user = session?.user ?? null;
      setUserEmail(user?.email ?? null);
      setUserId(user?.id ?? null);
      setAuthLoading(false);
      if (!user) {
        router.replace("/login");
      }
    });

    return () => {
      active = false;
      clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
  }, [router]);

  async function handleLogout() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    setUserEmail(null);
    setUserId(null);
    router.replace("/login");
    router.refresh();
  }

  // LOAD CHAT HISTORY (USER-WISE)
  useEffect(() => {
    if (authLoading) return;

    const chatKey = getChatStorageKey(userId);
    setHistoryLoaded(false);

    async function loadChatHistory() {
      let localChats: ChatConversation[] = [];

      try {
        const stored = localStorage.getItem(chatKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) localChats = parsed;
        }
      } catch (err) {
        console.error("Local history error:", err);
      }

      try {
        const response = await fetch("/api/conversations");
        if (!response.ok) throw new Error("Database fetch failed");

        const data = await response.json();

        const databaseChats: ChatConversation[] = await Promise.all(
          data.conversations.map(async (chat: {
            id: string;
            title: string;
            updated_at: string;
          }) => {
            const messageResponse = await fetch(
              `/api/conversations?id=${encodeURIComponent(chat.id)}`
            );

            if (!messageResponse.ok) {
              throw new Error("Failed to load conversation");
            }

            const messageData = await messageResponse.json();

            return {
              id: chat.id,
              title: chat.title,
              updatedAt:
                Date.parse(chat.updated_at.replace(" ", "T")) || Date.now(),
              messages: messageData.conversation.messages.map(
                (item: { role: string; content: string }) => ({
                  role: item.role,
                  content: item.content,
                })
              ),
            };
          })
        );

        const mergedChats = [
          ...databaseChats,
          ...localChats.filter(
            (local) => !databaseChats.some((db) => db.id === local.id)
          ),
        ];

        setSavedChats(mergedChats);
      } catch (err) {
        console.error("Database history loading error:", err);
        setSavedChats(localChats);
      }

      setHistoryLoaded(true);
    }

    loadChatHistory();
  }, [authLoading, userId]);

  // SAVE CHAT HISTORY (USER-WISE)
  useEffect(() => {
    if (historyLoaded && !authLoading) {
      localStorage.setItem(getChatStorageKey(userId), JSON.stringify(savedChats));
    }
  }, [savedChats, historyLoaded, authLoading, userId]);

  // AUTO SCROLL
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading]);

  // CLEANUP VOICE ON UNMOUNT
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  if (authLoading || !userId) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#080808",
          color: "#858585",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "13px",
        }}
      >
        Checking session...
      </main>
    );
  }

  // HANDLE IMAGE, CODE, TEXT, PDF & DOCX UPLOAD
  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    const lowerName = file.name.toLowerCase();

    if (file.size > 10 * 1024 * 1024) {
      setError("File size must be under 10MB.");
      event.target.value = "";
      return;
    }

    if (lowerName.endsWith(".pdf") || lowerName.endsWith(".docx")) {
      setParsingFile(true);
      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/parse-file", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to read document.");
        }

        setAttachment({
          name: data.name,
          type: "file",
          content: data.content,
        });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Document upload failed."
        );
      } finally {
        setParsingFile(false);
        event.target.value = "";
      }
      return;
    }

    const reader = new FileReader();

    if (file.type.startsWith("image/")) {
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setAttachment({
            name: file.name,
            type: "image",
            content: reader.result,
          });
        }
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setAttachment({
            name: file.name,
            type: "file",
            content: reader.result,
          });
        }
      };
      reader.readAsText(file);
    }

    event.target.value = "";
  }

  // VOICE INPUT (SPEECH TO TEXT - EN & HI)
  function toggleVoiceInput() {
    if (typeof window === "undefined") return;

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError(
        "Voice input is not supported in this browser. Please use Chrome or Edge."
      );
      return;
    }

    setError("");
    const recognition = new SpeechRecognition();
    recognition.lang = voiceLang;
    recognition.interimResults = true;
    recognition.continuous = false;

    const baseMessage = message.trim() ? message.trim() + " " : "";

    recognition.onstart = () => {
      setIsListening(true);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setMessage(baseMessage + transcript);
    };

    recognition.onerror = () => {
      setIsListening(false);
      setError("Mic error: Please allow microphone permission in browser.");
    };

    recognition.onend = () => {
      setIsListening(false);
      textareaRef.current?.focus();
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  // VOICE OUTPUT (TEXT TO SPEECH - AUTO HINDI & ENGLISH)
  function speakText(content: string, index: number) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    window.speechSynthesis.cancel();

    const cleanText = content.replace(/[*#`]/g, "");
    const hasHindi = /[\u0900-\u097F]/.test(cleanText);
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = hasHindi ? "hi-IN" : "en-IN";
    utterance.rate = 1;

    utterance.onstart = () => setSpeakingIndex(index);
    utterance.onend = () => setSpeakingIndex(null);
    utterance.onerror = () => setSpeakingIndex(null);

    window.speechSynthesis.speak(utterance);
  }

  function toggleSpeakMessage(content: string, index: number) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setError("Voice output is not supported in this browser.");
      return;
    }

    if (speakingIndex === index) {
      window.speechSynthesis.cancel();
      setSpeakingIndex(null);
      return;
    }

    speakText(content, index);
  }

  // CREATE NEW CHAT
  function createNewChat() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setSpeakingIndex(null);
    }
    setCurrentChatId(null);
    setMessages([]);
    setMessage("");
    setAttachment(null);
    setError("");
    setActiveView("chat");
    setSidebarOpen(false);
    textareaRef.current?.focus();
  }

  // OPEN CHAT
  function openChat(chatId: string) {
    const selected = savedChats.find((chat) => chat.id === chatId);

    if (!selected) return;

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setSpeakingIndex(null);
    }
    setCurrentChatId(selected.id);
    setMessages(selected.messages);
    setMessage("");
    setAttachment(null);
    setError("");
    setActiveView("chat");
    setSidebarOpen(false);
  }

  // SAVE OR UPDATE CHAT
  function updateConversation(
    chatId: string,
    updatedMessages: ChatMessage[]
  ) {
    const firstUserMessage = updatedMessages.find(
      (item) => item.role === "user"
    );

    const title =
      firstUserMessage?.content.slice(0, 35) || "New conversation";

    setSavedChats((previous) => {
      const existing = previous.find((chat) => chat.id === chatId);

      const updatedChat: ChatConversation = {
        id: chatId,
        title: existing?.title || title,
        messages: updatedMessages,
        updatedAt: Date.now(),
      };

      const remaining = previous.filter((chat) => chat.id !== chatId);

      return [updatedChat, ...remaining];
    });
  }

  // DELETE CHAT
  function deleteChat(chatId: string) {
    setSavedChats((previous) =>
      previous.filter((chat) => chat.id !== chatId)
    );

    if (currentChatId === chatId) {
      setCurrentChatId(null);
      setMessages([]);
    }
  }

  // CLEAR LOCAL CHATS
  function clearLocalChats() {
    const confirmed = window.confirm(
      "Clear all locally cached conversations from this browser?"
    );
    if (!confirmed) return;
    localStorage.removeItem(getChatStorageKey(userId));
    setSavedChats([]);
    setCurrentChatId(null);
    setMessages([]);
  }

  // LOAD MEMORIES
  async function loadMemories() {
    setMemoryLoading(true);
    setMemoryError("");

    try {
      const response = await fetch("/api/memory");
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to load memories.");
      }

      const items = Array.isArray(data.memories) ? data.memories : [];

      setMemories(
        items.filter((item: MemoryItem) => item.category !== "test")
      );
    } catch (err) {
      setMemoryError(
        err instanceof Error ? err.message : "Memory loading failed."
      );
    } finally {
      setMemoryLoading(false);
    }
  }

  // OPEN MEMORY LIBRARY
  function openMemoryLibrary() {
    setActiveView("memory");
    setSidebarOpen(false);
    loadMemories();
  }

  // DELETE MEMORY
  async function deleteMemory(id: number) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this memory?"
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/memory?id=${id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to delete memory.");
      }

      setMemories((previous) =>
        previous.filter((item) => item.id !== id)
      );

      setMemoryError("");
    } catch (err) {
      setMemoryError(
        err instanceof Error ? err.message : "Memory delete failed."
      );
    }
  }

  // EDIT MEMORY
  async function editMemory(item: MemoryItem) {
    const newContent = window.prompt(
      "Edit your saved memory:",
      item.content
    );

    if (newContent === null || !newContent.trim()) return;

    try {
      const response = await fetch("/api/memory", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: item.id,
          content: newContent.trim(),
          category: item.category,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Memory update failed.");
      }

      setMemoryError("");
      await loadMemories();
    } catch (err) {
      setMemoryError(
        err instanceof Error ? err.message : "Memory update failed."
      );
    }
  }

  // SEND MESSAGE (WITH REAL-TIME STREAMING SUPPORT)
  async function sendMessage(text?: string) {
    const rawText = (text ?? message).trim();

    if ((!rawText && !attachment) || loading || parsingFile || !historyLoaded)
      return;

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }

    const currentAttachment = attachment;
    const displayMessage = currentAttachment
      ? `${currentAttachment.type === "image" ? "🖼️" : "📄"} [${
          currentAttachment.name
        }]\n${rawText || "Analyze this file."}`
      : rawText;

    setMessage("");
    setAttachment(null);
    setError("");
    setActiveView("chat");
    setLoading(true);

    const chatId = currentChatId || crypto.randomUUID();

    if (!currentChatId) {
      setCurrentChatId(chatId);
    }

    const updatedMessages: ChatMessage[] = [
      ...messages,
      {
        role: "user",
        content: displayMessage,
      },
    ];

    setMessages(updatedMessages);
    updateConversation(chatId, updatedMessages);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            ...messages,
            {
              role: "user",
              content: rawText || "Analyze this uploaded file.",
            },
          ],
          conversationId: chatId,
          aiMode,
          webSearch,
          attachment: currentAttachment,
          title:
            updatedMessages
              .find((item) => item.role === "user")
              ?.content.slice(0, 60) || "New Chat",
        }),
      });

      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || data.reply || "Something went wrong."
          );
        }

        const replyText = data.reply || "I could not generate a response.";
        const finalMessages: ChatMessage[] = [
          ...updatedMessages,
          {
            role: "assistant",
            content: replyText,
          },
        ];

        setMessages(finalMessages);
        updateConversation(chatId, finalMessages);

        if (settings.autoSpeakReplies) {
          speakText(replyText, finalMessages.length - 1);
        }

        if (data.memorySaved) {
          await loadMemories();
        }
        return;
      }

      if (!response.ok || !response.body) {
        throw new Error("Streaming response failed.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamedReply = "";
      let startedTyping = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;

        streamedReply += chunk;

        if (!startedTyping) {
          startedTyping = true;
          setLoading(false);
        }

        const liveMessages: ChatMessage[] = [
          ...updatedMessages,
          {
            role: "assistant",
            content: streamedReply,
          },
        ];

        setMessages(liveMessages);
      }

      const finalReply =
        streamedReply.trim() || "I could not generate a response.";
      const finalMessages: ChatMessage[] = [
        ...updatedMessages,
        {
          role: "assistant",
          content: finalReply,
        },
      ];

      setMessages(finalMessages);
      updateConversation(chatId, finalMessages);

      if (settings.autoSpeakReplies) {
        speakText(finalReply, finalMessages.length - 1);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to connect to ABHYQ AI."
      );
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  // COPY MESSAGE
  async function copyMessage(content: string, index: number) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);

      setTimeout(() => {
        setCopiedIndex(null);
      }, 1500);
    } catch {
      setError("Unable to copy message.");
    }
  }

  const sortedChats = [...savedChats].sort(
    (a, b) => b.updatedAt - a.updatedAt
  );

  const profileInitial = userEmail
    ? userEmail.charAt(0).toUpperCase()
    : "A";

  const viewTitle =
    activeView === "memory"
      ? "Memory Library"
      : activeView === "settings"
      ? "Settings"
      : "Explore";

  return (
    <main className="app">
      {sidebarOpen && (
        <div
          className="mobile-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-icon">
            <span>A</span>
          </div>

          <div className="brand-name">
            ABHYQ<span>.</span>
          </div>

          <button
            className="mobile-close"
            onClick={() => setSidebarOpen(false)}
          >
            ×
          </button>
        </div>

        <button className="new-chat" onClick={createNewChat}>
          <span className="plus">＋</span>
          <span>New conversation</span>
          <span className="shortcut">⌘ K</span>
        </button>

        <div className="section-label">WORKSPACE</div>

        <button
          className={`nav-item ${activeView === "chat" ? "nav-active" : ""}`}
          onClick={() => {
            setActiveView("chat");
            setSidebarOpen(false);
          }}
        >
          <span className="nav-icon">◈</span>
          Explore
        </button>

        <button
          className={`nav-item ${activeView === "memory" ? "nav-active" : ""}`}
          onClick={openMemoryLibrary}
        >
          <span className="nav-icon">▤</span>
          Memory Library
        </button>

        <button
          className={`nav-item ${
            activeView === "settings" ? "nav-active" : ""
          }`}
          onClick={() => {
            setActiveView("settings");
            setSidebarOpen(false);
          }}
        >
          <span className="nav-icon">⚙</span>
          Settings
        </button>

        <div className="section-label recent-label">RECENT CHATS</div>

        <div className="chat-history-list">
          {!historyLoaded ? (
            <div className="empty-history">Loading conversations...</div>
          ) : sortedChats.length === 0 ? (
            <div className="empty-history">
              Your conversations will appear here.
            </div>
          ) : (
            sortedChats.map((chat) => (
              <div
                key={chat.id}
                className={`history-row ${
                  currentChatId === chat.id ? "history-selected" : ""
                }`}
              >
                <button
                  className="history-button"
                  onClick={() => openChat(chat.id)}
                  title={chat.title}
                >
                  <span className="history-dot">◦</span>
                  <span className="history-title">{chat.title}</span>
                </button>

                <button
                  className="delete-chat"
                  title="Delete conversation"
                  onClick={() => deleteChat(chat.id)}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>

        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <div className="upgrade-symbol">✦</div>
            <div>
              <strong>Beyond ordinary AI</strong>
              <p>Intelligence without limits.</p>
            </div>
          </div>

          <div className="profile">
            <div className="avatar">{profileInitial}</div>

            <div className="profile-info">
              <strong>
                {authLoading
                  ? "Loading..."
                  : userEmail || "ABHYQ User"}
              </strong>
              <span>
                {userEmail ? "Verified account" : "Guest session"}
              </span>
            </div>

            <button
              type="button"
              className="auth-action-btn"
              onClick={() => {
                setActiveView("settings");
                setSidebarOpen(false);
              }}
              title="Open Settings"
            >
              ⚙
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN AREA */}
      <section className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="menu-button"
              onClick={() => setSidebarOpen(true)}
            >
              ☰
            </button>

            <div className="breadcrumb">
              Workspace <span>/</span>
              <strong>{viewTitle}</strong>
            </div>
          </div>

          <div className="topbar-right">
            {userEmail && (
              <span className="topbar-email" title={userEmail}>
                {userEmail}
              </span>
            )}

            <button
              type="button"
              className="status-pill"
              onClick={toggleAiMode}
              title="Switch between Cloud AI (Groq) and Local AI (Ollama)"
            >
              <span
                className="status-dot"
                style={{
                  background: aiMode === "local" ? "#ffd400" : "#b8ed54",
                  boxShadow:
                    aiMode === "local"
                      ? "0 0 9px #ffd400"
                      : "0 0 9px #b8ed54",
                }}
              />
              {aiMode === "local" ? "Local AI" : "Cloud AI"}
            </button>

            <button
              type="button"
              className="auth-action-btn"
              onClick={() => setActiveView("settings")}
            >
              Settings
            </button>

            {userEmail ? (
              <button
                type="button"
                className="auth-action-btn"
                onClick={handleLogout}
              >
                Logout
              </button>
            ) : (
              <button
                type="button"
                className="auth-action-btn"
                onClick={() => router.push("/login")}
              >
                Login
              </button>
            )}

            <div className="top-avatar">{profileInitial}</div>
          </div>
        </header>

        {/* CHAT VIEW */}
        {activeView === "chat" && (
          <div className="content">
            {messages.length === 0 ? (
              <div className="welcome">
                <div className="welcome-badge">
                  <span className="badge-dot" />
                  YOUR INTELLIGENT AI ASSISTANT
                </div>

                <div className="ai-core">
                  <div className="core-ring ring-one" />
                  <div className="core-ring ring-two" />
                  <div className="core-ring ring-three" />

                  <div className="core-center">
                    <span>A</span>
                  </div>

                  <div className="core-orbit orbit-one" />
                  <div className="core-orbit orbit-two" />
                </div>

                <h1>
                  Think beyond.
                  <br />
                  <span>Build with ABHYQ.</span>
                </h1>

                <p className="welcome-description">
                  Your ideas deserve more than ordinary answers.
                  <br />
                  Explore, create, learn and build with intelligence.
                </p>

                <div className="suggestion-grid">
                  {suggestions.map((item) => (
                    <button
                      className="suggestion-card"
                      key={item.title}
                      onClick={() => sendMessage(item.prompt)}
                    >
                      <div className="suggestion-icon">{item.icon}</div>

                      <div className="suggestion-text">
                        <strong>{item.title}</strong>
                        <span>{item.description}</span>
                      </div>

                      <span className="suggestion-arrow">↗</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="conversation">
                <div className="conversation-messages">
                  {messages.map((item, index) => (
                    <div
                      key={`${index}-${item.role}`}
                      className={`message-row ${
                        item.role === "user" ? "user-row" : "assistant-row"
                      }`}
                    >
                      {item.role === "assistant" && (
                        <div className="message-avatar">A</div>
                      )}

                      <div className="message-content">
                        <div className="message-author">
                          {item.role === "user" ? "You" : "ABHYQ"}
                          {item.role === "assistant" && (
                            <span className="ai-label">AI</span>
                          )}
                        </div>

                        <div className="message-text">
                          {item.role === "assistant" ? (
                            <FormattedMessage content={item.content} />
                          ) : (
                            item.content
                          )}
                        </div>

                        {item.role === "assistant" && (
                          <div className="message-actions">
                            <button
                              className="copy-button"
                              onClick={() => copyMessage(item.content, index)}
                            >
                              {copiedIndex === index ? "✓ Copied" : "▢ Copy"}
                            </button>

                            <button
                              className={`copy-button ${
                                speakingIndex === index ? "speaking-active" : ""
                              }`}
                              onClick={() =>
                                toggleSpeakMessage(item.content, index)
                              }
                            >
                              {speakingIndex === index ? "⏹ Stop" : "🔊 Listen"}
                            </button>
                          </div>
                        )}
                      </div>

                      {item.role === "user" && (
                        <div className="user-avatar">{profileInitial}</div>
                      )}
                    </div>
                  ))}

                  {loading && (
                    <div className="message-row assistant-row">
                      <div className="message-avatar">A</div>

                      <div className="message-content">
                        <div className="message-author">ABHYQ</div>

                        <div className="typing">
                          <span />
                          <span />
                          <span />
                          <small>
                            {webSearch
                              ? "Searching web..."
                              : aiMode === "local"
                              ? "Thinking locally..."
                              : "Thinking..."}
                          </small>
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </div>
            )}

            {error && <div className="error-box">⚠ {error}</div>}

            {/* MESSAGE COMPOSER */}
            <div className="composer-area">
              <div className="composer">
                <div className="composer-heading">
                  <span className="composer-live-dot" />
                  Message ABHYQ
                  <span className="composer-mode">
                    {parsingFile
                      ? "READING DOCUMENT..."
                      : attachment
                      ? attachment.type === "image"
                        ? "VISION MODE"
                        : "FILE MODE"
                      : webSearch
                      ? "LIVE WEB MODE"
                      : aiMode === "local"
                      ? "LOCAL AI MODE"
                      : "CLOUD STREAM MODE"}
                  </span>
                </div>

                {attachment && (
                  <div className="attachment-preview">
                    <span>
                      {attachment.type === "image" ? "🖼️" : "📄"}{" "}
                      <strong>{attachment.name}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setAttachment(null)}
                      title="Remove attachment"
                    >
                      ×
                    </button>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.docx,.txt,.md,.json,.js,.ts,.tsx,.jsx,.py,.csv,.html,.css"
                  style={{ display: "none" }}
                  onChange={handleFileSelect}
                />

                <textarea
                  ref={textareaRef}
                  placeholder={
                    parsingFile
                      ? "Reading document..."
                      : isListening
                      ? voiceLang === "hi-IN"
                        ? "Listening... Speak in Hindi..."
                        : "Listening... Speak in English/Hinglish..."
                      : attachment
                      ? `Ask anything about ${attachment.name}...`
                      : webSearch
                      ? "Ask anything (Live Web Search is ON)..."
                      : "Ask anything. Imagine everything..."
                  }
                  value={message}
                  rows={2}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                />

                <div className="composer-bottom">
                  <div className="composer-hint">
                    <span>↵</span> Enter to send
                    <span className="hint-divider">·</span>
                    Shift + Enter for new line
                  </div>

                  <div className="composer-actions">
                    <button
                      type="button"
                      className="mic-button"
                      disabled={parsingFile}
                      onClick={() => fileInputRef.current?.click()}
                      title="Upload image, PDF, Word (.docx) or code/text file"
                    >
                      {parsingFile ? "⏳ Reading..." : "📎 Attach"}
                    </button>

                    <button
                      type="button"
                      className={`mic-button ${webSearch ? "mic-active" : ""}`}
                      onClick={() => setWebSearch((prev) => !prev)}
                      title="Toggle Live Web Search"
                    >
                      {webSearch ? "🌐 Web: ON" : "🌐 Web"}
                    </button>

                    <button
                      type="button"
                      className="mic-button"
                      onClick={() =>
                        setVoiceLang((prev) =>
                          prev === "en-IN" ? "hi-IN" : "en-IN"
                        )
                      }
                      title="Switch voice language (English / Hindi)"
                    >
                      {voiceLang === "en-IN" ? "EN" : "HI"}
                    </button>

                    <button
                      type="button"
                      className={`mic-button ${isListening ? "mic-active" : ""}`}
                      onClick={toggleVoiceInput}
                      title={isListening ? "Stop listening" : "Speak prompt"}
                    >
                      {isListening ? "⏹ Listening" : "🎤 Voice"}
                    </button>

                    <button
                      className="send-button"
                      onClick={() => sendMessage()}
                      disabled={
                        loading || parsingFile || (!message.trim() && !attachment)
                      }
                    >
                      {loading ? "Thinking" : "Send"}
                      <span>↑</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="disclaimer">
                ABHYQ can make mistakes. Verify important information.
              </div>
            </div>
          </div>
        )}

        {/* MEMORY LIBRARY */}
        {activeView === "memory" && (
          <div className="memory-page">
            <div className="memory-heading">
              <div className="welcome-badge">
                <span className="badge-dot" />
                ABHYQ MEMORY SYSTEM
              </div>

              <h1>
                Memory <span>Library.</span>
              </h1>

              <p>
                Information ABHYQ has saved to remember across conversations.
              </p>
            </div>

            <div className="memory-toolbar">
              <div>
                <strong>{memories.length} Memories</strong>
                <span>Stored in your cloud database</span>
              </div>

              <button onClick={loadMemories} disabled={memoryLoading}>
                ↻ Refresh
              </button>
            </div>

            {memoryError && (
              <div className="error-box">⚠ {memoryError}</div>
            )}

            {memoryLoading ? (
              <div className="memory-empty">Loading memories...</div>
            ) : memories.length === 0 ? (
              <div className="memory-empty">
                <div className="empty-memory-icon">◈</div>
                <h3>No memories yet</h3>
                <p>
                  Tell ABHYQ something and say &quot;Yaad rakhna&quot; to save it.
                </p>
                <button onClick={createNewChat}>Start a conversation ↗</button>
              </div>
            ) : (
              <div className="memory-list">
                {memories.map((item) => (
                  <div className="memory-card" key={item.id}>
                    <div className="memory-card-top">
                      <span className="memory-category">
                        {item.category}
                      </span>

                      <div className="memory-actions">
                        <button
                          className="memory-edit"
                          onClick={() => editMemory(item)}
                          title="Edit memory"
                        >
                          Edit
                        </button>

                        <button
                          className="memory-delete"
                          onClick={() => deleteMemory(item.id)}
                          title="Delete memory"
                        >
                          ×
                        </button>
                      </div>
                    </div>

                    <p>{item.content}</p>

                    <span className="memory-date">
                      Saved: {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SETTINGS VIEW */}
        {activeView === "settings" && (
          <div className="memory-page">
            <div className="memory-heading">
              <div className="welcome-badge">
                <span className="badge-dot" />
                WORKSPACE PREFERENCES
              </div>

              <h1>
                Account &amp; <span>Settings.</span>
              </h1>

              <p>
                Manage your ABHYQ profile, voice preferences, and workspace behavior.
              </p>
            </div>

            {settingsSavedToast && (
              <div className="settings-toast">✓ Preferences saved</div>
            )}

            <div className="settings-stack">
              {/* ACCOUNT CARD */}
              <div className="settings-card">
                <div className="settings-card-header">
                  <div>
                    <span className="memory-category">ACCOUNT</span>
                    <h3>Profile &amp; Authentication</h3>
                  </div>
                  <div className="avatar">{profileInitial}</div>
                </div>

                <div className="settings-row">
                  <div>
                    <strong>Email Address</strong>
                    <span>{userEmail || "Not logged in"}</span>
                  </div>
                  <span className="settings-pill">
                    {userEmail ? "OTP Verified" : "Guest"}
                  </span>
                </div>

                {userId && (
                  <div className="settings-row">
                    <div>
                      <strong>User ID</strong>
                      <span className="mono-id">{userId}</span>
                    </div>
                  </div>
                )}

                <div className="settings-row">
                  <div>
                    <strong>Session Control</strong>
                    <span>Sign out or switch your email account</span>
                  </div>
                  {userEmail ? (
                    <button
                      type="button"
                      className="danger-btn"
                      onClick={handleLogout}
                    >
                      Logout
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="auth-action-btn"
                      onClick={() => router.push("/login")}
                    >
                      Login with OTP
                    </button>
                  )}
                </div>
              </div>

              {/* AI & VOICE PREFERENCES */}
              <div className="settings-card">
                <div className="settings-card-header">
                  <div>
                    <span className="memory-category">ASSISTANT</span>
                    <h3>Voice &amp; Search Defaults</h3>
                  </div>
                </div>

                <div className="settings-row">
                  <div>
                    <strong>AI Engine Mode</strong>
                    <span>Switch between Cloud AI (Groq) and Local AI (Ollama)</span>
                  </div>
                  <button
                    type="button"
                    className={`toggle-btn ${
                      aiMode === "local" ? "toggle-on" : ""
                    }`}
                    onClick={toggleAiMode}
                  >
                    {aiMode === "local" ? "LOCAL" : "CLOUD"}
                  </button>
                </div>

                <div className="settings-row">
                  <div>
                    <strong>Default Voice Input Language</strong>
                    <span>Choose English or Hindi for microphone recognition</span>
                  </div>
                  <div className="segmented-control">
                    <button
                      type="button"
                      className={
                        settings.defaultVoiceLang === "en-IN" ? "seg-active" : ""
                      }
                      onClick={() =>
                        updateSettings({ defaultVoiceLang: "en-IN" })
                      }
                    >
                      English (EN)
                    </button>
                    <button
                      type="button"
                      className={
                        settings.defaultVoiceLang === "hi-IN" ? "seg-active" : ""
                      }
                      onClick={() =>
                        updateSettings({ defaultVoiceLang: "hi-IN" })
                      }
                    >
                      Hindi (HI)
                    </button>
                  </div>
                </div>

                <div className="settings-row">
                  <div>
                    <strong>Live Web Search by Default</strong>
                    <span>Start every session with live web search enabled</span>
                  </div>
                  <button
                    type="button"
                    className={`toggle-btn ${
                      settings.defaultWebSearch ? "toggle-on" : ""
                    }`}
                    onClick={() =>
                      updateSettings({
                        defaultWebSearch: !settings.defaultWebSearch,
                      })
                    }
                  >
                    {settings.defaultWebSearch ? "ON" : "OFF"}
                  </button>
                </div>

                <div className="settings-row">
                  <div>
                    <strong>Auto-Speak Assistant Replies</strong>
                    <span>Read AI responses aloud automatically after reply</span>
                  </div>
                  <button
                    type="button"
                    className={`toggle-btn ${
                      settings.autoSpeakReplies ? "toggle-on" : ""
                    }`}
                    onClick={() =>
                      updateSettings({
                        autoSpeakReplies: !settings.autoSpeakReplies,
                      })
                    }
                  >
                    {settings.autoSpeakReplies ? "ON" : "OFF"}
                  </button>
                </div>
              </div>

              {/* STORAGE & DATA */}
              <div className="settings-card">
                <div className="settings-card-header">
                  <div>
                    <span className="memory-category">DATA</span>
                    <h3>Workspace Storage</h3>
                  </div>
                </div>

                <div className="settings-row">
                  <div>
                    <strong>Local Browser Conversations</strong>
                    <span>{savedChats.length} conversations cached locally</span>
                  </div>
                  <button
                    type="button"
                    className="danger-btn"
                    onClick={clearLocalChats}
                  >
                    Clear Cache
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <footer className="footer">
          <strong>ABHYQ</strong>
          <span> — Intelligence Without Limits.</span>
        </footer>
      </section>

      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap");

        :root {
          --yellow: #ffd400;
          --background: #080808;
          --panel: #101010;
          --muted: #858585;
          --border: rgba(255, 255, 255, 0.08);
        }

        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          min-height: 100%;
          background: var(--background);
          color: #fff;
          font-family: "DM Sans", sans-serif;
        }

        button,
        textarea {
          font: inherit;
        }

        button {
          cursor: pointer;
        }

        button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .app {
          min-height: 100vh;
          display: flex;
          overflow: hidden;
          background:
            radial-gradient(
              ellipse at 72% 10%,
              rgba(255, 212, 0, 0.055),
              transparent 38%
            ),
            #080808;
        }

        .sidebar {
          width: 258px;
          min-width: 258px;
          height: 100vh;
          position: sticky;
          top: 0;
          padding: 25px 17px 15px;
          background: #0d0d0d;
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          z-index: 20;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 0 7px;
          margin-bottom: 34px;
        }

        .brand-icon {
          width: 37px;
          height: 37px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          background: var(--yellow);
          color: #080808;
          font-family: "Space Grotesk", sans-serif;
          font-size: 23px;
          font-weight: 800;
          box-shadow: 0 0 25px rgba(255, 212, 0, 0.2);
        }

        .brand-name {
          font-family: "Space Grotesk", sans-serif;
          font-size: 23px;
          font-weight: 700;
          letter-spacing: 2px;
        }

        .brand-name span {
          color: var(--yellow);
        }

        .mobile-close {
          display: none;
          margin-left: auto;
          border: 0;
          background: transparent;
          color: white;
          font-size: 25px;
        }

        .new-chat {
          height: 46px;
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 12px;
          border: 1px solid rgba(255, 212, 0, 0.35);
          border-radius: 10px;
          color: var(--yellow);
          background: rgba(255, 212, 0, 0.07);
          font-size: 13px;
          font-weight: 700;
          transition: 0.2s;
        }

        .new-chat:hover {
          background: rgba(255, 212, 0, 0.14);
          border-color: var(--yellow);
          transform: translateY(-1px);
        }

        .plus {
          font-size: 21px;
        }

        .shortcut {
          margin-left: auto;
          color: #777;
          font-size: 10px;
        }

        .section-label {
          margin: 29px 9px 11px;
          color: #666;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1.5px;
        }

        .nav-item {
          width: 100%;
          height: 41px;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 0 11px;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: #999;
          text-align: left;
          font-size: 13px;
          transition: 0.2s;
        }

        .nav-item:hover,
        .nav-active {
          background: rgba(255, 255, 255, 0.055);
          color: #fff;
        }

        .nav-active .nav-icon {
          color: var(--yellow);
        }

        .nav-icon {
          font-size: 17px;
        }

        .recent-label {
          margin-top: 24px;
        }

        .chat-history-list {
          flex: 1;
          overflow-y: auto;
          min-height: 80px;
        }

        .chat-history-list::-webkit-scrollbar {
          width: 3px;
        }

        .chat-history-list::-webkit-scrollbar-thumb {
          background: #333;
        }

        .empty-history {
          padding: 10px;
          color: #666;
          font-size: 11px;
          line-height: 1.6;
        }

        .history-row {
          display: flex;
          align-items: center;
          margin-bottom: 3px;
          border-radius: 7px;
        }

        .history-row:hover,
        .history-selected {
          background: rgba(255, 255, 255, 0.055);
        }

        .history-button {
          min-width: 0;
          flex: 1;
          height: 37px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 8px;
          border: 0;
          background: transparent;
          color: #999;
          text-align: left;
          font-size: 12px;
        }

        .history-title {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .history-dot {
          color: var(--yellow);
          font-size: 19px;
        }

        .delete-chat {
          opacity: 0;
          border: 0;
          background: transparent;
          color: #888;
          font-size: 18px;
          padding: 3px 9px;
        }

        .history-row:hover .delete-chat {
          opacity: 1;
        }

        .delete-chat:hover {
          color: #ff6262;
        }

        .sidebar-bottom {
          margin-top: auto;
        }

        .upgrade-card {
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 13px 11px;
          margin-bottom: 14px;
          border: 1px solid rgba(255, 212, 0, 0.13);
          border-radius: 10px;
          background: linear-gradient(
            120deg,
            rgba(255, 212, 0, 0.08),
            rgba(255, 212, 0, 0.015)
          );
        }

        .upgrade-symbol {
          color: var(--yellow);
          font-size: 22px;
        }

        .upgrade-card strong {
          font-size: 11px;
        }

        .upgrade-card p {
          margin: 4px 0 0;
          color: #777;
          font-size: 10px;
        }

        .profile {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 5px 4px;
          border-top: 1px solid var(--border);
        }

        .avatar,
        .top-avatar,
        .user-avatar {
          width: 33px;
          height: 33px;
          flex-shrink: 0;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: var(--yellow);
          color: #080808;
          font-weight: 800;
          font-family: "Space Grotesk", sans-serif;
        }

        .profile-info {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .profile-info strong {
          font-size: 11px;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .profile-info span {
          color: #777;
          font-size: 10px;
        }

        .auth-action-btn {
          padding: 5px 10px;
          border: 1px solid rgba(255, 212, 0, 0.35);
          border-radius: 7px;
          background: rgba(255, 212, 0, 0.1);
          color: var(--yellow);
          font-size: 10px;
          font-weight: 700;
          transition: 0.2s;
          flex-shrink: 0;
        }

        .auth-action-btn:hover {
          background: rgba(255, 212, 0, 0.2);
          border-color: var(--yellow);
        }

        .topbar-email {
          max-width: 190px;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          color: #ccc;
          font-size: 11px;
        }

        .main {
          flex: 1;
          min-width: 0;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          position: relative;
        }

        .topbar {
          height: 66px;
          min-height: 66px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 35px;
          border-bottom: 1px solid var(--border);
          background: rgba(8, 8, 8, 0.72);
          backdrop-filter: blur(15px);
        }

        .topbar-left,
        .topbar-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .breadcrumb {
          color: #777;
          font-size: 12px;
        }

        .breadcrumb span {
          margin: 0 9px;
          color: #444;
        }

        .breadcrumb strong {
          color: #eee;
          font-weight: 600;
        }

        .status-pill {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 7px 11px;
          border: 1px solid rgba(255, 212, 0, 0.28);
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.03);
          color: #ddd;
          font-size: 10px;
          font-weight: 600;
          transition: 0.2s;
        }

        .status-pill:hover {
          border-color: var(--yellow);
          background: rgba(255, 212, 0, 0.08);
        }

        .status-dot,
        .badge-dot,
        .composer-live-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #b8ed54;
          box-shadow: 0 0 9px #b8ed54;
        }

        .top-avatar {
          width: 31px;
          height: 31px;
          font-size: 12px;
        }

        .menu-button {
          display: none;
          border: 0;
          background: transparent;
          color: white;
          font-size: 21px;
        }

        .content {
          width: 100%;
          max-width: 1050px;
          flex: 1;
          display: flex;
          flex-direction: column;
          margin: 0 auto;
          padding: 0 35px;
        }

        .welcome {
          width: 100%;
          max-width: 760px;
          margin: auto;
          padding: 28px 0 20px;
          text-align: center;
        }

        .welcome-badge {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          padding: 8px 13px;
          border: 1px solid rgba(255, 212, 0, 0.2);
          border-radius: 30px;
          background: rgba(255, 212, 0, 0.045);
          color: #b8a84d;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 1.4px;
        }

        .badge-dot {
          width: 6px;
          height: 6px;
          background: var(--yellow);
          box-shadow: 0 0 10px var(--yellow);
        }

        .ai-core {
          width: 175px;
          height: 175px;
          position: relative;
          display: grid;
          place-items: center;
          margin: 20px auto 9px;
        }

        .core-ring {
          position: absolute;
          border: 1px solid rgba(255, 212, 0, 0.28);
          border-radius: 50%;
        }

        .ring-one {
          inset: 5px;
          animation: rotate 12s linear infinite;
          border-top-color: var(--yellow);
          border-bottom-color: transparent;
        }

        .ring-two {
          inset: 19px;
          border-style: dashed;
          border-color: rgba(255, 212, 0, 0.28);
          animation: rotate-reverse 18s linear infinite;
        }

        .ring-three {
          inset: 33px;
          border-color: rgba(255, 212, 0, 0.4);
          animation: pulse-ring 3s ease-in-out infinite;
        }

        .core-center {
          width: 72px;
          height: 72px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(255, 212, 0, 0.65);
          border-radius: 22px;
          background: radial-gradient(
            circle at 35% 25%,
            #5c4d00,
            #171300 75%
          );
          box-shadow:
            0 0 25px rgba(255, 212, 0, 0.18),
            inset 0 0 20px rgba(255, 212, 0, 0.12);
          transform: rotate(45deg);
        }

        .core-center span {
          color: var(--yellow);
          font-family: "Space Grotesk", sans-serif;
          font-size: 39px;
          font-weight: 800;
          transform: rotate(-45deg);
          text-shadow: 0 0 18px rgba(255, 212, 0, 0.7);
        }

        .core-orbit {
          position: absolute;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--yellow);
          box-shadow: 0 0 15px var(--yellow);
        }

        .orbit-one {
          top: 18px;
          right: 27px;
        }

        .orbit-two {
          bottom: 25px;
          left: 20px;
          width: 5px;
          height: 5px;
        }

        @keyframes rotate {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes rotate-reverse {
          to {
            transform: rotate(-360deg);
          }
        }

        @keyframes pulse-ring {
          50% {
            transform: scale(1.09);
            opacity: 0.45;
          }
        }

        .welcome h1,
        .memory-heading h1 {
          margin: 10px 0 12px;
          font-family: "Space Grotesk", sans-serif;
          font-size: clamp(34px, 5vw, 52px);
          font-weight: 700;
          line-height: 1.12;
          letter-spacing: -2px;
        }

        .welcome h1 span,
        .memory-heading h1 span {
          color: var(--yellow);
        }

        .welcome-description {
          color: #858585;
          font-size: 13px;
          line-height: 1.8;
        }

        .suggestion-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 11px;
          margin-top: 31px;
          text-align: left;
        }

        .suggestion-card {
          min-height: 75px;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 13px;
          border: 1px solid var(--border);
          border-radius: 11px;
          background: rgba(255, 255, 255, 0.025);
          color: #fff;
          text-align: left;
          transition: 0.22s;
        }

        .suggestion-card:hover {
          transform: translateY(-3px);
          border-color: rgba(255, 212, 0, 0.4);
          background: rgba(255, 212, 0, 0.045);
        }

        .suggestion-icon {
          width: 37px;
          height: 37px;
          display: grid;
          place-items: center;
          flex-shrink: 0;
          border-radius: 9px;
          background: rgba(255, 212, 0, 0.09);
          color: var(--yellow);
          font-size: 19px;
        }

        .suggestion-text {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .suggestion-text strong {
          font-size: 12px;
        }

        .suggestion-text span {
          color: #777;
          font-size: 10px;
        }

        .suggestion-arrow {
          margin-left: auto;
          color: #666;
          font-size: 16px;
        }

        .conversation {
          flex: 1;
          min-height: 200px;
          overflow-y: auto;
          padding: 35px 0 20px;
        }

        .conversation-messages {
          max-width: 790px;
          margin: 0 auto;
        }

        .message-row {
          display: flex;
          gap: 13px;
          margin-bottom: 29px;
        }

        .message-avatar {
          width: 32px;
          height: 32px;
          display: grid;
          place-items: center;
          flex-shrink: 0;
          border-radius: 10px;
          background: var(--yellow);
          color: #080808;
          font-family: "Space Grotesk", sans-serif;
          font-weight: 800;
        }

        .user-row {
          justify-content: flex-end;
        }

        .user-avatar {
          width: 32px;
          height: 32px;
          flex-shrink: 0;
          font-size: 12px;
        }

        .message-content {
          min-width: 0;
          max-width: 85%;
        }

        .message-author {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
          color: #eee;
          font-size: 12px;
          font-weight: 700;
        }

        .ai-label {
          padding: 3px 6px;
          border-radius: 4px;
          background: rgba(255, 212, 0, 0.1);
          color: var(--yellow);
          font-size: 8px;
          letter-spacing: 1px;
        }

        .message-text {
          color: #ccc;
          font-size: 14px;
          line-height: 1.8;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        .formatted-message strong {
          color: #fff;
          font-weight: 700;
        }

        .inline-code {
          padding: 2px 6px;
          border: 1px solid rgba(255, 212, 0, 0.25);
          border-radius: 5px;
          background: rgba(255, 212, 0, 0.08);
          color: var(--yellow);
          font-family: "Space Grotesk", monospace;
          font-size: 12px;
        }

        .code-box {
          margin: 12px 0;
          border: 1px solid rgba(255, 212, 0, 0.22);
          border-radius: 11px;
          background: #0c0c0c;
          overflow: hidden;
          white-space: normal;
        }

        .code-box-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 13px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          background: #151515;
        }

        .code-lang {
          color: var(--yellow);
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.8px;
        }

        .code-copy-btn {
          padding: 4px 10px;
          border: 1px solid rgba(255, 212, 0, 0.3);
          border-radius: 6px;
          background: rgba(255, 212, 0, 0.08);
          color: var(--yellow);
          font-size: 11px;
          font-weight: 700;
          transition: 0.2s;
        }

        .code-copy-btn:hover {
          background: rgba(255, 212, 0, 0.18);
        }

        .code-box-pre {
          margin: 0;
          padding: 14px;
          overflow-x: auto;
          color: #eaeaea;
          font-family: Consolas, Monaco, "Courier New", monospace;
          font-size: 13px;
          line-height: 1.6;
          white-space: pre;
        }

        .user-row .message-content {
          padding: 12px 15px;
          border: 1px solid rgba(255, 212, 0, 0.13);
          border-radius: 13px 3px 13px 13px;
          background: rgba(255, 212, 0, 0.07);
        }

        .user-row .message-author {
          justify-content: flex-end;
        }

        .user-row .message-text {
          color: #f0e8c2;
        }

        .message-actions {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-top: 9px;
        }

        .copy-button {
          padding: 4px 0;
          border: 0;
          background: transparent;
          color: #777;
          font-size: 10px;
          transition: 0.2s;
        }

        .copy-button:hover,
        .speaking-active {
          color: var(--yellow);
        }

        .typing {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 12px 0;
        }

        .typing span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--yellow);
          animation: typing 1s infinite ease-in-out;
        }

        .typing span:nth-child(2) {
          animation-delay: 0.15s;
        }

        .typing span:nth-child(3) {
          animation-delay: 0.3s;
        }

        .typing small {
          margin-left: 7px;
          color: #777;
          font-size: 11px;
        }

        @keyframes typing {
          0%,
          60%,
          100% {
            transform: translateY(0);
            opacity: 0.45;
          }
          30% {
            transform: translateY(-5px);
            opacity: 1;
          }
        }

        .composer-area {
          width: 100%;
          max-width: 790px;
          margin: 0 auto;
          padding: 10px 0 13px;
        }

        .composer {
          padding: 14px 16px 11px;
          border: 1px solid rgba(255, 255, 255, 0.13);
          border-radius: 15px;
          background: #111;
          box-shadow: 0 10px 50px rgba(0, 0, 0, 0.2);
          transition: 0.2s;
        }

        .composer:focus-within {
          border-color: rgba(255, 212, 0, 0.45);
          box-shadow: 0 0 25px rgba(255, 212, 0, 0.045);
        }

        .composer-heading {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
          color: #aaa;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.4px;
        }

        .composer-live-dot {
          width: 6px;
          height: 6px;
          background: var(--yellow);
          box-shadow: 0 0 8px var(--yellow);
        }

        .composer-mode {
          margin-left: auto;
          color: #777;
          font-size: 9px;
          letter-spacing: 1px;
        }

        .attachment-preview {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 6px 11px;
          margin-bottom: 9px;
          border: 1px solid rgba(255, 212, 0, 0.35);
          border-radius: 8px;
          background: rgba(255, 212, 0, 0.08);
          color: var(--yellow);
          font-size: 11px;
        }

        .attachment-preview button {
          border: 0;
          background: transparent;
          color: #fff;
          font-size: 16px;
          line-height: 1;
        }

        .composer textarea {
          width: 100%;
          min-height: 52px;
          max-height: 160px;
          resize: vertical;
          border: 0;
          outline: 0;
          background: transparent;
          color: #fff;
          font-size: 14px;
          line-height: 1.6;
        }

        .composer textarea::placeholder {
          color: #606060;
        }

        .composer-bottom {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding-top: 9px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .composer-hint {
          color: #666;
          font-size: 9px;
        }

        .composer-hint span:first-child {
          color: var(--yellow);
        }

        .hint-divider {
          margin: 0 6px;
        }

        .composer-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .mic-button {
          height: 34px;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 0 11px;
          border: 1px solid rgba(255, 212, 0, 0.3);
          border-radius: 8px;
          background: rgba(255, 212, 0, 0.07);
          color: var(--yellow);
          font-size: 11px;
          font-weight: 700;
          transition: 0.2s;
        }

        .mic-button:hover {
          background: rgba(255, 212, 0, 0.15);
          border-color: var(--yellow);
        }

        .mic-active {
          background: rgba(255, 70, 70, 0.16);
          border-color: #ff5c5c;
          color: #ff8a8a;
        }

        .send-button {
          height: 34px;
          display: flex;
          align-items: center;
          gap: 13px;
          padding: 0 13px;
          border: 0;
          border-radius: 8px;
          background: var(--yellow);
          color: #080808;
          font-size: 11px;
          font-weight: 800;
          transition: 0.2s;
        }

        .send-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 5px 20px rgba(255, 212, 0, 0.2);
        }

        .send-button span {
          font-size: 17px;
        }

        .disclaimer {
          margin-top: 10px;
          color: #555;
          text-align: center;
          font-size: 9px;
        }

        .error-box {
          max-width: 790px;
          width: 100%;
          margin: 10px auto;
          padding: 11px 13px;
          border: 1px solid rgba(255, 90, 90, 0.25);
          border-radius: 8px;
          background: rgba(255, 70, 70, 0.07);
          color: #ff9999;
          font-size: 11px;
        }

        .memory-page {
          width: 100%;
          max-width: 850px;
          flex: 1;
          margin: 0 auto;
          padding: 55px 35px 40px;
        }

        .memory-heading {
          margin-bottom: 32px;
        }

        .memory-heading h1 {
          margin-top: 20px;
          font-size: 43px;
        }

        .memory-heading p {
          color: #888;
          font-size: 13px;
          line-height: 1.7;
        }

        .memory-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          padding: 16px;
          border: 1px solid var(--border);
          border-radius: 11px;
          background: rgba(255, 255, 255, 0.025);
        }

        .memory-toolbar div {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .memory-toolbar strong {
          font-size: 13px;
        }

        .memory-toolbar span {
          color: #777;
          font-size: 10px;
        }

        .memory-toolbar button,
        .memory-empty button {
          padding: 9px 13px;
          border: 1px solid rgba(255, 212, 0, 0.3);
          border-radius: 7px;
          background: rgba(255, 212, 0, 0.07);
          color: var(--yellow);
          font-size: 11px;
          font-weight: 700;
        }

        .memory-list {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-top: 17px;
        }

        .memory-card {
          padding: 16px;
          border: 1px solid var(--border);
          border-radius: 11px;
          background: rgba(255, 255, 255, 0.025);
        }

        .memory-card-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .memory-category {
          padding: 5px 8px;
          border-radius: 5px;
          background: rgba(255, 212, 0, 0.1);
          color: var(--yellow);
          font-size: 9px;
          text-transform: uppercase;
        }

        .memory-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .memory-edit {
          border: 0;
          background: transparent;
          color: var(--yellow);
          font-size: 12px;
          cursor: pointer;
        }

        .memory-edit:hover {
          color: #fff;
        }

        .memory-delete {
          border: 0;
          background: transparent;
          color: #777;
          font-size: 20px;
        }

        .memory-delete:hover {
          color: #ff6666;
        }

        .memory-card p {
          margin: 15px 0;
          color: #ddd;
          font-size: 13px;
          line-height: 1.7;
          overflow-wrap: anywhere;
        }

        .memory-date {
          color: #666;
          font-size: 9px;
        }

        .memory-empty {
          padding: 55px 20px;
          margin-top: 17px;
          border: 1px dashed rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          color: #777;
          text-align: center;
          font-size: 12px;
        }

        .empty-memory-icon {
          color: var(--yellow);
          font-size: 35px;
        }

        .memory-empty h3 {
          margin: 13px 0 7px;
          color: #eee;
          font-size: 15px;
        }

        .memory-empty p {
          margin-bottom: 18px;
        }

        /* SETTINGS STYLES */
        .settings-toast {
          margin-bottom: 14px;
          padding: 9px 13px;
          border: 1px solid rgba(184, 237, 84, 0.35);
          border-radius: 8px;
          background: rgba(184, 237, 84, 0.08);
          color: #b8ed54;
          font-size: 11px;
          font-weight: 700;
        }

        .settings-stack {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .settings-card {
          padding: 20px;
          border: 1px solid var(--border);
          border-radius: 13px;
          background: rgba(255, 255, 255, 0.025);
        }

        .settings-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--border);
        }

        .settings-card-header h3 {
          margin: 8px 0 0;
          font-size: 16px;
        }

        .settings-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 14px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.045);
        }

        .settings-row:last-child {
          border-bottom: 0;
          padding-bottom: 2px;
        }

        .settings-row > div {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .settings-row strong {
          font-size: 13px;
        }

        .settings-row span {
          color: #858585;
          font-size: 11px;
        }

        .mono-id {
          font-family: monospace;
          font-size: 10px !important;
          word-break: break-all;
        }

        .settings-pill {
          padding: 5px 10px;
          border: 1px solid rgba(184, 237, 84, 0.3);
          border-radius: 20px;
          background: rgba(184, 237, 84, 0.08);
          color: #b8ed54;
          font-size: 10px;
          font-weight: 700;
        }

        .segmented-control {
          display: flex;
          gap: 6px;
        }

        .segmented-control button {
          padding: 7px 11px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #121212;
          color: #999;
          font-size: 11px;
          font-weight: 600;
        }

        .segmented-control .seg-active {
          border-color: var(--yellow);
          background: rgba(255, 212, 0, 0.14);
          color: var(--yellow);
        }

        .toggle-btn {
          min-width: 58px;
          padding: 7px 12px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #141414;
          color: #888;
          font-size: 11px;
          font-weight: 800;
        }

        .toggle-btn.toggle-on {
          border-color: var(--yellow);
          background: var(--yellow);
          color: #080808;
        }

        .danger-btn {
          padding: 7px 13px;
          border: 1px solid rgba(255, 90, 90, 0.35);
          border-radius: 8px;
          background: rgba(255, 70, 70, 0.12);
          color: #ff8f8f;
          font-size: 11px;
          font-weight: 700;
        }

        .danger-btn:hover {
          background: rgba(255, 70, 70, 0.22);
          border-color: #ff6b6b;
        }

        .footer {
          padding: 13px 20px 17px;
          color: #555;
          text-align: center;
          font-size: 10px;
        }

        .footer strong {
          color: #999;
          letter-spacing: 1px;
        }

        .mobile-overlay {
          display: none;
        }

        @media (max-width: 850px) {
          .sidebar {
            width: 245px;
            min-width: 245px;
          }

          .topbar {
            padding: 0 20px;
          }

          .content {
            padding: 0 20px;
          }
        }

        @media (max-width: 650px) {
          .sidebar {
            position: fixed;
            left: 0;
            top: 0;
            bottom: 0;
            height: 100dvh;
            transform: translateX(-100%);
            transition: transform 0.25s ease;
          }

          .sidebar-open {
            transform: translateX(0);
          }

          .mobile-overlay {
            display: block;
            position: fixed;
            inset: 0;
            z-index: 15;
            background: rgba(0, 0, 0, 0.65);
          }

          .mobile-close {
            display: block;
          }

          .menu-button {
            display: block;
          }

          .topbar {
            height: 58px;
            min-height: 58px;
            padding: 0 14px;
          }

          .topbar-left,
          .topbar-right {
            gap: 8px;
          }

          .topbar-email {
            display: none;
          }

          .breadcrumb {
            font-size: 10px;
          }

          .status-pill {
            padding: 6px 8px;
            font-size: 9px;
          }

          .content {
            padding: 0 13px;
          }

          .welcome {
            padding: 25px 0;
          }

          .ai-core {
            width: 145px;
            height: 145px;
          }

          .core-center {
            width: 62px;
            height: 62px;
          }

          .core-center span {
            font-size: 32px;
          }

          .welcome h1 {
            font-size: 35px;
          }

          .welcome-description {
            font-size: 11px;
          }

          .suggestion-grid {
            gap: 8px;
            margin-top: 22px;
          }

          .suggestion-card {
            min-height: 70px;
            gap: 8px;
            padding: 9px;
          }

          .suggestion-icon {
            width: 30px;
            height: 30px;
            font-size: 15px;
          }

          .suggestion-text strong {
            font-size: 10px;
          }

          .suggestion-text span {
            font-size: 9px;
          }

          .suggestion-arrow {
            display: none;
          }

          .composer {
            padding: 12px;
          }

          .composer-hint {
            font-size: 8px;
          }

          .memory-page {
            padding: 42px 15px 25px;
          }

          .memory-heading h1 {
            font-size: 35px;
          }

          .memory-list {
            grid-template-columns: 1fr;
          }

          .settings-row {
            flex-direction: column;
            align-items: flex-start;
          }

          .message-content {
            max-width: 90%;
          }

          .conversation {
            padding-top: 22px;
          }

          .footer {
            font-size: 9px;
          }
        }

        @media (max-width: 380px) {
          .suggestion-grid {
            grid-template-columns: 1fr;
          }

          .composer-hint {
            display: none;
          }
        }
      `}</style>
    </main>
  );
}