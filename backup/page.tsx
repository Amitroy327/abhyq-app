"use client";

import { useEffect, useRef, useState } from "react";

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

const STORAGE_KEY = "abhyq_conversations";

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
    prompt: "Help me build a professional application.",
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

export default function Home() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [savedChats, setSavedChats] = useState<ChatConversation[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [error, setError] = useState("");

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState<"chat" | "memory">("chat");

  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryError, setMemoryError] = useState("");

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // LOAD CHAT HISTORY
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);

      if (stored) {
        const parsed = JSON.parse(stored);

        if (Array.isArray(parsed)) {
          setSavedChats(parsed);
        }
      }
    } catch (err) {
      console.error("ABHYQ history loading error:", err);
    }

    setHistoryLoaded(true);
  }, []);

  // SAVE CHAT HISTORY
  useEffect(() => {
    if (historyLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedChats));
    }
  }, [savedChats, historyLoaded]);

  // AUTO SCROLL
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading]);

  // CREATE NEW CHAT
  function createNewChat() {
    setCurrentChatId(null);
    setMessages([]);
    setMessage("");
    setError("");
    setActiveView("chat");
    setSidebarOpen(false);
    textareaRef.current?.focus();
  }

  // OPEN CHAT
  function openChat(chatId: string) {
    const selected = savedChats.find((chat) => chat.id === chatId);

    if (!selected) return;

    setCurrentChatId(selected.id);
    setMessages(selected.messages);
    setMessage("");
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

  // SAVE MEMORY
  async function saveMemory(content: string, category: string) {
    const response = await fetch("/api/memory", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content,
        category,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Memory save failed.");
    }
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

      const items = Array.isArray(data.memories)
        ? data.memories
        : [];

      setMemories(items.filter((item: MemoryItem) => item.category !== "test"));
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
    } catch (err) {
      setMemoryError(
        err instanceof Error ? err.message : "Memory delete failed."
      );
    }
  }

  // AUTOMATIC MEMORY DETECTION
  async function detectMemory(userMessage: string) {
    const explicitMatch = userMessage.match(
      /^(?:yaad rakhna(?:\s+ki)?|remember this|remember that|please remember)\s*[:,-]?\s*(.+)$/i
    );

    const preferenceMatch = userMessage.match(
      /^(?:mujhe .{2,100} pasand hai|i (?:really )?(?:like|love|prefer) .{2,100}|my (?:favourite|favorite) .{2,100})[.!]?$/i
    );

    const memoryText =
      explicitMatch?.[1]?.trim() ||
      (preferenceMatch
        ? userMessage.replace(/[.!?]+$/, "").trim()
        : "");

    if (!memoryText) return false;

    await saveMemory(
      memoryText,
      preferenceMatch ? "preference" : "personal"
    );

    return true;
  }

  // SEND MESSAGE
  async function sendMessage(text?: string) {
    const userMessage = (text ?? message).trim();

    if (!userMessage || loading || !historyLoaded) return;

    setMessage("");
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
        content: userMessage,
      },
    ];

    setMessages(updatedMessages);
    updateConversation(chatId, updatedMessages);

    try {
      // CHECK IF USER WANTS ABHYQ TO REMEMBER SOMETHING
      const memorySaved = await detectMemory(userMessage);

      if (memorySaved) {
        const memoryReply =
          "Bilkul! Maine ye baat apni permanent memory mein save kar li hai. Main future conversations mein ise yaad rakh sakta hoon.";

        const finalMessages: ChatMessage[] = [
          ...updatedMessages,
          {
            role: "assistant",
            content: memoryReply,
          },
        ];

        setMessages(finalMessages);
        updateConversation(chatId, finalMessages);
        return;
      }

      // SEND MESSAGE TO ABHYQ AI
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: updatedMessages,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong.");
      }

      const finalMessages: ChatMessage[] = [
        ...updatedMessages,
        {
          role: "assistant",
          content: data.reply || "I could not generate a response.",
        },
      ];

      setMessages(finalMessages);
      updateConversation(chatId, finalMessages);
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
            <div className="avatar">A</div>

            <div className="profile-info">
              <strong>ABHYQ User</strong>
              <span>Personal workspace</span>
            </div>

            <span className="profile-menu">•••</span>
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
              <strong>
                {activeView === "memory" ? "Memory Library" : "Explore"}
              </strong>
            </div>
          </div>

          <div className="topbar-right">
            <div className="status-pill">
              <span className="status-dot" />
              Local AI
            </div>

            <div className="top-avatar">A</div>
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

                        <div className="message-text">{item.content}</div>

                        {item.role === "assistant" && (
                          <button
                            className="copy-button"
                            onClick={() => copyMessage(item.content, index)}
                          >
                            {copiedIndex === index ? "✓ Copied" : "▢ Copy"}
                          </button>
                        )}
                      </div>

                      {item.role === "user" && (
                        <div className="user-avatar">Y</div>
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
                          <small>Thinking...</small>
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
                  <span className="composer-mode">AI MODE</span>
                </div>

                <textarea
                  ref={textareaRef}
                  placeholder="Ask anything. Imagine everything..."
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

                  <button
                    className="send-button"
                    onClick={() => sendMessage()}
                    disabled={loading || !message.trim()}
                  >
                    {loading ? "Thinking" : "Send"}
                    <span>↑</span>
                  </button>
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
                <span>Stored in your local database</span>
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
                  Tell ABHYQ something and say "Yaad rakhna" to save it.
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

                      <button
                        className="memory-delete"
                        onClick={() => deleteMemory(item.id)}
                        title="Delete memory"
                      >
                        ×
                      </button>
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

        /* SIDEBAR */

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
          margin-top: 31px;
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
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: var(--yellow);
          color: #080808;
          font-weight: 800;
          font-family: "Space Grotesk", sans-serif;
        }

        .profile-info {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .profile-info strong {
          font-size: 11px;
        }

        .profile-info span {
          color: #777;
          font-size: 10px;
        }

        .profile-menu {
          margin-left: auto;
          color: #777;
          font-size: 13px;
        }

        /* MAIN */

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
          gap: 16px;
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
          border: 1px solid rgba(255, 212, 0, 0.17);
          border-radius: 20px;
          color: #aaa;
          font-size: 10px;
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

        /* WELCOME SCREEN */

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

        /* ANIMATED AI CORE */

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

        /* CHAT MESSAGES */

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

        .copy-button {
          margin-top: 9px;
          padding: 4px 0;
          border: 0;
          background: transparent;
          color: #777;
          font-size: 10px;
        }

        .copy-button:hover {
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

        /* COMPOSER */

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

        /* MEMORY LIBRARY */

        .memory-page {
          width: 100%;
          max-width: 850px;
          flex: 1;
          margin: 0 auto;
          padding: 65px 35px 40px;
        }

        .memory-heading {
          margin-bottom: 38px;
        }

        .memory-heading h1 {
          margin-top: 22px;
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

        /* FOOTER */

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

        /* MOBILE */

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
            gap: 10px;
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