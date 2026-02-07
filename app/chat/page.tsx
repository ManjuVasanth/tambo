"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import ServiceDashboard from "./ServiceDashboard";

type Service = {
  name: string;
  status: string;
  errorRate: number;
  p95: number;
  traffic: number;
};

function statusScore(status: string) {
  const s = status.toUpperCase();
  if (s === "DOWN") return 1000;
  if (s === "DEGRADED") return 500;
  return 0;
}

function riskScore(s: Service) {
  const base = statusScore(s.status) + s.errorRate * 120 + s.p95 / 3;
  const impact = 1 + Math.min(s.traffic / 2000, 1);
  return base * impact;
}

type Mode = "idle" | "list" | "rank";

type ChatMsg = {
  role: "user" | "assistant";
  text: string;
};

type Snapshot = {
  environment: string;
  window: string;
  services: Service[];
};

export default function ChatPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [actions, setActions] = useState<{ refresh: () => Promise<void> } | null>(null);

  const [mode, setMode] = useState<Mode>("idle");
  const [busy, setBusy] = useState(false);

  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      text:
        "Hi! Try:\n" +
        "• list\n" +
        "• rank\n" +
        "• refresh\n" +
        "• explain <serviceName>\n" +
        "• what changed\n\n" +
        "Tip: Click “Run Demo” for judges 🙂",
    },
  ]);

  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Keep last snapshot to compute diffs
  const [lastChangeSummary, setLastChangeSummary] = useState<string>(
    "No changes computed yet. Try “refresh” first."
  );

  // ✅ Stable callbacks to avoid re-render loops
  const handleData = useCallback((s: Snapshot) => {
    setSnapshot((prev) => {
      // Compute changes when new snapshot arrives
      if (prev && s) {
        const summary = buildChangeSummary(prev, s);
        setLastChangeSummary(summary);
      }
      return s;
    });
  }, []);

  const handleActions = useCallback((a: { refresh: () => Promise<void> } | null) => {
    setActions(a);
  }, []);

  const top5 = useMemo(() => {
    if (!snapshot?.services?.length) return [];
    return [...snapshot.services].sort((a, b) => riskScore(b) - riskScore(a)).slice(0, 5);
  }, [snapshot]);

  function scrollToBottom() {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  async function ensureData() {
    if (snapshot) return;
    if (!actions) return;
    setBusy(true);
    try {
      await actions.refresh();
    } finally {
      setBusy(false);
    }
  }

  function buildListText() {
    if (!snapshot) return "No data yet. Type “refresh” or click Refresh on the dashboard.";
    if (!snapshot.services.length) return "No services returned by the API.";

    const rows = snapshot.services
      .map(
        (s) =>
          `• ${s.name} | status=${s.status} | errorRate=${s.errorRate}% | p95=${s.p95}ms | traffic=${s.traffic}`
      )
      .join("\n");

    return `Services (${snapshot.environment}/${snapshot.window}):\n\n${rows}`;
  }

  function buildRankText() {
    if (!snapshot) return "No data yet. Type “refresh” first.";
    if (!snapshot.services.length) return "No services returned by the API.";

    const lines = top5.map((s, i) => {
      const why = [
        s.status.toUpperCase() !== "HEALTHY" ? `status=${s.status}` : null,
        s.errorRate >= 2 ? `high errorRate=${s.errorRate}%` : `errorRate=${s.errorRate}%`,
        s.p95 >= 800 ? `high p95=${s.p95}ms` : `p95=${s.p95}ms`,
        s.traffic >= 800 ? `high traffic=${s.traffic}` : `traffic=${s.traffic}`,
      ]
        .filter(Boolean)
        .join(", ");

      return `${i + 1}) ${s.name} → ${why} (riskScore=${Math.round(riskScore(s))})`;
    });

    return `Top 5 risky services (${snapshot.environment}/${snapshot.window}):\n\n${lines.join("\n")}`;
  }

  function explainService(name: string) {
    if (!snapshot?.services?.length) return "No data yet. Type “refresh” first.";
    const svc = snapshot.services.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (!svc) return `I can't find "${name}". Try “list” to see exact service names.`;

    const why = [
      `status=${svc.status}`,
      `errorRate=${svc.errorRate}%`,
      `p95=${svc.p95}ms`,
      `traffic=${svc.traffic}`,
      `riskScore=${Math.round(riskScore(svc))}`,
    ].join(", ");

    return `Explanation for ${svc.name}: ${why}`;
  }

  async function handleUserText(text: string) {
    const t = text.trim();
    if (!t) return;

    setMessages((m) => [...m, { role: "user", text: t }]);
    setInput("");
    scrollToBottom();

    const lower = t.toLowerCase();

    // Commands (deterministic and hackathon-safe)
    const wantsRefresh = lower === "refresh" || lower.includes("refresh") || lower.includes("reload");
    const wantsRank = lower === "rank" || lower.includes("rank") || lower.includes("top 5") || lower.includes("risky");
    const wantsList = lower === "list" || lower.includes("all services");
    const wantsWhatChanged = lower === "what changed" || lower.includes("what changed");

    // explain <serviceName>
    if (lower.startsWith("explain ")) {
      await ensureData();
      const name = t.slice("explain ".length).trim();
      const reply = explainService(name);
      setMessages((m) => [...m, { role: "assistant", text: reply }]);
      scrollToBottom();
      return;
    }

    // what changed
    if (wantsWhatChanged) {
      await ensureData();
      setMessages((m) => [...m, { role: "assistant", text: lastChangeSummary }]);
      scrollToBottom();
      return;
    }

    // Auto refresh if asked OR if user wants list/rank but no data yet
    if (wantsRefresh || ((wantsList || wantsRank) && !snapshot)) {
      if (!actions) {
        setMessages((m) => [
          ...m,
          { role: "assistant", text: "I can’t refresh yet (actions not ready). Try reloading the page." },
        ]);
        scrollToBottom();
        return;
      }

      setBusy(true);
      setMessages((m) => [...m, { role: "assistant", text: "Refreshing service metrics…" }]);
      scrollToBottom();

      try {
        await actions.refresh();
      } finally {
        setBusy(false);
      }
    }

    // Respond based on intent
    let reply = "";
    if (wantsRank) {
      setMode("rank");
      reply = buildRankText();
    } else if (wantsList) {
      setMode("list");
      reply = buildListText();
    } else if (wantsRefresh) {
      reply = "Done. Try: “rank”, “list”, “explain <serviceName>”, “what changed”.";
    } else {
      reply =
        "Try:\n" +
        "• list\n" +
        "• rank\n" +
        "• refresh\n" +
        "• explain <serviceName>\n" +
        "• what changed";
    }

    setMessages((m) => [...m, { role: "assistant", text: reply }]);
    scrollToBottom();
  }

  return (
    <div style={{ height: "100vh", display: "grid", gridTemplateColumns: "1.2fr 0.8fr" }}>
      {/* Left: Dashboard */}
      <div style={{ borderRight: "1px solid rgba(0,0,0,0.1)", overflow: "auto" }}>
        <ServiceDashboard onData={handleData} onActions={handleActions} />
      </div>

      {/* Right: Chat Assistant */}
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        <div style={{ padding: 16, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Assistant</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
            Commands: list • rank • refresh • explain &lt;service&gt; • what changed {busy ? " (working…)" : ""}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <button
              onClick={async () => {
                await ensureData();
                setMode("list");
                setMessages((m) => [...m, { role: "assistant", text: buildListText() }]);
                scrollToBottom();
              }}
              style={btnStyle(busy)}
              disabled={busy}
            >
              List services
            </button>

            <button
              onClick={async () => {
                await ensureData();
                setMode("rank");
                setMessages((m) => [...m, { role: "assistant", text: buildRankText() }]);
                scrollToBottom();
              }}
              style={btnStyle(busy)}
              disabled={busy}
            >
              Rank top 5 risky
            </button>

            {/* ✅ One-click judge demo */}
            <button
              onClick={async () => {
                await ensureData();

                setMode("list");
                setMessages((m) => [...m, { role: "assistant", text: buildListText() }]);
                scrollToBottom();

                setTimeout(() => {
                  setMode("rank");
                  setMessages((m) => [...m, { role: "assistant", text: buildRankText() }]);
                  scrollToBottom();
                }, 300);
              }}
              style={btnStyle(busy)}
              disabled={busy}
            >
              Run Demo
            </button>

            <button
              onClick={async () => {
                await ensureData();
                setMessages((m) => [...m, { role: "assistant", text: lastChangeSummary }]);
                scrollToBottom();
              }}
              style={btnStyle(busy)}
              disabled={busy}
            >
              What changed?
            </button>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
          {messages.map((m, idx) => (
            <div key={idx} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.75 }}>
                {m.role === "user" ? "You" : "Assistant"}
              </div>
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.1)",
                  marginTop: 6,
                  background: m.role === "user" ? "rgba(0,0,0,0.02)" : "white",
                }}
              >
                {m.text}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: 16, borderTop: "1px solid rgba(0,0,0,0.08)" }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleUserText(input);
            }}
            style={{ display: "flex", gap: 10 }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='Try: "rank" or "explain payments-service"'
              style={{
                flex: 1,
                padding: "12px 12px",
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.15)",
                outline: "none",
              }}
            />
            <button type="submit" style={btnStyle(false)} disabled={busy}>
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function btnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.15)",
    fontWeight: 800,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

