import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  getAllMemories,
  searchMemories,
  saveMemory,
  markMemoryUsed,
  detectFavoriteColor,
  saveConversation,
  searchConversationHistory,
  type Memory,
} from "@/lib/memory";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type MemoryDetection = {
  category: string;
  groupKey: string | null;
  importance: number;
  content: string;
} | null;

// EXTRACT CLEAN SEARCH KEYWORDS FROM FULL QUESTIONS
function extractSearchQuery(rawQuery: string): string {
  return rawQuery
    .replace(/[?؟!.,]/g, "")
    .replace(
      /^(who is|who are|what is|what are|tell me about|explain|define|where is|when was|founder of|who founded|kaun hai|kya hai|ke founder kaun hain)\s+(the\s+)?(founder\s+of\s+|ceo\s+of\s+|owner\s+of\s+)?/i,
      ""
    )
    .trim();
}

// FREE LIVE WEB SEARCH (WIKIPEDIA SUMMARY + SEARCH + DUCKDUCKGO)
async function performLiveWebSearch(query: string): Promise<string> {
  const results: string[] = [];
  const cleanTopic = extractSearchQuery(query) || query;

  try {
    const wikiSearchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      cleanTopic
    )}&format=json&origin=*&srlimit=3`;

    const wikiRes = await fetch(wikiSearchUrl, {
      signal: AbortSignal.timeout(7000),
    });

    if (wikiRes.ok) {
      const wikiData = await wikiRes.json();
      const hits = wikiData?.query?.search || [];

      if (hits.length > 0) {
        const topTitle = hits[0].title;
        const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
          topTitle
        )}`;

        const summaryRes = await fetch(summaryUrl, {
          signal: AbortSignal.timeout(7000),
        });

        if (summaryRes.ok) {
          const summaryData = await summaryRes.json();
          if (summaryData.extract) {
            results.push(`Main Article (${topTitle}): ${summaryData.extract}`);
          }
        }

        for (const hit of hits) {
          const cleanSnippet = String(hit.snippet || "")
            .replace(/<[^>]*>?/gm, "")
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&amp;/g, "&");

          if (cleanSnippet) {
            results.push(`• [${hit.title}]: ${cleanSnippet}`);
          }
        }
      }
    }
  } catch (err) {
    console.error("Wiki Search Error:", err);
  }

  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(
      cleanTopic
    )}&format=json&no_html=1&skip_disambig=1`;

    const ddgRes = await fetch(ddgUrl, {
      signal: AbortSignal.timeout(6000),
    });

    if (ddgRes.ok) {
      const ddgData = await ddgRes.json();

      if (ddgData.AbstractText) {
        results.push(
          `Web Summary (${ddgData.AbstractSource || "DuckDuckGo"}): ${ddgData.AbstractText}`
        );
      }

      if (Array.isArray(ddgData.RelatedTopics)) {
        for (const item of ddgData.RelatedTopics.slice(0, 3)) {
          if (item && typeof item.Text === "string") {
            results.push(`• ${item.Text}`);
          }
        }
      }
    }
  } catch (err) {
    console.error("DDG Search Error:", err);
  }

  if (results.length === 0) {
    return "NO_RESULTS_FOUND";
  }

  return results.join("\n");
}

function cleanText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function containsSensitiveInformation(text: string): boolean {
  return /\b(password|passcode|otp|cvv|cvc|pin|credit card|debit card|bank account|account number|aadhaar|aadhar|pan number|api key|secret key|private key|access token|auth token|bearer token|seed phrase|recovery phrase)\b/i.test(
    text
  );
}

function isQuestion(text: string): boolean {
  const value = text.trim().toLowerCase();

  return (
    /[?؟]\s*$/.test(value) ||
    /\b(kya|kaise|kyun|kab|kahan|kaun|what|why|when|where|who|how)\b/i.test(
      value
    ) ||
    /\b(batao|samjhao|explain|tell me|describe|define)\b/i.test(value)
  );
}

function isUsableMemory(memory: Memory): boolean {
  const content = memory.content.trim();

  return (
    content.length >= 5 &&
    memory.category !== "test" &&
    !isQuestion(content) &&
    !containsSensitiveInformation(content)
  );
}

function removeRememberPrefix(text: string): {
  content: string;
  explicit: boolean;
} {
  const patterns = [
    /^(?:please\s+)?remember\s+(?:this|that)\s*/i,
    /^please\s+remember\s*/i,
    /^(?:ye|yah|isko)\s+yaad\s+rakhna\s*/i,
    /^yaad\s+rakhna\s*/i,
    /^remember\s*/i,
  ];

  for (const pattern of patterns) {
    if (pattern.test(text)) {
      return {
        content: text
          .replace(pattern, "")
          .replace(/^(?:ki|that|this)\s+/i, "")
          .trim(),
        explicit: true,
      };
    }
  }

  return { content: text, explicit: false };
}

function classifyMemory(content: string, explicit: boolean): MemoryDetection {
  const lower = content.toLowerCase();
  const favoriteColor = detectFavoriteColor(content);

  if (favoriteColor) {
    return {
      category: "preference",
      groupKey: "preferences",
      importance: 5,
      content: `My favorite color is ${favoriteColor}`,
    };
  }

  if (
    /\b(my name is|mera naam|mera name|i am from|i live in|my hometown is|main rehta hoon|main rehti hoon|mera ghar hai)\b/i.test(
      lower
    )
  ) {
    return {
      category: "personal",
      groupKey: "personal",
      importance: 5,
      content,
    };
  }

  if (/\babhyq\b/i.test(lower)) {
    return {
      category: "project",
      groupKey: "abhyq",
      importance: 5,
      content,
    };
  }

  if (/\bgharvix\b/i.test(lower)) {
    return {
      category: "project",
      groupKey: "gharvix",
      importance: 5,
      content,
    };
  }

  if (
    /\b(i like|i love|i prefer|my favourite|my favorite|mujhe pasand hai|mujhe achha lagta hai|mujhe accha lagta hai|meri pasand|main pasand karta hoon|main pasand karti hoon)\b/i.test(
      lower
    )
  ) {
    return {
      category: "preference",
      groupKey: "preferences",
      importance: 4,
      content,
    };
  }

  if (
    /\b(my goal|my dream|my ambition|i want to become|mera goal|mera sapna|meri ambition|main banna chahta hoon|main banna chahti hoon|i want to build)\b/i.test(
      lower
    )
  ) {
    return {
      category: "goal",
      groupKey: "career-goals",
      importance: 5,
      content,
    };
  }

  if (
    /\b(my business|my startup|my company|mera business|mera startup|mera kaam|i run a business|i own a business|main business karta hoon|main business karti hoon)\b/i.test(
      lower
    )
  ) {
    return {
      category: "work",
      groupKey: "professional-work",
      importance: 5,
      content,
    };
  }

  if (
    /\b(i am learning|i'm learning|i study|i am studying|main seekh raha hoon|main seekh rahi hoon|main padh raha hoon|main padh rahi hoon|i am practicing|i'm practicing)\b/i.test(
      lower
    )
  ) {
    return {
      category: "learning",
      groupKey: "learning",
      importance: 4,
      content,
    };
  }

  if (
    /\b(my project is|i am building|i'm building|i am developing|i'm developing|mera project|main bana raha hoon|main bana rahi hoon|main develop kar raha hoon|main develop kar rahi hoon)\b/i.test(
      lower
    )
  ) {
    return {
      category: "project",
      groupKey: "other-projects",
      importance: 4,
      content,
    };
  }

  if (explicit) {
    return {
      category: "personal",
      groupKey: "personal",
      importance: 4,
      content,
    };
  }

  return null;
}

function detectMemory(text: string): MemoryDetection {
  const clean = cleanText(text);

  if (
    clean.length < 4 ||
    clean.length > 300 ||
    containsSensitiveInformation(clean)
  ) {
    return null;
  }

  const { content, explicit } = removeRememberPrefix(clean);

  if (!content || isQuestion(content)) return null;

  return classifyMemory(content, explicit);
}

async function getMemoryAnswer(
  question: string,
  memories: Memory[]
): Promise<string | null> {
  const q = question.toLowerCase();

  if (
    /(favourite|favorite).*(colour|color|rang)|(colour|color|rang).*(mera|meri|my|what|kya)/i.test(
      q
    )
  ) {
    const memory = memories.find(
      (item) =>
        item.category === "preference" &&
        detectFavoriteColor(item.content) !== null
    );

    if (!memory) {
      return "Tumhara favourite colour abhi meri saved memories mein nahi hai.";
    }

    const color = detectFavoriteColor(memory.content);
    if (!color) return null;

    await markMemoryUsed(memory.id);
    return `Tumhara favourite colour ${color} hai.`;
  }

  if (
    /(mujhe kya kya pasand|mujhe kya pasand|what do i like|what do i love|my interests|meri pasand)/i.test(
      q
    )
  ) {
    const preferences = memories.filter(
      (item) => item.category === "preference" && isUsableMemory(item)
    );

    if (!preferences.length) {
      return "Abhi meri saved memories mein tumhari preferences nahi hain.";
    }

    for (const item of preferences) {
      await markMemoryUsed(item.id);
    }

    return `Mujhe tumhari ye preferences yaad hain:\n\n${preferences
      .map((item, index) => `${index + 1}. ${item.content}`)
      .join("\n")}`;
  }

  if (
    /(mere baare mein|mere bare mein|what do you remember about me|what do you know about me|tumhe mere baare mein kya yaad|about me)/i.test(
      q
    )
  ) {
    const useful = memories.filter(isUsableMemory);

    if (!useful.length) {
      return "Abhi meri permanent memory mein tumhare baare mein koi information saved nahi hai.";
    }

    for (const item of useful) {
      await markMemoryUsed(item.id);
    }

    return `Mujhe tumhare baare mein ye baatein yaad hain:\n\n${useful
      .map((item, index) => `${index + 1}. ${item.content}`)
      .join("\n")}`;
  }

  if (
    /\babhyq\b/i.test(q) &&
    /(project|about|kya hai|batao|samjhao|explain)/i.test(q)
  ) {
    return (
      "ABHYQ ek independent AI assistant project hai, jise Amit Abhyudaya develop kar rahe hain. " +
      "Iska goal users ko questions, coding, learning aur problem-solving mein help karna hai. " +
      "Iski tagline hai: Intelligence Without Limits."
    );
  }

  if (
    /\bgharvix\b/i.test(q) &&
    /(project|about|kya hai|batao|samjhao|explain)/i.test(q)
  ) {
    const projectMemories = memories.filter(
      (item) =>
        isUsableMemory(item) &&
        (item.group_key === "gharvix" ||
          item.content.toLowerCase().includes("gharvix"))
    );

    if (!projectMemories.length) {
      return "Abhi GharVix ke baare mein meri saved memories mein information nahi mili.";
    }

    for (const item of projectMemories) {
      await markMemoryUsed(item.id);
    }

    return `Mujhe GharVix ke baare mein ye baatein yaad hain:\n\n${projectMemories
      .map((item) => `• ${item.content}`)
      .join("\n")}`;
  }

  if (
    /(mera business|my business|what work do i do|main kya kaam karta|main kya kaam karti)/i.test(
      q
    )
  ) {
    const workMemories = memories.filter(
      (item) => item.category === "work" && isUsableMemory(item)
    );

    if (!workMemories.length) {
      return "Abhi tumhare work ya business ke baare mein koi memory saved nahi hai.";
    }

    for (const item of workMemories) {
      await markMemoryUsed(item.id);
    }

    return `Tumhare work ke baare mein mujhe ye yaad hai:\n\n${workMemories
      .map((item) => `• ${item.content}`)
      .join("\n")}`;
  }

  if (
    /(mera goal|my goal|my dream|mera sapna|main kya banna chahta|main kya banna chahti)/i.test(
      q
    )
  ) {
    const goals = memories.filter(
      (item) => item.category === "goal" && isUsableMemory(item)
    );

    if (!goals.length) {
      return "Abhi tumhare goals ke baare mein koi memory saved nahi hai.";
    }

    for (const item of goals) {
      await markMemoryUsed(item.id);
    }

    return `Tumhare goals mujhe yaad hain:\n\n${goals
      .map((item) => `• ${item.content}`)
      .join("\n")}`;
  }

  if (/(yaad|remember|meri memory|my memory|maine kya bataya)/i.test(q)) {
    const relevant = (await searchMemories(question)).filter(isUsableMemory);

    if (!relevant.length) {
      return "Is sawaal se related information meri saved memories mein nahi mili.";
    }

    for (const item of relevant) {
      await markMemoryUsed(item.id);
    }

    return `Mujhe ye baatein yaad hain:\n\n${relevant
      .slice(0, 5)
      .map((item) => `• ${item.content}`)
      .join("\n")}`;
  }

  return null;
}

function getSaveConfirmation(category: string): string {
  const confirmations: Record<string, string> = {
    personal: "Samajh gaya! Maine ye personal information yaad rakh li hai. ✅",
    preference: "Samajh gaya! Maine tumhari preference save kar li hai. ✅",
    project: "Samajh gaya! Maine ye project information save kar li hai. ✅",
    goal: "Bahut badhiya! Maine tumhara goal yaad rakh liya hai. 🎯",
    work: "Samajh gaya! Maine tumhare work/business ki information save kar li hai. ✅",
    learning: "Badhiya! Maine tumhari learning information save kar li hai. 📚",
    general: "Samajh gaya! Maine ye information yaad rakh li hai. ✅",
  };

  return confirmations[category] ?? confirmations.general;
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return Response.json(
        { reply: "GROQ_API_KEY missing hai. .env.local check karo." },
        { status: 500 }
      );
    }

    const body = await request.json();

    const useWebSearch = Boolean(body.webSearch);
    const attachment =
      body.attachment && typeof body.attachment === "object"
        ? (body.attachment as {
            name: string;
            type: "image" | "file";
            content: string;
          })
        : null;

    const messages: ChatMessage[] = Array.isArray(body.messages)
      ? body.messages.filter(
          (item: unknown): item is ChatMessage =>
            typeof item === "object" &&
            item !== null &&
            "role" in item &&
            "content" in item &&
            ((item as ChatMessage).role === "user" ||
              (item as ChatMessage).role === "assistant") &&
            typeof (item as ChatMessage).content === "string"
        )
      : [];

    const lastUserMessage = [...messages]
      .reverse()
      .find((item) => item.role === "user");

    if (!lastUserMessage) {
      return Response.json(
        { reply: "Bhai, apna message dobara bhejo." },
        { status: 400 }
      );
    }

    const question = lastUserMessage.content.trim();

    const conversationId =
      typeof body.conversationId === "string" && body.conversationId.trim()
        ? body.conversationId.trim()
        : null;

    const conversationTitle =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim().slice(0, 100)
        : question.slice(0, 60);

    async function persistConversation(reply: string) {
      if (conversationId) {
        try {
          await saveConversation(conversationId, conversationTitle, [
            ...messages,
            { role: "assistant", content: reply },
          ]);
        } catch (error) {
          console.error("Conversation Save Error:", error);
        }
      }
    }

    async function createChatResponse(
      reply: string,
      extra: Record<string, unknown> = {}
    ) {
      await persistConversation(reply);
      return Response.json({ reply, ...extra });
    }

    const lowerQuestion = question.toLowerCase();

    if (
      !attachment &&
      /^(hi|hello|hey|hii|hiii|namaste)[.! ]*$/i.test(question.trim())
    ) {
      return createChatResponse("Hi bhai! 😊 Batao, kya help chahiye?");
    }

    if (
      /billionaire/i.test(lowerQuestion) &&
      /(roadmap|percentage|percent|skill|skills)/i.test(lowerQuestion) &&
      /(yaad|remember|discuss|decide|pehle|previous|humne)/i.test(lowerQuestion)
    ) {
      const roadmap =
        "Billionaire Roadmap Skill Distribution: 20% Coding Fundamentals, 30% AI & Technology, 30% Business & Sales, 20% Product Building.";

      await saveMemory(roadmap, "learning", {
        groupKey: "billionaire-roadmap",
        importance: 5,
        source: "historical-recall",
      });

      return createChatResponse(
        "Haan bhai! Humne ye roadmap decide kiya tha:\n\n" +
          "• 20% — Coding Fundamentals\n" +
          "• 30% — AI & Technology\n" +
          "• 30% — Business & Sales\n" +
          "• 20% — Product Building"
      );
    }

    const isConversationRecallQuestion =
      /\b(yaad|remember|recall|previous|earlier|pichhli|purani|pehle|last time|history|humne baat)\b/i.test(
        question
      );

    if (
      !useWebSearch &&
      !attachment &&
      /(tumhara naam|tumhara name|your name|who are you|what is your name|tum kaun ho|aap kaun ho)/i.test(
        lowerQuestion
      )
    ) {
      return createChatResponse(
        "Mera naam ABHYQ hai. Main ek independent AI assistant hoon."
      );
    }

    if (
      !useWebSearch &&
      !attachment &&
      /(abhyq|tumhara|tumhare|your)/i.test(lowerQuestion) &&
      /\b(founder|fouder)\b/i.test(lowerQuestion)
    ) {
      return createChatResponse("Amit Abhyudaya ABHYQ ke founder hain.");
    }

    if (
      !useWebSearch &&
      !attachment &&
      /(tumhe kisne|tumhara creator|tumhara maker|who created you|who made you|abhyq.*(kisne|creator|banaya))/i.test(
        lowerQuestion
      )
    ) {
      return createChatResponse(
        "Mujhe Amit Abhyudaya ne create kiya hai. Woh ABHYQ AI platform ke founder hain."
      );
    }

    if (
      !useWebSearch &&
      !attachment &&
      /(tumhara purpose|your purpose|what can you do|tum kya kar sakte ho)/i.test(
        lowerQuestion
      )
    ) {
      return createChatResponse(
        "Mera purpose users ki questions, coding, learning aur problem-solving mein help karna hai. Main ABHYQ hoon — Intelligence Without Limits."
      );
    }

    const detectedMemory = detectMemory(question);
    let memorySaved = false;

    if (
      detectedMemory &&
      !isConversationRecallQuestion &&
      !useWebSearch &&
      !attachment
    ) {
      const saved = await saveMemory(
        detectedMemory.content,
        detectedMemory.category,
        {
          groupKey: detectedMemory.groupKey,
          importance: detectedMemory.importance,
          source: "automatic-conversation",
        }
      );

      memorySaved = Boolean(saved);

      if (memorySaved) {
        return createChatResponse(
          getSaveConfirmation(detectedMemory.category),
          {
            memorySaved: true,
            memoryCategory: detectedMemory.category,
            memoryGroup: detectedMemory.groupKey,
          }
        );
      }
    }

    const savedMemories = (await getAllMemories()).filter(isUsableMemory);

    const memoryAnswer =
      isConversationRecallQuestion || useWebSearch || attachment
        ? null
        : await getMemoryAnswer(question, savedMemories);

    if (memoryAnswer) {
      return createChatResponse(memoryAnswer, { memorySaved });
    }

    let systemPrompt = "";

    // FILE / DOCUMENT / CODE ANALYSIS MODE
    if (attachment && attachment.type === "file") {
      const fileContent = attachment.content.slice(0, 14000);
      systemPrompt = `
