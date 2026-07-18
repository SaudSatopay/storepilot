"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Phone, X } from "lucide-react";

export type ActionModalRequest = {
  kind: "reorder" | "promo";
  productIds?: string[];
};

type ReorderMessage = {
  supplierId: string;
  supplierName: string;
  phone: string;
  message: string;
};

type PromoProduct = {
  sku: string;
  name: string;
  stockQty: number;
  trendPercent: number;
  price: number;
};

type PromoResult = {
  copy: string;
  discountPercent: number;
  channel: string;
  products: PromoProduct[];
};

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--paper-raised)]";

export function ActionModal({
  request,
  onClose,
}: {
  request: ActionModalRequest | null;
  onClose: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<ReorderMessage[]>([]);
  const [promo, setPromo] = useState<PromoResult | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [discount, setDiscount] = useState(15);
  const [channel, setChannel] = useState("whatsapp");
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<Element | null>(null);
  const copiedTimerRef = useRef<number | null>(null);

  const isOpen = request !== null;

  const load = useCallback(
    async (activeRequest: ActionModalRequest, signal: AbortSignal) => {
      setIsLoading(true);
      setError(null);

      try {
        const endpoint =
          activeRequest.kind === "reorder"
            ? "/api/actions/reorder"
            : "/api/actions/promo";
        const payload: Record<string, unknown> = {};

        if (activeRequest.productIds?.length) {
          payload.product_ids = activeRequest.productIds;
        }

        if (activeRequest.kind === "promo") {
          payload.discount_percent = discount;
          payload.channel = channel;
        }

        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal,
        });
        const body = (await response.json()) as Record<string, unknown>;

        if (!response.ok) {
          throw new Error(
            typeof body.error === "string" ? body.error : "Draft failed.",
          );
        }

        if (activeRequest.kind === "reorder") {
          setDrafts((body.messages as ReorderMessage[]) ?? []);
        } else {
          setPromo(body as unknown as PromoResult);
        }
      } catch (loadError) {
        if (signal.aborted) {
          return;
        }

        setError(
          loadError instanceof Error ? loadError.message : "Draft failed.",
        );
      } finally {
        if (!signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [channel, discount],
  );

  useEffect(() => {
    if (!request) {
      setDrafts([]);
      setPromo(null);
      setError(null);
      setCopiedKey(null);
      return;
    }

    const controller = new AbortController();
    void load(request, controller.signal);

    return () => controller.abort();
  }, [request, load]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    openerRef.current = document.activeElement;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 30);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";

      if (openerRef.current instanceof HTMLElement) {
        openerRef.current.focus();
      }
    };
  }, [isOpen, onClose]);

  useEffect(
    () => () => {
      if (copiedTimerRef.current) {
        window.clearTimeout(copiedTimerRef.current);
      }
    },
    [],
  );

  async function copyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.setAttribute("readonly", "");
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.select();
      document.execCommand("copy");
      helper.remove();
    }

    setCopiedKey(key);

    if (copiedTimerRef.current) {
      window.clearTimeout(copiedTimerRef.current);
    }

    copiedTimerRef.current = window.setTimeout(() => setCopiedKey(null), 1600);
  }

  if (!request) {
    return null;
  }

  const title = request.kind === "reorder" ? "Reorder drafts" : "Promo draft";
  const subtitle =
    request.kind === "reorder"
      ? "WhatsApp-ready messages, grouped by supplier"
      : "Weekend copy for slow movers with healthy stock";

  return (
    <div
      aria-hidden="false"
      className="modal-backdrop fixed inset-0 z-50 grid place-items-center bg-[rgb(22_29_24_/_0.44)] px-4 py-6 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        aria-labelledby="action-modal-title"
        aria-modal="true"
        className="modal-panel flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--paper-raised)] shadow-[var(--shadow-hover)]"
        role="dialog"
      >
        <div className="masthead-rule shrink-0" />
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
          <div className="min-w-0">
            <h2
              className="font-display text-2xl font-semibold leading-8"
              id="action-modal-title"
            >
              {title}
            </h2>
            <p className="font-data mt-1 text-xs uppercase tracking-[0.12em] text-[var(--ink-faint)]">
              {subtitle}
            </p>
          </div>
          <button
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-md border border-[var(--line)] text-[var(--ink-soft)] transition hover:bg-[var(--paper)] ${focusRing}`}
            onClick={onClose}
            ref={closeButtonRef}
            title="Close"
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? <ModalSkeleton /> : null}

          {!isLoading && error ? (
            <div className="rounded-md border border-[var(--rose)] bg-[var(--rose-tint)] px-4 py-3 text-sm leading-6 text-[var(--rose)]">
              {error}
            </div>
          ) : null}

          {!isLoading && !error && request.kind === "reorder"
            ? drafts.map((draft, index) => (
                <SupplierDraft
                  copiedKey={copiedKey}
                  draft={draft}
                  draftKey={`supplier-${index}`}
                  key={draft.supplierId}
                  onCopy={copyText}
                  onEdit={(value) =>
                    setDrafts((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index
                          ? { ...entry, message: value }
                          : entry,
                      ),
                    )
                  }
                />
              ))
            : null}

          {!isLoading && !error && request.kind === "promo" && promo ? (
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <label
                  className="font-data text-xs uppercase tracking-[0.12em] text-[var(--ink-faint)]"
                  htmlFor="promo-discount"
                >
                  Discount
                </label>
                <select
                  className={`h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm ${focusRing}`}
                  id="promo-discount"
                  onChange={(event) => setDiscount(Number(event.target.value))}
                  value={discount}
                >
                  {[10, 15, 20, 25, 30].map((value) => (
                    <option key={value} value={value}>
                      {value}%
                    </option>
                  ))}
                </select>
                <label
                  className="font-data ml-2 text-xs uppercase tracking-[0.12em] text-[var(--ink-faint)]"
                  htmlFor="promo-channel"
                >
                  Channel
                </label>
                <select
                  className={`h-9 rounded-md border border-[var(--line)] bg-white px-2 text-sm ${focusRing}`}
                  id="promo-channel"
                  onChange={(event) => setChannel(event.target.value)}
                  value={channel}
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="sms">SMS</option>
                  <option value="in_store">In store</option>
                </select>
              </div>

              <div className="overflow-x-auto rounded-md border border-[var(--line)]">
                <table className="font-data w-full min-w-[420px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--line)] bg-[var(--paper)] text-[var(--ink-faint)]">
                      <th className="px-3 py-2 font-medium uppercase tracking-[0.1em]">SKU</th>
                      <th className="px-3 py-2 font-medium uppercase tracking-[0.1em]">Product</th>
                      <th className="px-3 py-2 text-right font-medium uppercase tracking-[0.1em]">Stock</th>
                      <th className="px-3 py-2 text-right font-medium uppercase tracking-[0.1em]">Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {promo.products.map((productRow) => (
                      <tr
                        className="border-b border-[var(--line)] last:border-b-0"
                        key={productRow.sku}
                      >
                        <td className="px-3 py-2">{productRow.sku}</td>
                        <td className="px-3 py-2">{productRow.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {productRow.stockQty}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {productRow.trendPercent}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <EditableCopyBlock
                copiedKey={copiedKey}
                copyKey="promo-copy"
                label="Promo copy"
                onCopy={copyText}
                onEdit={(value) =>
                  setPromo((current) =>
                    current ? { ...current, copy: value } : current,
                  )
                }
                rows={4}
                value={promo.copy}
              />
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-[var(--line)] bg-[var(--paper)] px-5 py-3">
          <p className="font-data text-xs uppercase tracking-[0.12em] text-[var(--ink-faint)]">
            Edit freely. Copy sends nothing until you paste it yourself.
          </p>
        </div>
      </div>
    </div>
  );
}

function SupplierDraft({
  draft,
  draftKey,
  copiedKey,
  onCopy,
  onEdit,
}: {
  draft: ReorderMessage;
  draftKey: string;
  copiedKey: string | null;
  onCopy: (key: string, text: string) => void;
  onEdit: (value: string) => void;
}) {
  return (
    <div className="mb-4 rounded-md border border-[var(--line)] bg-white p-4 last:mb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg font-semibold leading-6">
          {draft.supplierName}
        </h3>
        <span className="font-data inline-flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--paper)] px-2 py-1 text-xs tabular-nums text-[var(--ink-soft)]">
          <Phone className="h-3 w-3" />
          {draft.phone}
        </span>
      </div>
      <EditableCopyBlock
        copiedKey={copiedKey}
        copyKey={draftKey}
        label="Message"
        onCopy={onCopy}
        onEdit={onEdit}
        rows={8}
        value={draft.message}
      />
    </div>
  );
}

function EditableCopyBlock({
  value,
  label,
  rows,
  copyKey,
  copiedKey,
  onCopy,
  onEdit,
}: {
  value: string;
  label: string;
  rows: number;
  copyKey: string;
  copiedKey: string | null;
  onCopy: (key: string, text: string) => void;
  onEdit: (value: string) => void;
}) {
  const isCopied = copiedKey === copyKey;

  return (
    <div className="mt-3 grid gap-2">
      <label
        className="font-data text-xs uppercase tracking-[0.12em] text-[var(--ink-faint)]"
        htmlFor={`copy-block-${copyKey}`}
      >
        {label}
      </label>
      <textarea
        className={`font-data w-full resize-y rounded-md border border-[var(--line)] bg-[var(--paper-raised)] px-3 py-2 text-[13px] leading-6 text-[var(--ink)] ${focusRing}`}
        id={`copy-block-${copyKey}`}
        onChange={(event) => onEdit(event.target.value)}
        rows={rows}
        value={value}
      />
      <div>
        <button
          className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-white transition active:translate-y-px ${
            isCopied
              ? "bg-[var(--forest-deep)]"
              : "bg-[var(--forest)] hover:bg-[var(--forest-deep)]"
          } ${focusRing}`}
          onClick={() => onCopy(copyKey, value)}
          type="button"
        >
          {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {isCopied ? "Copied" : "Copy message"}
        </button>
      </div>
    </div>
  );
}

function ModalSkeleton() {
  return (
    <div className="grid gap-3" aria-hidden="true">
      <div className="skeleton-shimmer h-6 w-2/5 rounded-md" />
      <div className="skeleton-shimmer h-28 w-full rounded-md" />
      <div className="skeleton-shimmer h-9 w-36 rounded-md" />
    </div>
  );
}