/** Build a short diff summary between snapshots */
function buildChangeSummary(prev: Snapshot, next: Snapshot): string {
  const prevMap = new Map(prev.services.map((s) => [s.name, s]));
  const nextMap = new Map(next.services.map((s) => [s.name, s]));

  const newlyDown: string[] = [];
  const statusChanged: string[] = [];
  const p95Spike: string[] = [];
  const errSpike: string[] = [];

  for (const [name, n] of nextMap.entries()) {
    const p = prevMap.get(name);
    if (!p) continue;

    const ps = p.status.toUpperCase();
    const ns = n.status.toUpperCase();

    if (ps !== "DOWN" && ns === "DOWN") newlyDown.push(name);
    if (ps !== ns) statusChanged.push(`${name}: ${ps} → ${ns}`);

    const p95Delta = (n.p95 ?? 0) - (p.p95 ?? 0);
    if (p95Delta >= 200) p95Spike.push(`${name} (+${Math.round(p95Delta)}ms)`);

    const erDelta = (n.errorRate ?? 0) - (p.errorRate ?? 0);
    if (erDelta >= 1) errSpike.push(`${name} (+${erDelta.toFixed(1)}%)`);
  }

  const lines: string[] = [];
  lines.push(`Changes (${prev.environment}/${prev.window} → ${next.environment}/${next.window}):`);

  if (newlyDown.length) lines.push(`• Newly DOWN: ${newlyDown.join(", ")}`);
  if (statusChanged.length) lines.push(`• Status changes: ${statusChanged.slice(0, 5).join(" | ")}${statusChanged.length > 5 ? " …" : ""}`);
  if (errSpike.length) lines.push(`• Error spikes: ${errSpike.slice(0, 5).join(", ")}${errSpike.length > 5 ? " …" : ""}`);
  if (p95Spike.length) lines.push(`• p95 spikes: ${p95Spike.slice(0, 5).join(", ")}${p95Spike.length > 5 ? " …" : ""}`);

  if (lines.length === 1) lines.push("• No significant changes detected.");

  return lines.join("\n");
}
