(function initChatGPTExtractor(global) {
  "use strict";

  const STREAM_RE = /streamController\.enqueue\((\"(?:\\.|[^\"\\])*\")\)/gs;
  const SHARE_RE = /\/share\/([0-9a-fA-F-]{20,})/;
  const CHATGPT_CITE_RE = /cite(.*?)/g;
  const CHATGPT_ENTITY_RE = /entity(.*?)/g;
  const CHATGPT_MARKER_RE = /([^]*)/g;

  const UNDEFINED = Symbol("UNDEFINED");
  const IN_PROGRESS = Symbol("IN_PROGRESS");

  function parseStreamArrays(pageHtml) {
    const arrays = [];
    let match;
    while ((match = STREAM_RE.exec(pageHtml)) !== null) {
      try {
        const streamText = JSON.parse(match[1]);
        if (!streamText) continue;

        const candidates = [streamText];
        if (streamText.includes(":") && !streamText.trimStart().startsWith("[")) {
          candidates.push(streamText.substring(streamText.indexOf(":") + 1));
        }

        for (let candidate of candidates) {
          candidate = candidate.trim();
          if (!candidate.startsWith("[")) continue;
          try {
            const parsed = JSON.parse(candidate);
            if (Array.isArray(parsed)) {
              arrays.push(parsed);
              break;
            }
          } catch (e) {
            // ignore JSON parse errors for candidates
          }
        }
      } catch (e) {
        // ignore outer JSON parse error
      }
    }
    return arrays;
  }

  function hydrate(compact) {
    const memo = new Map();

    function value(item) {
      if (typeof item === "number") {
        if (item < 0) return UNDEFINED;
        if (item >= compact.length) return item;
        return index(item);
      }
      if (Array.isArray(item)) {
        const output = [];
        for (const child of item) {
          const hydrated = value(child);
          if (hydrated !== UNDEFINED) output.push(hydrated);
        }
        return output;
      }
      if (item && typeof item === "object") {
        const output = {};
        for (const [key, child] of Object.entries(item)) {
          let hydratedKey = key;
          if (typeof key === "string" && key.startsWith("_") && /^\_\d+$/.test(key)) {
            const num = parseInt(key.substring(1), 10);
            hydratedKey = value(num);
          }
          const hydratedChild = value(child);
          if (hydratedKey !== UNDEFINED && hydratedChild !== UNDEFINED) {
            output[hydratedKey] = hydratedChild;
          }
        }
        return output;
      }
      return item;
    }

    function index(i) {
      if (memo.has(i)) {
        const val = memo.get(i);
        return val === IN_PROGRESS ? null : val;
      }
      memo.set(i, IN_PROGRESS);
      const hydrated = value(compact[i]);
      memo.set(i, hydrated);
      return hydrated;
    }

    return index(0);
  }

  function findConversationRoot(arrays) {
    for (const compact of arrays) {
      try {
        const root = hydrate(compact);
        if (!root || typeof root !== "object") continue;
        const loader = root.loaderData;
        if (!loader || typeof loader !== "object") continue;
        for (const val of Object.values(loader)) {
          if (val && typeof val === "object" && "serverResponse" in val) {
            return { route: val, compact };
          }
        }
      } catch (e) {
        continue;
      }
    }
    throw new Error("Could not find ChatGPT share serverResponse in streamed payload");
  }

  function extractText(content) {
    if (!content || typeof content !== "object") return "";
    const parts = content.parts || [];
    const texts = [];
    for (const part of parts) {
      if (typeof part === "string") {
        texts.push(part);
      } else if (part && typeof part === "object") {
        if (typeof part.text === "string") texts.push(part.text);
        else if (typeof part.content === "string") texts.push(part.content);
      }
    }
    return texts.join("\n").trim();
  }

  function normalizeChatgptMarkers(text) {
    text = text.replace(CHATGPT_ENTITY_RE, (match, p1) => {
      try {
        const parsed = JSON.parse(p1);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return String(parsed.length > 1 ? parsed[1] : parsed[0]);
        }
        if (parsed && typeof parsed === "object") {
          return String(parsed.name || parsed.title || "");
        }
      } catch (e) {}
      return "";
    });
    
    text = text.replace(CHATGPT_CITE_RE, (match, p1) => {
      const refs = p1.split("").filter(Boolean);
      if (!refs.length) return "";
      return ` [citation: ${refs.join(", ")}]`;
    });
    
    text = text.replace(CHATGPT_MARKER_RE, "");
    text = text.replace(/[ \t]+(\n)/g, "$1");
    text = text.replace(/ {2,}/g, " ");
    return text.trim();
  }

  function extractConversation(pageHtml, sourceUrl = "") {
    const arrays = parseStreamArrays(pageHtml);
    if (!arrays.length) throw new Error("No streamController.enqueue JSON arrays found");

    const { route, compact } = findConversationRoot(arrays);
    const serverResponse = route.serverResponse || {};
    const data = serverResponse.data || {};
    const linear = data.linear_conversation || [];

    const messages = [];
    const visible = [];

    let idx = 1;
    for (const node of linear) {
      if (!node || typeof node !== "object") continue;
      const message = node.message || {};
      const author = message.author || {};
      const content = message.content || {};
      const text = extractText(content);
      
      const item = {
        turnIndex: idx++,
        role: author.role,
        text: text
      };
      messages.push(item);
      
      if (text && (item.role === "user" || item.role === "assistant")) {
        visible.push({
          role: item.role,
          text: normalizeChatgptMarkers(text)
        });
      }
    }

    let shareId = route.sharedConversationId;
    if (!shareId) {
      const match = SHARE_RE.exec(sourceUrl);
      if (match) shareId = match[1];
    }

    return {
      title: data.title || (route.meta && route.meta.pageTitle) || "Untitled Conversation",
      visibleMessages: visible,
      shareId: shareId
    };
  }

  // --- Heuristic Analysis to build specAnswers ---

  function analyzeTranscript(conversation) {
    const textCorpus = conversation.visibleMessages.map(m => m.text).join("\n\n");
    const lowerCorpus = textCorpus.toLowerCase();
    
    const specAnswers = {
      name: conversation.title,
      description: "",
      archetype: "web-app",
      scale: "hobby",
      features: "",
      frontend: "None",
      backend: "None",
      database: "None",
      hosting: "Vercel",
      featureChips: []
    };

    // 1. Description
    const firstUserMsg = conversation.visibleMessages.find(m => m.role === "user");
    if (firstUserMsg) {
      const desc = firstUserMsg.text.substring(0, 150).replace(/\n/g, " ").trim();
      specAnswers.description = desc + (desc.length === 150 ? "..." : "");
    }

    // 2. Archetype detection
    if (/(ios|android|react native|flutter|mobile app)/i.test(lowerCorpus)) specAnswers.archetype = "mobile-app";
    else if (/(saas|subscription|multi-tenant)/i.test(lowerCorpus)) specAnswers.archetype = "saas";
    else if (/(e-commerce|shopping cart|shopify|stripe checkout)/i.test(lowerCorpus)) specAnswers.archetype = "e-commerce";
    else if (/(dashboard|admin panel|charts|graphs)/i.test(lowerCorpus)) specAnswers.archetype = "dashboard";
    else if (/(ai agent|swarm|langchain|llm orchestration)/i.test(lowerCorpus)) specAnswers.archetype = "agent-swarm";
    else if (/(ai|machine learning|llm|chatgpt clone|rag)/i.test(lowerCorpus)) specAnswers.archetype = "ai-ml-app";
    else if (/(game|canvas|webgl)/i.test(lowerCorpus)) specAnswers.archetype = "game";
    else if (/(api service|microservice|rest api)/i.test(lowerCorpus)) specAnswers.archetype = "api-service";

    // 3. Scale detection
    if (/(enterprise|sso|saml|hipaa|soc2|rbac)/i.test(lowerCorpus)) specAnswers.scale = "enterprise";
    else if (/(production|ci\/cd|load balancing|kubernetes)/i.test(lowerCorpus)) specAnswers.scale = "production";
    else if (/(startup|scalable)/i.test(lowerCorpus)) specAnswers.scale = "startup";
    else if (/(mvp|prototype)/i.test(lowerCorpus)) specAnswers.scale = "mvp";

    // 4. Tech Stack Extraction
    // Frontend
    if (/next\.js|nextjs/i.test(lowerCorpus)) specAnswers.frontend = "Next.js 14 App Router";
    else if (/react/i.test(lowerCorpus)) specAnswers.frontend = "React";
    else if (/vue/i.test(lowerCorpus)) specAnswers.frontend = "Vue.js";
    else if (/svelte/i.test(lowerCorpus)) specAnswers.frontend = "Svelte";
    else if (/astro/i.test(lowerCorpus)) specAnswers.frontend = "Astro";
    else if (/angular/i.test(lowerCorpus)) specAnswers.frontend = "Angular";
    
    // Backend
    if (/fastapi|python/i.test(lowerCorpus)) specAnswers.backend = "Python + FastAPI";
    else if (/express|node\.js|nodejs/i.test(lowerCorpus)) specAnswers.backend = "Node.js + Express";
    else if (/nestjs/i.test(lowerCorpus)) specAnswers.backend = "Node.js + NestJS";
    else if (/django/i.test(lowerCorpus)) specAnswers.backend = "Python + Django";
    else if (/supabase/i.test(lowerCorpus)) specAnswers.backend = "Supabase";
    else if (/firebase/i.test(lowerCorpus)) specAnswers.backend = "Firebase";
    else if (/spring boot|java/i.test(lowerCorpus)) specAnswers.backend = "Java Spring Boot";
    else if (/go|golang/i.test(lowerCorpus)) specAnswers.backend = "Go";
    
    // Database
    if (/postgres|postgresql/i.test(lowerCorpus)) specAnswers.database = "PostgreSQL";
    if (/pgvector/i.test(lowerCorpus)) specAnswers.database = "PostgreSQL (pgvector)";
    else if (/mongodb|mongo/i.test(lowerCorpus)) specAnswers.database = "MongoDB";
    else if (/mysql/i.test(lowerCorpus)) specAnswers.database = "MySQL";
    else if (/redis/i.test(lowerCorpus)) specAnswers.database = "Redis";
    else if (/firestore/i.test(lowerCorpus)) specAnswers.database = "Firestore";
    else if (/sqlite/i.test(lowerCorpus)) specAnswers.database = "SQLite";

    // Design
    if (/dark mode/i.test(lowerCorpus)) specAnswers.darkMode = true;
    if (/mobile first|responsive/i.test(lowerCorpus)) specAnswers.mobileFirst = true;

    // 5. Feature extraction (simple heuristic: look for bullet lists in assistant responses)
    const assistantMessages = conversation.visibleMessages.filter(m => m.role === "assistant");
    const features = [];
    for (const msg of assistantMessages) {
      const lines = msg.text.split("\n");
      for (const line of lines) {
        if (/^[-*]\s+(.*)/.test(line)) {
          const feature = line.replace(/^[-*]\s+/, "").replace(/\*\*/g, "").trim();
          if (feature.length > 5 && feature.length < 100) {
             features.push(feature);
          }
        }
      }
    }
    
    // Deduplicate and limit to 10 key features to avoid overflowing the textarea
    const uniqueFeatures = [...new Set(features)].slice(0, 10);
    specAnswers.features = uniqueFeatures.map(f => "- " + f).join("\n");
    if (!specAnswers.features) {
      specAnswers.features = "Extracted from ChatGPT: No clear bulleted features detected. Please review the conversation.";
    }

    return specAnswers;
  }

  const api = {
    extractConversation,
    analyzeTranscript,
    normalizeChatgptMarkers
  };

  global.AISQChatGPTExtractor = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

})(typeof globalThis !== "undefined" ? globalThis : this);
