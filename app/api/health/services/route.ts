import { NextResponse } from "next/server";

type Service = { name: string; status: string; errorRate: number; p95: number; traffic: number };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const environment = searchParams.get("environment") ?? "prod";
  const window = searchParams.get("window") ?? "15m";

  // Base snapshot (demo telemetry)
  const base: Service[] = [
    { name: "gateway", status: "HEALTHY", errorRate: 0.3, p95: 180, traffic: 1200 },
    { name: "auth", status: "HEALTHY", errorRate: 0.1, p95: 120, traffic: 980 },
    { name: "risk-engine", status: "DEGRADED", errorRate: 2.1, p95: 820, traffic: 640 },
    { name: "billing", status: "DEGRADED", errorRate: 1.4, p95: 560, traffic: 430 },
    { name: "reports", status: "DOWN", errorRate: 8.8, p95: 2100, traffic: 90 },
    { name: "notifications", status: "HEALTHY", errorRate: 0.2, p95: 160, traffic: 700 },
  ];

  // Window multiplier (longer window = smoother but higher “accumulated” error feeling)
  const windowFactor =
    window === "15m" ? 1.0 :
    window === "1h" ? 1.15 :
    window === "24h" ? 1.35 :
    1.0;

  // Env multiplier (prod slightly higher traffic, dev lower)
  const envTrafficFactor =
    environment === "prod" ? 1.0 :
    environment === "staging" ? 0.55 :
    0.25;

  // Small deterministic jitter so refresh changes a bit (but not crazy)
  const t = Date.now();
  const jitter = (seed: number) => {
    const x = Math.sin((t / 60000) + seed) * 0.5 + 0.5; // 0..1 changes per minute
    return x;
  };

  const services = base.map((s, idx) => {
    const j = jitter(idx + s.name.length);

    // Keep status stable in demo, but make numbers breathe
    const traffic = Math.round(s.traffic * envTrafficFactor * (0.9 + 0.2 * j));
    const errorRate = clamp(s.errorRate * windowFactor * (0.85 + 0.3 * j), 0, 25);
    const p95 = Math.round(clamp(s.p95 * (0.9 + 0.25 * j), 50, 60000));

    return { ...s, traffic, errorRate: Number(errorRate.toFixed(2)), p95 };
  });

  return NextResponse.json({ environment, window, services });
}
