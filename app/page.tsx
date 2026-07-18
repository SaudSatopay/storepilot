"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowUpRight,
  CalendarDays,
  CircleAlert,
  Clipboard,
  Database,
  LoaderCircle,
  MessageSquare,
  PackageCheck,
  RefreshCcw,
  Send,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

type BriefItem = {
  type: "summary" | "stockout" | "anomaly" | "opportunity";
  title: string;
  body: string;
  severity: "low" | "medium" | "high";
  metric: string;
};

type ChatRole = "manager" | "pilot";

type ChatMessage = {
  id: string;
  role: ChatRole;
  body: string;
  evidence: EvidenceGroup[];
  state?: "idle" | "streaming" | "error";
};

type EvidenceGroup = {
  toolName: string;
  label: string;
  chips: string[];
};

type ChatStreamEvent =
  | { type: "status"; message: string }
  | { type: "evidence"; toolName: string; label: string; chips: string[] }
  | { type: "delta"; text: string }
  | { type: "done"; fallback?: boolean }
  | { type: "error"; message: string };

type HealthResponse = {
  status: "ok" | "error";
  counts?: {
    products: number;
    sales: number;
  };
  salesDays?: number;
  message?: string;
};

type ActionId = "send" | "reorder" | "promo";

const briefItems: BriefItem[] = [
  {
    type: "summary",
    title: "Sales beat the weekday trend",
    body: "Yesterday closed 12% above the 30-day weekday average, led by accessories and laptop chargers.",
    severity: "low",
    metric: "+12%",
  },
  {
    type: "stockout",
    title: "USB-C chargers need a reorder",
    body: "At the current 7-day velocity, Galaxy USB-C chargers will run out by Friday.",
    severity: "high",
    metric: "3 days",
  },
  {
    type: "anomaly",
    title: "Accessory spike needs a quick check",
    body: "Thursday accessory sales were 42% above the recent trend. Check whether a local bulk buyer drove the jump.",
    severity: "medium",
    metric: "+42%",
  },
  {
    type: "opportunity",
    title: "Bundle slow wireless mice",
    body: "Wireless mice are down 18% week over week while keyboard stock is healthy. Test a weekend bundle.",
    severity: "medium",
    metric: "-18%",
  },
];

const initialMessages: ChatMessage[] = [
  {
    id: "initial-manager",
    role: "manager",
    body: "What needs my attention today?",
    evidence: [],
  },
  {
    id: "initial-pilot",
    role: "pilot",
    body: "Three things: reorder USB-C chargers, inspect the accessory spike, and move slow wireless mice with a weekend bundle. I used current stock, 7-day velocity, and 90 days of demo sales.",
    evidence: [
      {
        toolName: "mock",
        label: "Demo evidence",
        chips: [
          "USB-C Chargers: 14 in stock",
          "7-day velocity: 5.1 per day",
          "Accessory sales: +42% vs trend",
        ],
      },
    ],
  },
];

const severityTone = {
  low: {
    accent: "bg-emerald-500",
    icon: "bg-emerald-50 text-emerald-700",
    metric: "bg-emerald-50 text-emerald-800",
    priority: "text-emerald-800",
  },
  medium: {
    accent: "bg-amber-500",
    icon: "bg-amber-50 text-amber-700",
    metric: "bg-amber-50 text-amber-800",
    priority: "text-amber-800",
  },
  high: {
    accent: "bg-rose-500",
    icon: "bg-rose-50 text-rose-700",
    metric: "bg-rose-50 text-rose-800",
    priority: "text-rose-800",
  },
} satisfies Record<BriefItem["severity"], Record<string, string>>;

const typeIcons = {
  summary: TrendingUp,
  stockout: PackageCheck,
  anomaly: CircleAlert,
  opportunity: Sparkles,
} satisfies Record<BriefItem["type"], typeof TrendingUp>;

