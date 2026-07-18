"use client";

import { FormEvent, useState } from "react";
import {
  ArrowUpRight,
  CircleAlert,
  Clipboard,
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

type ChatMessage = {
  role: "manager" | "pilot";
  body: string;
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
    role: "manager",
    body: "What needs my attention today?",
  },
  {
    role: "pilot",
    body: "Three things: reorder USB-C chargers, inspect the accessory spike, and move slow wireless mice with a weekend bundle. I used current stock, 7-day velocity, and 90 days of demo sales.",
  },
];

const initialEvidence = [
  "USB-C Chargers: 14 in stock",
  "7-day velocity: 5.1 per day",
  "Accessory sales: +42% vs trend",
];

const severityStyles = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-800",
  medium: "border-amber-200 bg-amber-50 text-amber-800",
  high: "border-rose-200 bg-rose-50 text-rose-800",
} satisfies Record<BriefItem["severity"], string>;

const typeIcons = {
  summary: TrendingUp,
  stockout: PackageCheck,
  anomaly: CircleAlert,
  opportunity: Sparkles,
} satisfies Record<BriefItem["type"], typeof TrendingUp>;

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [evidence, setEvidence] = useState<EvidenceGroup[]>([
    {
      toolName: "mock",
      label: "Demo evidence",
      chips: initialEvidence,
    },
  ]);
  const [input, setInput] = useState("What should I reorder this week?");
  const [status, setStatus] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const question = input.trim();
    if (!question || isStreaming) {
      return;
    }

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "manager", body: question },
      { role: "pilot", body: "" },
    ];
    setMessages(nextMessages);
    setInput("");
    setEvidence([]);
    setStatus("Opening StorePilot tools");
    setIsStreaming(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: nextMessages
            .filter((message) => message.body.trim().length > 0)
            .map((message) => ({
              role: message.role === "manager" ? "user" : "assistant",
              content: message.body,
            })),
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Chat request failed.");
      }

      await readChatStream(response.body);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "StorePilot could not answer.";
      setStatus(message);
      appendAssistantText(` ${message}`);
    } finally {
      setIsStreaming(false);
    }
  }

  async function readChatStream(body: ReadableStream<Uint8Array>) {
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

        handleStreamEvent(JSON.parse(line) as ChatStreamEvent);
      }
    }

    if (buffer.trim()) {
      handleStreamEvent(JSON.parse(buffer) as ChatStreamEvent);
    }
  }

  function handleStreamEvent(event: ChatStreamEvent) {
    if (event.type === "status") {
      setStatus(event.message);
      return;
    }

    if (event.type === "evidence") {
      setEvidence((current) => [
        ...current,
        {
          toolName: event.toolName,
          label: event.label,
          chips: event.chips,
        },
      ]);
      return;
    }

    if (event.type === "delta") {
      appendAssistantText(event.text);
      return;
    }

    if (event.type === "error") {
      setStatus(event.message);
      appendAssistantText(` ${event.message}`);
      return;
    }

    if (event.type === "done") {
      setStatus(event.fallback ? "Answered from local demo data" : "Answer complete");
    }
  }

  function appendAssistantText(text: string) {
    setMessages((current) => {
      const next = [...current];
      const last = next[next.length - 1];

      if (last?.role === "pilot") {
        next[next.length - 1] = {
          ...last,
          body: `${last.body}${text}`,
        };
      }

      return next;
    });
  }

  return (
    <main className="min-h-screen bg-[#f4f6f1] text-[#17211b]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col gap-4 px-4 py-4 lg:px-6">
        <header className="flex flex-col gap-3 border-b border-[#d7ded5] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#17211b] text-sm font-bold text-white">
              SP
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-normal text-[#17211b]">
                StorePilot
              </h1>
              <p className="text-sm text-[#66736b]">Daily operations desk</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-[#cfd8d2] bg-white px-3 py-2 text-sm font-medium text-[#34443a]">
              Demo store
            </span>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[#1b6b4a] px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#15573c]"
              title="Regenerate morning brief"
              type="button"
            >
              <RefreshCcw className="h-4 w-4" />
              Regenerate
            </button>
          </div>
        </header>

        <section className="grid flex-1 gap-4 lg:grid-cols-[minmax(340px,0.9fr)_minmax(520px,1.1fr)]">
          <aside className="flex min-h-[620px] flex-col rounded-lg border border-[#d7ded5] bg-white">
            <div className="border-b border-[#d7ded5] px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium uppercase text-[#66736b]">
                    Morning Brief
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-normal">
                    Generated for today
                  </h2>
                </div>
                <div className="rounded-md border border-[#d7ded5] px-3 py-2 text-right">
                  <p className="text-xs text-[#66736b]">Priority</p>
                  <p className="text-sm font-semibold text-[#9f1239]">High</p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 p-4">
              {briefItems.map((item) => {
                const Icon = typeIcons[item.type];

                return (
                  <article
                    className="rounded-lg border border-[#d7ded5] bg-[#fbfcfa] p-4 shadow-sm"
                    key={item.title}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-md border ${severityStyles[item.severity]}`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-base font-semibold leading-6">
                            {item.title}
                          </h3>
                          <span className="rounded-md bg-[#17211b] px-2 py-1 text-xs font-semibold text-white">
                            {item.metric}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#526057]">
                          {item.body}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </aside>

          <section className="flex min-h-[620px] flex-col rounded-lg border border-[#d7ded5] bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-[#d7ded5] px-4 py-4">
              <div>
                <p className="text-sm font-medium uppercase text-[#66736b]">
                  Chat
                </p>
                <h2 className="mt-1 text-2xl font-semibold tracking-normal">
                  Ask StorePilot
                </h2>
              </div>
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md border border-[#cfd8d2] px-3 text-sm font-semibold text-[#34443a] transition hover:bg-[#eef3ee]"
                title="Open action history"
                type="button"
              >
                <MessageSquare className="h-4 w-4" />
                History
              </button>
            </div>

            <div className="flex flex-1 flex-col justify-between gap-4 p-4">
              <div className="grid gap-3">
                {messages.map((message, index) => (
                  <div
                    className={`max-w-[82%] rounded-lg px-4 py-3 text-sm leading-6 ${
                      message.role === "manager"
                        ? "ml-auto bg-[#17211b] text-white"
                        : "border border-[#d7ded5] bg-[#fbfcfa] text-[#34443a]"
                    }`}
                    key={`${message.role}-${index}`}
                  >
                    {message.body || "Checking the store data..."}
                  </div>
                ))}

                <div className="flex flex-wrap gap-2 pt-1">
                  {evidence.flatMap((group) =>
                    group.chips.map((chip) => (
                      <span
                        className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-800"
                        key={`${group.toolName}-${chip}`}
                        title={group.label}
                      >
                        {chip}
                      </span>
                    )),
                  )}
                  {status ? (
                    <span className="rounded-md border border-[#d7ded5] bg-[#f4f6f1] px-2.5 py-1.5 text-xs font-medium text-[#66736b]">
                      {status}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <article className="rounded-lg border border-[#d7ded5] bg-[#fbfcfa] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">Draft reorder</h3>
                        <p className="mt-1 text-sm leading-6 text-[#526057]">
                          Galaxy USB-C chargers from Gulf Parts Supply.
                        </p>
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-[#1b6b4a]" />
                    </div>
                    <button
                      className="mt-3 inline-flex h-9 items-center gap-2 rounded-md bg-[#1b6b4a] px-3 text-sm font-semibold text-white transition hover:bg-[#15573c]"
                      title="Draft reorder message"
                      type="button"
                    >
                      <Clipboard className="h-4 w-4" />
                      Draft
                    </button>
                  </article>

                  <article className="rounded-lg border border-[#d7ded5] bg-[#fbfcfa] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">Draft promo</h3>
                        <p className="mt-1 text-sm leading-6 text-[#526057]">
                          Weekend keyboard and mouse bundle copy.
                        </p>
                      </div>
                      <TrendingDown className="h-4 w-4 text-[#b45309]" />
                    </div>
                    <button
                      className="mt-3 inline-flex h-9 items-center gap-2 rounded-md bg-[#17211b] px-3 text-sm font-semibold text-white transition hover:bg-[#26372e]"
                      title="Draft promotion"
                      type="button"
                    >
                      <Sparkles className="h-4 w-4" />
                      Draft
                    </button>
                  </article>
                </div>

                <form className="flex gap-2" onSubmit={handleSubmit}>
                  <label className="sr-only" htmlFor="chat-input">
                    Ask StorePilot
                  </label>
                  <input
                    className="h-11 min-w-0 flex-1 rounded-md border border-[#cfd8d2] bg-white px-3 text-sm outline-none transition placeholder:text-[#8a948d] focus:border-[#1b6b4a] focus:ring-2 focus:ring-[#bfe6d2]"
                    disabled={isStreaming}
                    id="chat-input"
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="Ask about stock, sales, or suppliers"
                    type="text"
                    value={input}
                  />
                  <button
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#1b6b4a] text-white transition hover:bg-[#15573c] disabled:cursor-not-allowed disabled:bg-[#90a399]"
                    disabled={isStreaming}
                    title="Send message"
                    type="submit"
                  >
                    <Send className="h-4 w-4" />
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
