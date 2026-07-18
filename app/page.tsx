"use client";

import {
  useCallback,
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
  TrendingUp,
} from "lucide-react";
import {
  ActionModal,
  type ActionModalRequest,
} from "@/app/components/ActionModal";
import type { BriefItem, BriefSeverity, MorningBrief } from "@/lib/brief/types";

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
};

const initialMessages: ChatMessage[] = [
  {
    id: "initial-pilot",
    role: "pilot",
    body: "Morning. Your brief is on the left, built from the store's own sales and stock. Ask me anything about products, suppliers, or pace, and I will answer with the numbers.",
    evidence: [],
  },
];

const severityTone = {
  low: {
    accent: "bg-[var(--forest)]",
    icon: "bg-[var(--forest-tint)] text-[var(--forest)]",
    metric: "text-[var(--forest)]",
    stamp: "border-[var(--forest)] text-[var(--forest)]",
  },
  medium: {
    accent: "bg-[var(--amber)]",
    icon: "bg-[var(--amber-tint)] text-[var(--amber)]",
    metric: "text-[var(--amber)]",
    stamp: "border-[var(--amber)] text-[var(--amber)]",
  },
  high: {
    accent: "bg-[var(--rose)]",
    icon: "bg-[var(--rose-tint)] text-[var(--rose)]",
    metric: "text-[var(--rose)]",
    stamp: "border-[var(--rose)] text-[var(--rose)]",
  },
} satisfies Record<BriefSeverity, Record<string, string>>;

const typeIcons = {
  summary: TrendingUp,
  stockout: PackageCheck,
  anomaly: CircleAlert,
  opportunity: Sparkles,
} satisfies Record<BriefItem["type"], typeof TrendingUp>;

const numberFormat = new Intl.NumberFormat("en-US");
const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--paper)]";

