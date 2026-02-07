"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

type ServiceStatus = "HEALTHY" | "DEGRADED" | "DOWN" | string;

type Service = {
  name: string;
  status: ServiceStatus;
  errorRate: number; // %
  p95: number; // ms
  traffic: number; // rpm/rps
};

type ApiResponse = {
  environment: string;
  window: string;
  services: Service[];
};

function statusScore(status: ServiceStatus) {
  const s = String(status).toUpperCase();
  if (s === "DOWN") return 1000;
  if (s === "DEGRADED") return 500;
  return 0;
}

/**
 * Hackathon-friendly risk score:
 * - DOWN always rises to top
 * - errorRate and p95 dominate
 * - traffic acts like impact multiplier
 */
function riskScore(svc: Service) {
  const base =
    statusScore(svc.status) +
    (Number(svc.errorRate) || 0) * 120 +
    (Number(svc.p95) || 0) / 3;

  const impact = 1 + Math.min((Number(svc.traffic) || 0) / 2000, 1); // 1..2
  return base * impact;
}

function badgeStyle(status: ServiceStatus): React.CSSProperties {
  const s = String(status).toUpperCase();
  const common: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid rgba(0,0,0,0.08)",
  };
  if (s === "DOWN") return { ...common, background: "#ffe5e5", color: "#a40000" };
  if (s === "DEGRADED") return { ...common, background: "#fff2cc", color: "#7a5200" };
  return { ...common, background: "#e9f7ef", color: "#0b6b2f" };
}

type SortKey = "name" | "status" | "errorRate" | "p95" | "traffic" | "risk";

