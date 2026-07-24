/**
 * Google Cloud Monitoring — Cloud Run metrics for Admin dashboard.
 * Uses ADC on Cloud Run; local fallback via gcloud user token when available.
 */
import { execFileSync } from "node:child_process";
import { GoogleAuth } from "google-auth-library";
import { logger } from "./logger";

export type GcpSeriesPoint = { day: string; value: number; ts: string };
export type GcpMetricSeries = {
  id: string;
  label: string;
  unit: string;
  points: GcpSeriesPoint[];
};

const SCOPES = ["https://www.googleapis.com/auth/monitoring.read"];

function projectId(): string {
  return (
    process.env.GCP_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    "bexo-development"
  );
}

function region(): string {
  return process.env.GOOGLE_CLOUD_REGION || process.env.GCP_REGION || "asia-south1";
}

function serviceName(): string {
  return process.env.CLOUD_RUN_SERVICE || process.env.K_SERVICE || "bexo-api";
}

async function getAccessToken(): Promise<{ token: string; source: string } | null> {
  if (process.env.GCP_ACCESS_TOKEN) {
    return { token: process.env.GCP_ACCESS_TOKEN, source: "env" };
  }
  try {
    const auth = new GoogleAuth({ scopes: SCOPES });
    const client = await auth.getClient();
    const res = await client.getAccessToken();
    if (res.token) return { token: res.token, source: "adc" };
  } catch (err) {
    logger.warn({ err }, "GCP ADC token failed");
  }
  // Local/dev convenience — never shell out in production Cloud Run
  if (!process.env.K_SERVICE && process.env.NODE_ENV !== "production") {
    try {
      const token = execFileSync("gcloud", ["auth", "print-access-token"], {
        encoding: "utf8",
        timeout: 8000,
      }).trim();
      if (token) return { token, source: "gcloud" };
    } catch (err) {
      logger.warn({ err }, "gcloud access token fallback failed");
    }
  }
  return null;
}

type MonitoringPoint = {
  interval?: { startTime?: string; endTime?: string };
  value?: { doubleValue?: number; int64Value?: string; distributionValue?: unknown };
};

function pointValue(p: MonitoringPoint): number {
  if (p.value?.doubleValue != null) return Number(p.value.doubleValue);
  if (p.value?.int64Value != null) return Number(p.value.int64Value);
  return 0;
}

function toDayHour(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 13).replace("T", " ") + "h";
}

async function fetchTimeSeries(opts: {
  token: string;
  filter: string;
  aligner: string;
  reducer?: string;
  alignmentPeriodSec?: number;
  hours?: number;
}): Promise<GcpSeriesPoint[]> {
  const end = new Date();
  const start = new Date(end.getTime() - (opts.hours || 48) * 3600_000);
  const period = opts.alignmentPeriodSec || 3600;
  const params = new URLSearchParams();
  params.set("filter", opts.filter);
  params.set("interval.startTime", start.toISOString());
  params.set("interval.endTime", end.toISOString());
  params.set("aggregation.alignmentPeriod", `${period}s`);
  params.set("aggregation.perSeriesAligner", opts.aligner);
  if (opts.reducer) params.set("aggregation.crossSeriesReducer", opts.reducer);
  params.append("aggregation.groupByFields", "resource.label.service_name");

  const url = `https://monitoring.googleapis.com/v3/projects/${projectId()}/timeSeries?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${opts.token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Monitoring API ${res.status}: ${body.slice(0, 240)}`);
  }
  const json = (await res.json()) as {
    timeSeries?: { points?: MonitoringPoint[] }[];
  };
  const points: GcpSeriesPoint[] = [];
  for (const series of json.timeSeries || []) {
    for (const p of series.points || []) {
      const ts = p.interval?.endTime || p.interval?.startTime || "";
      if (!ts) continue;
      let value = pointValue(p);
      // ALIGN_RATE is per-second — convert to per-hour for readability
      if (opts.aligner === "ALIGN_RATE") value = value * period;
      points.push({
        ts,
        day: toDayHour(ts),
        value: Math.round(value * 1000) / 1000,
      });
    }
  }
  points.sort((a, b) => a.ts.localeCompare(b.ts));
  return points;
}