export default function Home() {
  const [brief, setBrief] = useState<MorningBrief | null>(null);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [isBriefLoading, setIsBriefLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("What should I reorder this week?");
  const [status, setStatus] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [modalRequest, setModalRequest] = useState<ActionModalRequest | null>(
    null,
  );
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const currentDate = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      }).format(new Date()),
    [],
  );

  const loadBrief = useCallback(async (fresh: boolean) => {
    setIsBriefLoading(true);
    setBriefError(null);

    try {
      const response = await fetch(`/api/brief${fresh ? "?fresh=1" : ""}`);
      const body = (await response.json()) as {
        brief?: MorningBrief;
        error?: string;
      };

      if (!response.ok || !body.brief) {
        throw new Error(body.error ?? "Could not load the brief.");
      }

      setBrief(body.brief);
    } catch (error) {
      setBriefError(
        error instanceof Error ? error.message : "Could not load the brief.",
      );
    } finally {
      setIsBriefLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBrief(false);
  }, [loadBrief]);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/health", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: HealthResponse | null) => {
        if (payload) {
          setHealth(payload);
        }
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const scrollArea = chatScrollRef.current;

    if (scrollArea) {
      scrollArea.scrollTop = scrollArea.scrollHeight;
    }
  }, [messages, status, isStreaming]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitQuestion(input);
  }

  async function submitQuestion(question: string) {
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

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                evidence: [
                  ...message.evidence,
                  {
                    toolName: event.toolName,
                    label: event.label,
                    chips: event.chips,
                  },
                ],
              }
            : message,
        ),
      );
      return false;
    }

    if (event.type === "delta") {
      setStatus(null);
      appendAssistantText(assistantId, event.text);
      return false;
    }

    if (event.type === "error") {
      setStatus(null);
      appendAssistantText(assistantId, ` ${event.message}`);
      finishAssistantTurn(assistantId, "error");
      setIsStreaming(false);
      return true;
    }

    if (event.type === "done") {
      setStatus(null);
      finishAssistantTurn(assistantId, "idle");
      setIsStreaming(false);
      return true;
    }

    return false;
  }

  function appendAssistantText(assistantId: string, text: string) {
    setMessages((current) =>
      current.map((message) =>
        message.id === assistantId
          ? { ...message, body: `${message.body}${text}` }
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

  const healthLabel = formatHealthLabel(health);
  const priorityTone = severityTone[brief?.priority ?? "low"];

  return (
    <main className="min-h-screen overflow-x-hidden">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-4 pb-6 pt-5 sm:px-6">
        <header className="flex flex-col gap-4 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-[var(--ink)] text-white">
              <span className="font-display text-lg font-bold">SP</span>
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-[32px] font-bold leading-9 tracking-tight">
                StorePilot
              </h1>
              <p className="font-data mt-0.5 text-xs uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                The daily operations desk
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--paper-raised)] px-3 text-sm font-medium text-[var(--ink-soft)]">
              <CalendarDays className="h-4 w-4 text-[var(--forest)]" />
              {currentDate}
            </span>
            <span className="font-data inline-flex h-10 items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--paper-raised)] px-3 text-xs tabular-nums text-[var(--ink-soft)]">
              <Database className="h-4 w-4 text-[var(--forest)]" />
              {healthLabel}
            </span>
            <button
              className={`inline-flex h-10 items-center gap-2 rounded-md bg-[var(--forest)] px-3.5 text-sm font-semibold text-white transition hover:bg-[var(--forest-deep)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`}
              disabled={isBriefLoading}
              onClick={() => void loadBrief(true)}
              title="Regenerate morning brief"
              type="button"
            >
              {isBriefLoading ? (
                <LoaderCircle className="spin-icon h-4 w-4" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )}
              Regenerate
            </button>
          </div>
        </header>

        <div className="masthead-rule" />

        <section className="mt-4 grid min-w-0 flex-1 gap-4 lg:grid-cols-[minmax(340px,0.94fr)_minmax(0,1.06fr)]">
          <aside className="flex min-w-0 flex-col rounded-lg border border-[var(--line)] bg-[var(--paper-raised)] shadow-resting">
            <div className="border-b border-[var(--line)] px-5 pb-4 pt-5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-data text-xs font-medium uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                  Morning Brief
                  {brief ? ` · Data through ${brief.asOfLabel}` : ""}
                </p>
                <span className="flex-1" />
                {brief ? (
                  <>
                    <span
                      className={`font-data rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${priorityTone.stamp}`}
                    >
                      {brief.priority} priority
                    </span>
                    <span className="font-data rounded-sm border border-[var(--line-strong)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                      {brief.mode === "model" ? "Written by GPT-5.6" : "Local analysis"}
                    </span>
                  </>
                ) : null}
              </div>
              {isBriefLoading && !brief ? (
                <div className="skeleton-shimmer mt-3 h-10 w-4/5 rounded-md" />
              ) : (
                <h2 className="font-display mt-2 text-[30px] font-bold leading-[38px] tracking-tight sm:text-[34px] sm:leading-[42px]">
                  {briefError
                    ? "The brief hit a snag."
                    : brief?.headline ?? "All quiet this morning."}
                </h2>
              )}
            </div>

            <div className="grid gap-3 p-4">
              {isBriefLoading && !brief
                ? Array.from({ length: 4 }).map((_, index) => (
                    <BriefSkeleton index={index} key={index} />
                  ))
                : null}

              {!isBriefLoading && briefError ? (
                <div className="rounded-md border border-[var(--rose)] bg-[var(--rose-tint)] p-4">
                  <p className="text-sm leading-6 text-[var(--rose)]">{briefError}</p>
                  <button
                    className={`mt-3 inline-flex h-9 items-center gap-2 rounded-md bg-[var(--rose)] px-3 text-sm font-semibold text-white ${focusRing}`}
                    onClick={() => void loadBrief(false)}
                    type="button"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    Retry
                  </button>
                </div>
              ) : null}

              {brief && !briefError
                ? brief.items.map((item, index) => (
                    <BriefCard
                      index={index}
                      item={item}
                      key={item.id}
                      onAction={(request) => setModalRequest(request)}
                    />
                  ))
                : null}

              {brief && !briefError && brief.items.length === 0 ? (
                <div className="rounded-md border border-[var(--line)] bg-white p-5 text-sm leading-6 text-[var(--ink-soft)]">
                  No stories today. Import sales data or run the seed to give the
                  desk something to report.
                </div>
              ) : null}
            </div>
          </aside>

          <section className="flex h-[720px] min-w-0 flex-col rounded-lg border border-[var(--line)] bg-[var(--paper-raised)] shadow-resting lg:h-auto">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 pb-4 pt-5">
              <div className="min-w-0">
                <p className="font-data text-xs font-medium uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                  Ask StorePilot
                </p>
                <h2 className="font-display mt-2 text-[30px] font-bold leading-[38px] tracking-tight">
                  The desk
                </h2>
              </div>
              <button
                className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-[var(--line)] px-3 text-sm font-semibold text-[var(--ink-soft)] transition hover:bg-[var(--paper)] active:translate-y-px ${focusRing}`}
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
                className="min-h-[260px] flex-1 overflow-y-auto pr-1"
                ref={chatScrollRef}
              >
                <div className="grid gap-4">
                  {messages.map((message, index) => (
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
                  ))}
                </div>
              </div>

              <div className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <ActionStub
                    body="Suppliers, quantities, and phone numbers for the products about to run out."
                    icon={Clipboard}
                    label="Draft reorder"
                    onOpen={() => setModalRequest({ kind: "reorder" })}
                  />
                  <ActionStub
                    body="Weekend copy for slow movers with stock worth freeing up."
                    icon={Sparkles}
                    label="Draft promo"
                    onOpen={() => setModalRequest({ kind: "promo" })}
                  />
                </div>

                <form className="flex min-w-0 gap-2" onSubmit={handleSubmit}>
                  <label className="sr-only" htmlFor="chat-input">
                    Ask StorePilot
                  </label>
                  <input
                    className={`h-11 min-w-0 flex-1 rounded-md border border-[var(--line)] bg-white px-3 text-sm leading-5 text-[var(--ink)] transition placeholder:text-[var(--ink-faint)] disabled:cursor-not-allowed disabled:bg-[var(--paper)] ${focusRing}`}
                    disabled={isStreaming}
                    id="chat-input"
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="Ask about stock, sales, or suppliers"
                    type="text"
                    value={input}
                  />
                  <button
                    className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[var(--forest)] text-white transition hover:bg-[var(--forest-deep)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`}
                    disabled={isStreaming || input.trim().length === 0}
                    title="Send message"
                    type="submit"
                  >
                    {isStreaming ? (
                      <LoaderCircle className="spin-icon h-4 w-4" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </form>
              </div>
            </div>
          </section>
        </section>

        <footer className="pointer-events-none mt-5">
          <p className="font-data text-center text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
            StorePilot · GPT-5.6 tool calling over live store data · Demo store:
            {" "}
            {brief?.storeName ?? "Cedar Electronics"}
          </p>
        </footer>
      </div>

      <ActionModal
        onClose={() => setModalRequest(null)}
        request={modalRequest}
      />
    </main>
  );
}

function BriefCard({
  item,
  index,
  onAction,
}: {
  item: BriefItem;
  index: number;
  onAction: (request: ActionModalRequest) => void;
}) {
  const Icon = typeIcons[item.type];
  const tone = severityTone[item.severity];

  return (
    <article
      className="brief-card-in hover-lift relative overflow-hidden rounded-md border border-[var(--line)] bg-white p-4 pl-5 shadow-resting"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className={`absolute left-0 top-0 h-full w-[3px] ${tone.accent}`} />
      <div className="flex items-start gap-3.5">
        <div
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${tone.icon}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <h3 className="font-display text-xl font-semibold leading-7">
              {item.title}
            </h3>
            <div className="shrink-0 text-right">
              <p
                className={`font-data text-lg font-bold leading-6 tabular-nums ${tone.metric}`}
              >
                {item.metric}
              </p>
              <p className="font-data mt-0.5 text-[10px] uppercase tracking-[0.1em] text-[var(--ink-faint)]">
                {item.metricLabel}
              </p>
            </div>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
            {item.body}
          </p>
          {item.action ? (
            <button
              className={`mt-3 inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-white transition active:translate-y-px ${
                item.action.kind === "reorder"
                  ? "bg-[var(--forest)] hover:bg-[var(--forest-deep)]"
                  : "bg-[var(--ink)] hover:bg-[#2a352d]"
              } ${focusRing}`}
              onClick={() =>
                onAction({
                  kind: item.action?.kind ?? "reorder",
                  productIds: item.action?.productIds,
                })
              }
              type="button"
            >
              {item.action.label}
              <ArrowUpRight className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function BriefSkeleton({ index }: { index: number }) {
  return (
    <article
      aria-hidden="true"
      className="brief-card-in min-h-[120px] rounded-md border border-[var(--line)] bg-white p-4"
      style={{ animationDelay: `${index * 55}ms` }}
    >
      <div className="flex items-start gap-3">
        <div className="skeleton-shimmer h-9 w-9 shrink-0 rounded-md" />
        <div className="grid flex-1 gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="skeleton-shimmer h-5 w-3/5 rounded-md" />
            <div className="skeleton-shimmer h-6 w-14 rounded-md" />
          </div>
          <div className="skeleton-shimmer h-4 w-full rounded-md" />
          <div className="skeleton-shimmer h-4 w-4/5 rounded-md" />
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
        <span className="font-data px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-faint)]">
          {isManager ? "You" : "StorePilot"}
        </span>
        <div
          className={`min-h-12 px-4 py-3 text-sm leading-6 shadow-resting ${
            isManager
              ? "rounded-lg rounded-br-sm bg-[var(--ink)] text-[var(--paper)]"
              : "rounded-lg rounded-bl-sm border border-[var(--line)] bg-white text-[var(--ink-soft)]"
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
              <div className="shimmer-line h-3 w-40 rounded-md" />
              <div className="shimmer-line h-3 w-28 rounded-md" />
            </div>
          ) : null}
          {hasEvidence ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {message.evidence.flatMap((group, groupIndex) =>
                group.chips.map((chip, chipIndex) => (
                  <span
                    className="evidence-chip font-data rounded-sm border border-[var(--line)] bg-[var(--forest-tint)] px-2 py-1 text-[11px] font-medium leading-4 tabular-nums text-[var(--forest-deep)]"
                    key={`${message.id}-${groupIndex}-${chipIndex}`}
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

function ActionStub({
  label,
  body,
  icon: Icon,
  onOpen,
}: {
  label: string;
  body: string;
  icon: typeof Clipboard;
  onOpen: () => void;
}) {
  return (
    <article className="hover-lift rounded-md border border-[var(--line)] bg-white p-4 shadow-resting">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold leading-6">
            {label}
          </h3>
          <p className="mt-1 text-[13px] leading-5 text-[var(--ink-soft)]">
            {body}
          </p>
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-[var(--forest)]" />
      </div>
      <button
        className={`action-button mt-3 inline-flex h-9 items-center gap-2 rounded-md bg-[var(--forest)] px-3 text-sm font-semibold text-white transition hover:bg-[var(--forest-deep)] active:translate-y-px ${focusRing}`}
        onClick={onOpen}
        type="button"
      >
        <Icon className="h-4 w-4" />
        {label}
      </button>
    </article>
  );
}

function formatHealthLabel(health: HealthResponse | null) {
  if (!health || health.status !== "ok" || !health.counts) {
    return "Checking data";
  }

  const products = numberFormat.format(health.counts.products);
  const sales = numberFormat.format(health.counts.sales);
  const days = numberFormat.format(health.salesDays ?? 0);

  return `${products} products · ${sales} sales · ${days} days`;
}

function createMessageId(prefix: ChatRole) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