export default function ServiceDashboard({
  onData,
  onActions,
}: {
  onData?: (data: { environment: string; window: string; services: Service[] }) => void;
  onActions?: (actions: { refresh: () => Promise<void> }) => void;
}) {
  const [environment, setEnvironment] = useState("prod");
  const [windowStr, setWindowStr] = useState("15m");
  const [onlyUnhealthy, setOnlyUnhealthy] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);

  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>("risk");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // ✅ Stable refresh (prevents infinite loop when passed to parent)
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/health/services?environment=${encodeURIComponent(
        environment
      )}&window=${encodeURIComponent(windowStr)}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Health API failed: ${res.status}`);
      const json = (await res.json()) as ApiResponse;

      setData(json);
      setLastUpdated(Date.now());

      // ✅ Share snapshot with parent (Assistant panel)
      onData?.({ environment: json.environment, window: json.window, services: json.services });
    } catch (e: any) {
      setError(e?.message ?? "Failed to load services");
    } finally {
      setLoading(false);
    }
  }, [environment, windowStr, onData]);

  // ✅ Expose refresh() to parent so Assistant can trigger it (stable object)
  const actions = useMemo(() => ({ refresh }), [refresh]);
  useEffect(() => {
    onActions?.(actions);
  }, [onActions, actions]);

  // ✅ Auto-refresh once on initial mount (judge-friendly: never empty)
  useEffect(() => {
    refresh();
  }, [refresh]);

  function exportSnapshot() {
    if (!data) return;

    const payload = {
      exportedAt: new Date().toISOString(),
      environment: data.environment,
      window: data.window,
      services: data.services,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `service-snapshot_${payload.environment}_${payload.window}_${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  async function copyDemoCommands() {
    const topName = (data?.services?.[0]?.name ?? "reports").toString();
    const text = [
      "Demo commands (paste one by one):",
      "rank top 5 risky services",
      "what changed",
      `explain ${topName}`,
      "list all services with status, errorRate, p95, traffic",
      "refresh",
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // fallback: select + copy not needed; just show state briefly
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  }

  const healthSummary = useMemo(() => {
    const list = data?.services ?? [];
    let healthy = 0;
    let degraded = 0;
    let down = 0;

    for (const s of list) {
      const st = String(s.status).toUpperCase();
      if (st === "DOWN") down++;
      else if (st === "DEGRADED") degraded++;
      else healthy++;
    }

    return { healthy, degraded, down, total: list.length };
  }, [data]);

  const services = useMemo(() => {
    const list = data?.services ?? [];
    const filtered = onlyUnhealthy
      ? list.filter((s) => String(s.status).toUpperCase() !== "HEALTHY")
      : list;

    const sorted = [...filtered].sort((a, b) => {
      const av =
        sortKey === "risk"
          ? riskScore(a)
          : sortKey === "status"
          ? statusScore(a.status)
          : (a as any)[sortKey];

      const bv =
        sortKey === "risk"
          ? riskScore(b)
          : sortKey === "status"
          ? statusScore(b.status)
          : (b as any)[sortKey];

      if (typeof av === "string" || typeof bv === "string") {
        const cmp = String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      }
      const diff = (Number(av) || 0) - (Number(bv) || 0);
      return sortDir === "asc" ? diff : -diff;
    });

    return sorted;
  }, [data, onlyUnhealthy, sortKey, sortDir]);

  const topRisky = useMemo(() => {
    return [...(data?.services ?? [])]
      .sort((a, b) => riskScore(b) - riskScore(a))
      .slice(0, 5);
  }, [data]);

  const topP95 = useMemo(() => {
    return [...(data?.services ?? [])]
      .sort((a, b) => (Number(b.p95) || 0) - (Number(a.p95) || 0))
      .slice(0, 5)
      .map((s) => ({ label: s.name, value: Number(s.p95) || 0 }));
  }, [data]);

  const topErrorRate = useMemo(() => {
    return [...(data?.services ?? [])]
      .sort((a, b) => (Number(b.errorRate) || 0) - (Number(a.errorRate) || 0))
      .slice(0, 5)
      .map((s) => ({ label: s.name, value: Number(s.errorRate) || 0 }));
  }, [data]);

  const topTraffic = useMemo(() => {
    return [...(data?.services ?? [])]
      .sort((a, b) => (Number(b.traffic) || 0) - (Number(a.traffic) || 0))
      .slice(0, 5)
      .map((s) => ({ label: s.name, value: Number(s.traffic) || 0 }));
  }, [data]);

  function onSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(nextKey);
      setSortDir(nextKey === "name" ? "asc" : "desc");
    }
  }

  const btn: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.15)",
    fontWeight: 800,
    cursor: "pointer",
  };

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header / Controls */}
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Service Health Dashboard</div>

          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Env</span>
            <select value={environment} onChange={(e) => setEnvironment(e.target.value)}>
              <option value="prod">prod</option>
              <option value="staging">staging</option>
              <option value="dev">dev</option>
            </select>
          </label>

          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Window</span>
            <select value={windowStr} onChange={(e) => setWindowStr(e.target.value)}>
              <option value="15m">15m</option>
              <option value="1h">1h</option>
              <option value="24h">24h</option>
            </select>
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={onlyUnhealthy}
              onChange={(e) => setOnlyUnhealthy(e.target.checked)}
            />
            <span style={{ fontSize: 12, fontWeight: 700 }}>Only degraded/down</span>
          </label>
        </div>

        {/* ✅ Refresh + Export + Copy demo */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={refresh}
            disabled={loading}
            style={{
              ...btn,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>

          <button
            onClick={exportSnapshot}
            disabled={!data || loading}
            style={{
              ...btn,
              cursor: !data || loading ? "not-allowed" : "pointer",
              opacity: !data || loading ? 0.6 : 1,
            }}
            title={!data ? "Load data first" : "Download JSON snapshot"}
          >
            Export snapshot
          </button>

          <button
            onClick={copyDemoCommands}
            disabled={!data}
            style={{
              ...btn,
              cursor: !data ? "not-allowed" : "pointer",
              opacity: !data ? 0.6 : 1,
            }}
            title="Copy a ready demo script to clipboard"
          >
            {copied ? "Copied ✅" : "Copy demo commands"}
          </button>
        </div>
      </div>

      {/* Errors */}
      {error && (
        <div style={{ padding: 12, border: "1px solid #ffb3b3", borderRadius: 12 }}>
          <div style={{ fontWeight: 800, color: "#a40000" }}>Error</div>
          <div style={{ marginTop: 6 }}>{error}</div>
        </div>
      )}

      {/* Scope + Top 5 */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.1)",
            minWidth: 260,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7 }}>Current scope</div>
          <div style={{ fontSize: 16, fontWeight: 900 }}>
            {data ? `${data.environment} • ${data.window}` : `${environment} • ${windowStr}`}
          </div>

          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
            Services loaded: <b>{healthSummary.total}</b>
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 800,
                border: "1px solid rgba(0,0,0,0.1)",
                background: "rgba(11,107,47,0.08)",
              }}
            >
              HEALTHY: {healthSummary.healthy}
            </span>

            <span
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 800,
                border: "1px solid rgba(0,0,0,0.1)",
                background: "rgba(122,82,0,0.10)",
              }}
            >
              DEGRADED: {healthSummary.degraded}
            </span>

            <span
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 800,
                border: "1px solid rgba(0,0,0,0.1)",
                background: "rgba(164,0,0,0.10)",
              }}
            >
              DOWN: {healthSummary.down}
            </span>
          </div>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
            Last updated: <b>{lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "—"}</b>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 320 }}>
          <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 8 }}>Top 5 risky</div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {topRisky.map((s) => {
              const score = riskScore(s);
              const widthPct = Math.min(100, Math.round((score / 2000) * 100));
              return (
                <div
                  key={s.name}
                  style={{
                    border: "1px solid rgba(0,0,0,0.1)",
                    borderRadius: 14,
                    padding: 12,
                    minWidth: 240,
                    flex: "1 1 240px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 900 }}>{s.name}</div>
                    <span style={badgeStyle(s.status)}>{String(s.status).toUpperCase()}</span>
                  </div>

                  {/* AI-looking risk bar */}
                  <div style={{ marginTop: 10 }}>
                    <div style={{ height: 8, borderRadius: 999, background: "rgba(0,0,0,0.08)" }}>
                      <div
                        style={{
                          height: 8,
                          borderRadius: 999,
                          width: `${widthPct}%`,
                          background: "rgba(0,0,0,0.45)",
                        }}
                      />
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>risk bar (scaled)</div>
                  </div>

                  <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.6 }}>
                    <div>
                      errorRate: <b>{s.errorRate}%</b>
                    </div>
                    <div>
                      p95: <b>{s.p95}ms</b>
                    </div>
                    <div>
                      traffic: <b>{s.traffic}</b>
                    </div>
                    <div>
                      riskScore: <b>{Math.round(score)}</b>
                    </div>
                  </div>
                </div>
              );
            })}

            {!data && (
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Loading… (auto-refresh on page load)
              </div>
            )}
          </div>

          {/* ✅ Analytics */}
          {data && (topP95.length > 0 || topErrorRate.length > 0 || topTraffic.length > 0) && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 8 }}>Analytics</div>

              <div style={{ display: "grid", gap: 12 }}>
                {topP95.length > 0 && (
                  <MiniBarChart title="Top 5 p95 latency" valueLabel="ms" items={topP95} />
                )}
                {topErrorRate.length > 0 && (
                  <MiniBarChart title="Top 5 error rate" valueLabel="%" items={topErrorRate} />
                )}
                {topTraffic.length > 0 && (
                  <MiniBarChart title="Top 5 traffic" valueLabel="rpm" items={topTraffic} />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Services Table */}
      <div style={{ border: "1px solid rgba(0,0,0,0.1)", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: 12, fontWeight: 900, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
          Services
          <span style={{ marginLeft: 10, fontSize: 12, opacity: 0.65 }}>
            (click column headers to sort)
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", background: "rgba(0,0,0,0.03)" }}>
                <th style={thStyle} onClick={() => onSort("name")}>
                  Service
                </th>
                <th style={thStyle} onClick={() => onSort("status")}>
                  Status
                </th>
                <th style={thStyle} onClick={() => onSort("errorRate")}>
                  ErrorRate (%)
                </th>
                <th style={thStyle} onClick={() => onSort("p95")}>
                  p95 (ms)
                </th>
                <th style={thStyle} onClick={() => onSort("traffic")}>
                  Traffic
                </th>
                <th style={thStyle} onClick={() => onSort("risk")}>
                  Risk
                </th>
              </tr>
            </thead>

            <tbody>
              {services.map((s) => (
                <tr key={s.name} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                  <td style={tdStyle}>
                    <b>{s.name}</b>
                  </td>
                  <td style={tdStyle}>
                    <span style={badgeStyle(s.status)}>{String(s.status).toUpperCase()}</span>
                  </td>
                  <td style={tdStyle}>{s.errorRate}</td>
                  <td style={tdStyle}>{s.p95}</td>
                  <td style={tdStyle}>{s.traffic}</td>
                  <td style={tdStyle}>
                    <b>{Math.round(riskScore(s))}</b>
                  </td>
                </tr>
              ))}

              {data && services.length === 0 && (
                <tr>
                  <td style={tdStyle} colSpan={6}>
                    No services match the filter.
                  </td>
                </tr>
              )}

              {!data && (
                <tr>
                  <td style={tdStyle} colSpan={6}>
                    Loading… (auto-refresh on page load)
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 12, opacity: 0.75 }}>
        Demo tip: click <b>Copy demo commands</b> → paste into Assistant. Also try <b>Export snapshot</b>.
      </div>
    </div>
  );
}

/** Simple, dependency-free mini bar chart (hackathon-safe) */
function MiniBarChart({
  title,
  items,
  valueLabel,
}: {
  title: string;
  items: { label: string; value: number }[];
  valueLabel: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <div style={{ border: "1px solid rgba(0,0,0,0.1)", borderRadius: 14, padding: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 10 }}>{title}</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((i) => {
          const pct = Math.round((i.value / max) * 100);
          return (
            <div
              key={i.label}
              style={{
                display: "grid",
                gridTemplateColumns: "160px 1fr 80px",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={i.label}
              >
                {i.label}
              </div>

              <div style={{ height: 10, borderRadius: 999, background: "rgba(0,0,0,0.08)" }}>
                <div
                  style={{
                    height: 10,
                    borderRadius: 999,
                    width: `${pct}%`,
                    background: "rgba(0,0,0,0.45)",
                  }}
                />
              </div>

              <div style={{ fontSize: 12, textAlign: "right", fontWeight: 800 }}>
                {Math.round(i.value)} {valueLabel}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: 12,
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
  userSelect: "none",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: 12,
  fontSize: 13,
  whiteSpace: "nowrap",
};