function runFilter(metricType: string): string {
  const svc = serviceName();
  return (
    `metric.type="${metricType}" ` +
    `resource.type="cloud_run_revision" ` +
    `resource.labels.service_name="${svc}"`
  );
}

export async function loadGcpCloudRunAnalytics(hours = 48): Promise<{
  configured: boolean;
  authSource: string | null;
  projectId: string;
  region: string;
  service: string;
  error: string | null;
  series: GcpMetricSeries[];
  kpis: Record<string, number | string | null>;
  consoleLinks: Record<string, string>;
}> {
  const project = projectId();
  const reg = region();
  const service = serviceName();
  const consoleLinks = {
    metrics: `https://console.cloud.google.com/run/detail/${reg}/${service}/metrics?project=${project}`,
    logs: `https://console.cloud.google.com/run/detail/${reg}/${service}/logs?project=${project}`,
    revisions: `https://console.cloud.google.com/run/detail/${reg}/${service}/revisions?project=${project}`,
    billing: `https://console.cloud.google.com/billing?project=${project}`,
    monitoring: `https://console.cloud.google.com/monitoring/dashboards?project=${project}`,
  };

  const auth = await getAccessToken();
  if (!auth) {
    return {
      configured: false,
      authSource: null,
      projectId: project,
      region: reg,
      service,
      error:
        "GCP credentials unavailable. On Cloud Run grant monitoring.viewer to the runtime SA. Locally run: gcloud auth application-default login",
      series: [],
      kpis: {},
      consoleLinks,
    };
  }

  try {
    const [requests, instances, cpu, latency] = await Promise.all([
      fetchTimeSeries({
        token: auth.token,
        filter: runFilter("run.googleapis.com/request_count"),
        aligner: "ALIGN_RATE",
        reducer: "REDUCE_SUM",
        hours,
      }),
      fetchTimeSeries({
        token: auth.token,
        filter: runFilter("run.googleapis.com/container/instance_count"),
        aligner: "ALIGN_MEAN",
        reducer: "REDUCE_SUM",
        hours,
      }).catch(() =>
        fetchTimeSeries({
          token: auth.token,
          filter: runFilter("run.googleapis.com/container/billable_instance_time"),
          aligner: "ALIGN_RATE",
          reducer: "REDUCE_SUM",
          hours,
        }),
      ),
      fetchTimeSeries({
        token: auth.token,
        filter: runFilter("run.googleapis.com/container/cpu/utilizations"),
        aligner: "ALIGN_MEAN",
        reducer: "REDUCE_MEAN",
        hours,
      }).catch(() => [] as GcpSeriesPoint[]),
      fetchTimeSeries({
        token: auth.token,
        filter: runFilter("run.googleapis.com/request_latencies"),
        aligner: "ALIGN_DELTA",
        reducer: "REDUCE_PERCENTILE_95",
        hours,
      }).catch(() => [] as GcpSeriesPoint[]),
    ]);

    const sum = (pts: GcpSeriesPoint[]) => pts.reduce((s, p) => s + p.value, 0);
    const last = (pts: GcpSeriesPoint[]) => (pts.length ? pts[pts.length - 1]!.value : null);

    return {
      configured: true,
      authSource: auth.source,
      projectId: project,
      region: reg,
      service,
      error: null,
      series: [
        { id: "requests", label: "Requests / hour", unit: "req/h", points: requests },
        { id: "instances", label: "Instances", unit: "count", points: instances },
        { id: "cpu", label: "CPU utilization", unit: "ratio", points: cpu },
        { id: "latency_p95", label: "Latency p95", unit: "ms", points: latency },
      ],
      kpis: {
        requestsLastHour: last(requests),
        requests48hApprox: Math.round(sum(requests)),
        instancesNow: last(instances),
        cpuNow: last(cpu),
        latencyP95Now: last(latency),
      },
      consoleLinks,
    };
  } catch (err) {
    logger.error({ err }, "GCP monitoring fetch failed");
    return {
      configured: false,
      authSource: auth.source,
      projectId: project,
      region: reg,
      service,
      error: (err as Error).message,
      series: [],
      kpis: {},
      consoleLinks,
    };
  }
}