const actionCards = [
  {
    id: "reorder",
    title: "Draft reorder",
    body: "Message suppliers for the products most likely to run out this week.",
    question: "Draft a reorder message for the products about to stock out this week",
    Icon: Clipboard,
    ToneIcon: ArrowUpRight,
    buttonClass: "bg-[#1b6b4a] text-white hover:bg-[#15573c]",
  },
  {
    id: "promo",
    title: "Draft promo",
    body: "Create weekend copy for slow movers with healthy stock.",
    question: "Draft a weekend promo for my slow movers",
    Icon: Sparkles,
    ToneIcon: TrendingDown,
    buttonClass: "bg-[#17211b] text-white hover:bg-[#26372e]",
  },
] satisfies Array<{
  id: Exclude<ActionId, "send">;
  title: string;
  body: string;
  question: string;
  Icon: typeof Clipboard;
  ToneIcon: typeof ArrowUpRight;
  buttonClass: string;
}>;

const numberFormat = new Intl.NumberFormat("en-US");
const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-[#1b6b4a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f4f6f1]";

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("What should I reorder this week?");
  const [status, setStatus] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeAction, setActiveAction] = useState<ActionId | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [isBriefReady, setIsBriefReady] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const briefTimerRef = useRef<number | null>(null);

  const currentDate = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      }).format(new Date()),
    [],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadHealth() {
      try {
        const response = await fetch("/api/health", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Data check failed");
        }

        const payload = (await response.json()) as HealthResponse;
        setHealth(payload);
      } catch (error) {
        if (!controller.signal.aborted) {
          setHealthError(
            error instanceof Error ? error.message : "Data check failed",
          );
        }
      }
    }

    loadHealth();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    startBriefReveal();

    return () => {
      if (briefTimerRef.current) {
        window.clearTimeout(briefTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const scrollArea = chatScrollRef.current;

    if (!scrollArea) {
      return;
    }

    scrollArea.scrollTop = scrollArea.scrollHeight;
  }, [messages, status, isStreaming]);

  function startBriefReveal() {
    if (briefTimerRef.current) {
      window.clearTimeout(briefTimerRef.current);
    }

    setIsBriefReady(false);
    briefTimerRef.current = window.setTimeout(() => {
      setIsBriefReady(true);
    }, 180);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitQuestion(input, "send");
  }

  async function submitQuestion(question: string, action: ActionId = "send") {
    const trimmedQuestion = question.trim();

    if (!trimmedQuestion || isStreaming) {
      return;
    }

    const userMessage: ChatMessage = {
      id: createMessageId("manager"),
      role: "manager",
      body: trimmedQuestion,
      evidence: [],
    };
    const assistantMessage: ChatMessage = {
      id: createMessageId("pilot"),
      role: "pilot",
      body: "",
      evidence: [],
      state: "streaming",
    };
    const nextMessages = [...messages, userMessage, assistantMessage];
    const requestMessages = [...messages, userMessage]
      .filter((message) => message.body.trim().length > 0)
      .slice(-10)
      .map((message) => ({
        role: message.role === "manager" ? "user" : "assistant",
        content: message.body,
      }));

    setMessages(nextMessages);
    setInput("");
    setStatus("Opening StorePilot tools");
    setIsStreaming(true);
    setActiveAction(action);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: requestMessages }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Chat request failed.");
      }

      await readChatStream(response.body, assistantMessage.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "StorePilot could not answer.";
      setStatus(null);
      appendAssistantText(assistantMessage.id, message);
      finishAssistantTurn(assistantMessage.id, "error");
    } finally {
      finishAssistantTurn(assistantMessage.id, "idle");
      setIsStreaming(false);
      setActiveAction(null);
    }
  }

  async function readChatStream(
    body: ReadableStream<Uint8Array>,
    assistantId: string,
  ) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        const shouldStop = handleStreamEvent(
          JSON.parse(line) as ChatStreamEvent,
          assistantId,
        );

        if (shouldStop) {
          await reader.cancel().catch(() => undefined);
          return;
        }
      }
    }

    if (buffer.trim()) {
      handleStreamEvent(JSON.parse(buffer) as ChatStreamEvent, assistantId);
    }
  }

  function handleStreamEvent(event: ChatStreamEvent, assistantId: string) {
    if (event.type === "status") {
      setStatus(event.message);
      return false;
    }

    if (event.type === "evidence") {
      attachEvidence(assistantId, {
        toolName: event.toolName,
        label: event.label,
        chips: event.chips,
      });
      return false;
    }

    if (event.type === "delta") {
      setStatus(null);
      appendAssistantText(assistantId, event.text);
      return false;
    }

    if (event.type === "error") {
      setStatus(null);
      appendAssistantText(assistantId, event.message);
      finishAssistantTurn(assistantId, "error");
      setIsStreaming(false);
      setActiveAction(null);
      return true;
    }

    if (event.type === "done") {
      setStatus(null);
      finishAssistantTurn(assistantId, "idle");
      setIsStreaming(false);
      setActiveAction(null);
      return true;
    }

    return false;
  }

  function appendAssistantText(assistantId: string, text: string) {
    setMessages((current) =>
      current.map((message) =>
        message.id === assistantId
          ? {
              ...message,
              body: `${message.body}${text}`,
            }
          : message,
      ),
    );
  }

  function attachEvidence(assistantId: string, group: EvidenceGroup) {
    setMessages((current) =>
      current.map((message) =>
        message.id === assistantId
          ? {
              ...message,
              evidence: [...message.evidence, group],
            }
          : message,
      ),
    );
  }

  function finishAssistantTurn(
    assistantId: string,
    state: NonNullable<ChatMessage["state"]>,
  ) {
    setMessages((current) =>
      current.map((message) =>
        message.id === assistantId
          ? {
              ...message,
              state: message.state === "error" ? "error" : state,
            }
          : message,
      ),
    );
  }

  function scrollToHistoryStart() {
    chatScrollRef.current?.scrollTo({ top: 0 });
  }

  const healthLabel = formatHealthLabel(health, healthError);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f4f6f1] text-[#17211b]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col gap-4 px-4 py-4 sm:px-6">
        <header className="flex flex-col gap-4 border-b border-[#d7ded5] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#17211b] text-sm font-bold text-white">
              SP
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold leading-6 text-[#17211b]">
                StorePilot
              </h1>
              <p className="mt-1 text-sm leading-5 text-[#526057]">
                Daily operations desk
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d7ded5] bg-white px-3 text-sm font-medium text-[#34443a]">
              <CalendarDays className="h-4 w-4 text-[#1b6b4a]" />
              {currentDate}
            </span>
            <span
              aria-live="polite"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d7ded5] bg-white px-3 text-sm font-medium tabular-nums text-[#34443a]"
            >
              <Database className="h-4 w-4 text-[#1b6b4a]" />
              {healthLabel}
            </span>
            <button
              className={`inline-flex h-10 items-center gap-2 rounded-lg bg-[#1b6b4a] px-3 text-sm font-semibold text-white transition hover:bg-[#15573c] active:translate-y-px disabled:cursor-not-allowed disabled:bg-[#90a399] ${focusRing}`}
              onClick={startBriefReveal}
              title="Regenerate morning brief"
              type="button"
            >
              <RefreshCcw className="h-4 w-4" />
              Regenerate
            </button>
          </div>
        </header>

        <section className="grid min-w-0 flex-1 gap-4 lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
          <aside className="flex min-h-[620px] min-w-0 flex-col rounded-lg border border-[#d7ded5] bg-white shadow-resting lg:min-h-[calc(100vh-112px)]">
            <div className="border-b border-[#d7ded5] px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase leading-4 text-[#66736b]">
                    Morning Brief
                  </p>
                  <h2 className="mt-1 text-[28px] font-semibold leading-8 text-[#17211b]">
                    Generated for today
                  </h2>
                </div>
                <div className="rounded-lg border border-[#d7ded5] px-3 py-2 text-right shadow-resting">
                  <p className="text-xs leading-4 text-[#66736b]">Priority</p>
                  <p className="mt-1 text-sm font-semibold leading-5 tabular-nums text-[#9f1239]">
                    High
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 p-4">
              {isBriefReady
                ? briefItems.map((item, index) => (
                    <BriefCard item={item} index={index} key={item.title} />
                  ))
                : Array.from({ length: 4 }).map((_, index) => (
                    <BriefSkeleton index={index} key={index} />
                  ))}
            </div>
          </aside>

          <section className="flex h-[720px] min-w-0 flex-col rounded-lg border border-[#d7ded5] bg-white shadow-resting lg:h-auto lg:min-h-[calc(100vh-112px)]">
            <div className="flex items-center justify-between gap-3 border-b border-[#d7ded5] px-4 py-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase leading-4 text-[#66736b]">
                  Chat
                </p>
                <h2 className="mt-1 text-[28px] font-semibold leading-8 text-[#17211b]">
                  Ask StorePilot
                </h2>
              </div>
              <button
                className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-[#d7ded5] px-3 text-sm font-semibold text-[#34443a] transition hover:bg-[#eef3ee] active:translate-y-px ${focusRing}`}
                onClick={scrollToHistoryStart}
                title="Jump to chat history"
                type="button"
              >
                <MessageSquare className="h-4 w-4" />
                History
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
              <div
                aria-busy={isStreaming}
                aria-live="polite"
                className="min-h-[280px] flex-1 overflow-y-auto pr-1"
                ref={chatScrollRef}
              >
                <div className="grid gap-4">
                  {messages.length > 0 ? (
                    messages.map((message, index) => (
                      <ChatBubble
                        isActiveStreaming={
                          isStreaming &&
                          message.state === "streaming" &&
                          index === messages.length - 1
                        }
                        key={message.id}
                        message={message}
                        status={status}
                      />
                    ))
                  ) : (
                    <div className="rounded-lg border border-[#d7ded5] bg-[#fbfcfa] p-6 text-center shadow-resting">
                      <p className="text-base font-semibold leading-6 text-[#17211b]">
                        Ask about stock, sales, suppliers, or promos.
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[#526057]">
                        StorePilot will answer with the numbers behind the call.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  {actionCards.map((card) => (
                    <ActionCard
                      activeAction={activeAction}
                      card={card}
                      isStreaming={isStreaming}
                      key={card.id}
                      onSubmit={submitQuestion}
                    />
                  ))}
                </div>

                <form className="flex min-w-0 gap-2" onSubmit={handleSubmit}>
                  <label className="sr-only" htmlFor="chat-input">
                    Ask StorePilot
                  </label>
                  <input
                    className={`h-11 min-w-0 flex-1 rounded-lg border border-[#d7ded5] bg-white px-3 text-sm leading-5 text-[#17211b] transition placeholder:text-[#66736b] disabled:cursor-not-allowed disabled:bg-[#f4f6f1] ${focusRing}`}
                    disabled={isStreaming}
                    id="chat-input"
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="Ask StorePilot"
                    type="text"
                    value={input}
                  />
                  <button
                    className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#1b6b4a] text-white transition hover:bg-[#15573c] active:translate-y-px disabled:cursor-not-allowed disabled:bg-[#90a399] ${focusRing}`}
                    disabled={isStreaming || input.trim().length === 0}
                    title="Send message"
                    type="submit"
                  >
                    {isStreaming ? (
                      <LoaderCircle className="h-4 w-4 spin-icon" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </form>
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function BriefCard({ item, index }: { item: BriefItem; index: number }) {
  const Icon = typeIcons[item.type];
  const tone = severityTone[item.severity];

  return (
    <article
      className="brief-card-in hover-lift relative min-h-[132px] overflow-hidden rounded-lg border border-[#d7ded5] bg-[#fbfcfa] p-4 pl-5 shadow-resting"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className={`absolute left-0 top-0 h-full w-[3px] ${tone.accent}`} />
      <div className="flex items-start gap-3">
        <div
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tone.icon}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-semibold leading-6 text-[#17211b]">
              {item.title}
            </h3>
            <span
              className={`ml-auto shrink-0 rounded-lg px-2 py-1 text-xs font-semibold leading-4 tabular-nums ${tone.metric}`}
            >
              {item.metric}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-[#526057]">{item.body}</p>
        </div>
      </div>
    </article>
  );
}

function BriefSkeleton({ index }: { index: number }) {
  return (
    <article
      aria-hidden="true"
      className="brief-card-in min-h-[132px] rounded-lg border border-[#d7ded5] bg-[#fbfcfa] p-4 shadow-resting"
      style={{ animationDelay: `${index * 55}ms` }}
    >
      <div className="flex items-start gap-3">
        <div className="skeleton-shimmer h-9 w-9 shrink-0 rounded-lg" />
        <div className="grid flex-1 gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="skeleton-shimmer h-5 w-3/5 rounded-lg" />
            <div className="skeleton-shimmer h-6 w-16 rounded-lg" />
          </div>
          <div className="skeleton-shimmer h-4 w-full rounded-lg" />
          <div className="skeleton-shimmer h-4 w-4/5 rounded-lg" />
        </div>
      </div>
    </article>
  );
}

function ChatBubble({
  message,
  isActiveStreaming,
  status,
}: {
  message: ChatMessage;
  isActiveStreaming: boolean;
  status: string | null;
}) {
  const isManager = message.role === "manager";
  const hasEvidence = message.evidence.some((group) => group.chips.length > 0);

  return (
    <div className={`flex ${isManager ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex max-w-[min(92%,44rem)] flex-col gap-1 ${
          isManager ? "items-end" : "items-start"
        }`}
      >
        <span className="px-1 text-xs font-semibold uppercase leading-4 text-[#66736b]">
          {isManager ? "You" : "StorePilot"}
        </span>
        <div
          className={`min-h-12 rounded-lg px-4 py-3 text-sm leading-6 shadow-resting ${
            isManager
              ? "bg-[#17211b] text-white"
              : "border border-[#d7ded5] bg-[#fbfcfa] text-[#34443a]"
          }`}
        >
          {message.body ? (
            <span className="whitespace-pre-wrap">{message.body}</span>
          ) : null}
          {isActiveStreaming && message.body ? (
            <span aria-hidden="true" className="stream-caret" />
          ) : null}
          {isActiveStreaming && status && !message.body ? (
            <div className="grid gap-2">
              <span className="sr-only">{status}</span>
              <div className="shimmer-line h-3 w-40 rounded-lg" />
              <div className="shimmer-line h-3 w-28 rounded-lg" />
            </div>
          ) : null}
          {hasEvidence ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {message.evidence.flatMap((group) =>
                group.chips.map((chip, chipIndex) => (
                  <span
                    className="evidence-chip rounded-lg border border-[#d7ded5] bg-[#eef3ee] px-2 py-1 text-xs font-medium leading-4 tabular-nums text-[#34443a]"
                    key={`${message.id}-${group.toolName}-${chip}`}
                    style={{ animationDelay: `${chipIndex * 55}ms` }}
                    title={group.label}
                  >
                    {chip}
                  </span>
                )),
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ActionCard({
  card,
  isStreaming,
  activeAction,
  onSubmit,
}: {
  card: (typeof actionCards)[number];
  isStreaming: boolean;
  activeAction: ActionId | null;
  onSubmit: (question: string, action: ActionId) => Promise<void>;
}) {
  const isActive = activeAction === card.id;
  const Icon = card.Icon;
  const ToneIcon = card.ToneIcon;

  return (
    <article className="rounded-lg border border-[#d7ded5] bg-[#fbfcfa] p-4 shadow-resting">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-5 text-[#17211b]">
            {card.title}
          </h3>
          <p className="mt-1 text-sm leading-6 text-[#526057]">{card.body}</p>
        </div>
        <ToneIcon className="h-4 w-4 shrink-0 text-[#1b6b4a]" />
      </div>
      <button
        aria-pressed={isActive}
        className={`action-button mt-3 inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition active:translate-y-px disabled:cursor-not-allowed disabled:bg-[#90a399] ${card.buttonClass} ${focusRing}`}
        disabled={isStreaming}
        onClick={() => void onSubmit(card.question, card.id)}
        title={card.title}
        type="button"
      >
        {isActive ? (
          <LoaderCircle className="h-4 w-4 spin-icon" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
        Draft
      </button>
    </article>
  );
}

function formatHealthLabel(health: HealthResponse | null, error: string | null) {
  if (error) {
    return "Data unavailable";
  }

  if (!health || health.status !== "ok" || !health.counts) {
    return "Checking data";
  }

  const products = numberFormat.format(health.counts.products);
  const sales = numberFormat.format(health.counts.sales);
  const days = numberFormat.format(health.salesDays ?? 0);

  return `${products} products, ${sales} sales, ${days} days`;
}

function createMessageId(prefix: ChatRole) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