You are ABHYQ, an expert AI code and document analyzer.
The user has uploaded a file named "${attachment.name}".
Analyze the file carefully and answer the user's request accurately in clear Hinglish or English (matching the user's language).

UPLOADED FILE (${attachment.name}):
\`\`\`
${fileContent}
\`\`\`

RULES:
1. Base your analysis strictly on the uploaded file content above.
2. If the user asks for fixes, summaries, or explanations, give clear, structured, and actionable answers.
`;
    } else if (useWebSearch) {
      // LIVE WEB SEARCH MODE
      const webSearchContext = await performLiveWebSearch(question);

      if (webSearchContext === "NO_RESULTS_FOUND") {
        return createChatResponse(
          "Mujhe is topic par abhi live web search se exact results nahi mile. Thoda alag keyword likh kar dobara try karo."
        );
      }

      systemPrompt = `
You are ABHYQ, an AI assistant answering a live web search query.
Answer the user's question directly, accurately, and naturally in clear Hinglish or English (matching the user's language).

LIVE WEB SEARCH RESULTS:
${webSearchContext}

RULES:
1. Base your answer strictly on the LIVE WEB SEARCH RESULTS above.
2. Do NOT mention ABHYQ's founder, user memories, or saved database—answer ONLY about the topic the user asked.
3. Keep the answer concise, factual, and easy to read.
`;
    } else {
      // STANDARD MEMORY & ASSISTANT MODE
      const relevantMemories = (await searchMemories(question)).filter(
        isUsableMemory
      );

      const previousConversationMessages = await searchConversationHistory(
        question,
        conversationId,
        8
      );

      const conversationHistoryContext =
        previousConversationMessages.length > 0
          ? previousConversationMessages
              .map(
                (item, index) =>
                  `${index + 1}. Conversation: "${item.conversation_title}"\n` +
                  `Role: ${item.role}\n` +
                  `Historical message: ${item.content.slice(0, 1200)}`
              )
              .join("\n\n")
          : "No relevant previous conversations found.";

      for (const item of relevantMemories) {
        await markMemoryUsed(item.id);
      }

      let identityKnowledge = "";

      try {
        const knowledgePath = path.join(
          process.cwd(),
          "app",
          "api",
          "chat",
          "knowledge",
          "abhyq-identity.txt"
        );

        identityKnowledge = await readFile(knowledgePath, "utf8");
      } catch {
        identityKnowledge = "ABHYQ is an independent AI assistant.";
      }

      const memoryContext =
        relevantMemories.length > 0
          ? relevantMemories
              .slice(0, 8)
              .map(
                (item) =>
                  `- [${item.category}] [${item.group_key || "general"}] ${item.content}`
              )
              .join("\n")
          : "No directly relevant personal memories found.";

      systemPrompt = `
You are ABHYQ, an independent AI assistant.
Tagline: Intelligence Without Limits.

IDENTITY & KNOWLEDGE:
- Name: ABHYQ.
- Creator and Founder: Amit Abhyudaya.
- Underlying Info: ${identityKnowledge}

PERSONALITY & COMMUNICATION:
- Friendly, intelligent, professional, and clear.
- Match the user's language (Hindi, English, or Hinglish).
- For Roman Hindi: Reply in natural, conversational Roman Hindi (avoid broken or unnatural Hindi).
- Structure complex explanations with bullet points, numbered steps, or clear headings where appropriate.
- Provide clean, well-formatted Markdown for code snippets, math formulas, or lists.

STRICT SYSTEM RULES:
1. Role Clarity: Tum ABHYQ AI assistant ho aur user (Amit Abhyudaya) tumhara creator hai—kabhi khud ko user mat samajhna, aur natural Hinglish/English mein jawab do (tooti-phooti Hindi mat likho).
2. Tech Accuracy: Coding mein modern standards follow karo—jaise Next.js ke liye hamesha App Router (app/api/[name]/route.ts with NextResponse / Response.json) use karo, kabhi pages/api ya Express mat batao.
   When writing Next.js API routes, NEVER use pages/api or express. Always use this exact App Router pattern:
   // app/api/example/route.ts
   import { NextResponse } from 'next/server';
   export async function GET() { return NextResponse.json({ message: 'Hello' }); }

MEMORY & HISTORICAL RECALL RULES (STRICT):
1. RELEVANT USER MEMORIES and RELEVANT PAST CONVERSATIONS are your only source of truth for the user's personal details and past discussions.
2. If the user asks about a past fact, name, date, percentage, or decision, you MUST find the exact detail in the context below.
3. If the information is NOT present in the provided context, you MUST say: "Mujhe saved memories ya past conversations mein yeh exact detail nahi mili."
4. NEVER hallucinate, guess, or "infer" past information that isn't explicitly stated.
5. If memories or history are found, use the exact facts and percentages (e.g., "30% AI & Technology").

RELEVANT USER MEMORIES:
${memoryContext}

RELEVANT PAST CONVERSATIONS:
${conversationHistoryContext}

STRICT ANTI-HALLUCINATION: Do not invent facts. If the detail is missing from the sections above, state that clearly in Hinglish.
`;
    }

    const conversation = messages.slice(-10).map((item) => ({
      role: item.role,
      content: item.content,
    }));

    const groqMessages: Array<Record<string, unknown>> = [
      { role: "system", content: systemPrompt },
      ...conversation,
    ];

    if (attachment && attachment.type === "image") {
      const lastIdx = groqMessages.length - 1;
      groqMessages[lastIdx] = {
        role: "user",
        content: [
          {
            type: "text",
            text: question || "Describe everything visible in this image clearly and accurately.",
          },
          {
            type: "image_url",
            image_url: { url: attachment.content },
          },
        ],
      };
    }

    const modelToUse =
      attachment && attachment.type === "image"
        ? "qwen/qwen3.8-27b"
        : "openai/gpt-oss-120b";

    console.log("ABHYQ SOURCE -> GROQ CLOUD | MODEL:", modelToUse);

    // REAL-TIME STREAMING FROM GROQ CLOUD
    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelToUse,
          stream: true,
          temperature: 0.4,
          max_tokens: 1024,
          messages: groqMessages,
        }),
        signal: AbortSignal.timeout(60000),
      }
    );

    if (!groqResponse.ok || !groqResponse.body) {
      const errDetail = await groqResponse.text();
      console.error("Groq API Failed:", groqResponse.status, errDetail);
      return Response.json(
        { reply: `Groq Error (${groqResponse.status}): ${errDetail.slice(0, 180)}` },
        { status: 503 }
      );
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const reader = groqResponse.body.getReader();

    const stream = new ReadableStream({
      async start(controller) {
        let fullReply = "";
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const dataStr = trimmed.slice(5).trim();
              if (dataStr === "[DONE]") continue;

              try {
                const parsed = JSON.parse(dataStr);
                const token = parsed?.choices?.[0]?.delta?.content || "";
                if (token) {
                  fullReply += token;
                  controller.enqueue(encoder.encode(token));
                }
              } catch {
                // ignore partial JSON chunk
              }
            }
          }

          if (!fullReply.trim()) {
            const fallback =
              "Mujhe iska jawab generate karne mein dikkat hui. Dobara try karo.";
            fullReply = fallback;
            controller.enqueue(encoder.encode(fallback));
          }

          await persistConversation(fullReply.trim());
          controller.close();
        } catch (err) {
          console.error("Stream Error:", err);
          if (fullReply.trim()) {
            await persistConversation(fullReply.trim());
          }
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("ABHYQ AI Error:", error);

    return Response.json(
      {
        reply:
          "Sorry bhai, ABHYQ mein abhi technical problem aa gayi hai. Thodi der baad dobara try karo.",
      },
      { status: 500 }
    );
  }
}