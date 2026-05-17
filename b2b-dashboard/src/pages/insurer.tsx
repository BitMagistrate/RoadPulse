/**
 * Insurer Trigger Feed — surfaces signed parametric flood events.
 *
 * Each row is locally verified with the Ed25519 public key exposed at
 * `/v1/trigger-feed/{policy_id}/pubkey`. Verification runs in the browser via
 * `crypto.subtle` so a downstream smart contract can replicate the exact same
 * check with a stock library. The canonical payload mirrors the bytes the API
 * signs — keys sorted, no whitespace.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api, type TriggerEvent } from "@/lib/api";

const POLICY_ID = "policy_pti_d1_flood_2024";

type VerifyState = "idle" | "pending" | "verified" | "failed" | "unsupported";

function pemToSpki(pem: string): Uint8Array {
  const cleaned = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function canonicalPayload(ev: TriggerEvent): Uint8Array {
  // Matches the backend exactly:
  //   json.dumps({captured_at, confidence, flood_score, hex_id, policy_id},
  //              sort_keys=True, separators=(",", ":"))
  const payload: Record<string, unknown> = {
    captured_at: ev.captured_at,
    confidence: ev.confidence,
    flood_score: ev.flood_score,
    hex_id: ev.hex_id,
    policy_id: ev.policy_id,
  };
  const sorted = Object.keys(payload)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = payload[key];
      return acc;
    }, {});
  return new TextEncoder().encode(JSON.stringify(sorted));
}

async function verifyEvent(ev: TriggerEvent, pubkeyPem: string): Promise<boolean> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("crypto.subtle not available in this environment");
  }
  const spki = pemToSpki(pubkeyPem);
  const key = await subtle.importKey(
    "spki",
    spki as unknown as ArrayBuffer,
    { name: "Ed25519" } as unknown as AlgorithmIdentifier,
    false,
    ["verify"],
  );
  const signature = b64ToBytes(ev.payload_signature);
  const message = canonicalPayload(ev);
  return await subtle.verify(
    { name: "Ed25519" } as unknown as AlgorithmIdentifier,
    key,
    signature as unknown as ArrayBuffer,
    message as unknown as ArrayBuffer,
  );
}

export function InsurerPage() {
  const feed = useQuery({
    queryKey: ["trigger-feed", POLICY_ID],
    queryFn: () => api.triggerFeed(POLICY_ID),
  });
  const pubkey = useQuery({
    queryKey: ["trigger-feed-pubkey", POLICY_ID],
    queryFn: () => api.triggerFeedPubkey(POLICY_ID),
  });

  const events = feed.data?.events ?? [];

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Insurer trigger feed</h2>
          <div className="muted">
            Policy <code>{POLICY_ID}</code> · Ed25519-signed parametric flood events ·
            verify locally
          </div>
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          <button
            type="button"
            className="button secondary"
            disabled={feed.isFetching}
            onClick={() => feed.refetch()}
          >
            {feed.isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      <div className="kpi-grid">
        <Kpi label="Events in window" value={events.length.toString()} />
        <Kpi
          label="Max flood score"
          value={
            events.length
              ? `${(Math.max(...events.map((e) => e.flood_score)) * 100).toFixed(0)}%`
              : "—"
          }
          tone={events.length ? "hazard" : undefined}
        />
        <Kpi
          label="Generated at"
          value={feed.data ? new Date(feed.data.generated_at).toLocaleTimeString("vi-VN") : "—"}
        />
        <Kpi label="Algorithm" value={events[0]?.payload_alg ?? "Ed25519"} />
      </div>

      <div className="card section">
        <h3 style={{ marginTop: 0 }}>Public key (SubjectPublicKeyInfo / PEM)</h3>
        <pre
          style={{
            fontSize: 11,
            background: "var(--rp-surface-muted)",
            padding: 10,
            borderRadius: 8,
            overflowX: "auto",
            margin: 0,
          }}
        >
          {pubkey.isPending ? "fetching public key…" : (pubkey.data ?? pubkey.error?.toString())}
        </pre>
      </div>

      <div className="card section">
        {feed.isPending && <p>Polling trigger feed…</p>}
        {feed.isError && (
          <p style={{ color: "var(--rp-bad)" }}>{(feed.error as Error).message}</p>
        )}
        {feed.data && events.length === 0 && (
          <p className="muted">
            No flood scores above the policy threshold right now — the parametric guard
            is dormant.
          </p>
        )}
        {feed.data && events.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Hex</th>
                <th>Score</th>
                <th>Captured</th>
                <th>Signature</th>
                <th>Verify</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <EventRow
                  key={ev.event_id}
                  event={ev}
                  pubkeyPem={pubkey.data ?? ""}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function EventRow({ event, pubkeyPem }: { event: TriggerEvent; pubkeyPem: string }) {
  const [state, setState] = useState<VerifyState>("idle");
  const [error, setError] = useState<string | null>(null);
  const verify = useMutation({
    mutationFn: () => verifyEvent(event, pubkeyPem),
    onMutate: () => {
      setState("pending");
      setError(null);
    },
    onSuccess: (ok) => setState(ok ? "verified" : "failed"),
    onError: (err) => {
      setError(err instanceof Error ? err.message : String(err));
      setState("unsupported");
    },
  });

  const tone =
    state === "verified"
      ? "good"
      : state === "failed"
      ? "bad"
      : state === "unsupported"
      ? "hazard"
      : "";
  const label =
    state === "idle"
      ? "verify"
      : state === "pending"
      ? "…"
      : state === "verified"
      ? "signature ok"
      : state === "failed"
      ? "signature bad"
      : "unsupported";

  return (
    <tr>
      <td>
        <code>{event.event_id.slice(0, 12)}…</code>
      </td>
      <td>{event.hex_id}</td>
      <td>
        <span
          className={`pill ${
            event.flood_score >= 0.7 ? "bad" : event.flood_score >= 0.4 ? "hazard" : "good"
          }`}
        >
          {(event.flood_score * 100).toFixed(0)}%
        </span>
      </td>
      <td>{new Date(event.captured_at).toLocaleTimeString("vi-VN")}</td>
      <td>
        <code title={event.payload_signature}>{event.payload_signature.slice(0, 16)}…</code>
      </td>
      <td>
        <button
          type="button"
          className="button secondary"
          disabled={!pubkeyPem || verify.isPending}
          onClick={() => verify.mutate()}
        >
          {label}
        </button>
        {tone && (
          <span className={`pill ${tone}`} style={{ marginLeft: 8 }}>
            {state === "verified" ? "OK" : state === "failed" ? "FAIL" : "WARN"}
          </span>
        )}
        {error && (
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
            {error}
          </div>
        )}
      </td>
    </tr>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "hazard";
}) {
  return (
    <div
      className="kpi-card"
      style={tone === "hazard" ? { borderColor: "var(--rp-hazard)" } : undefined}
    >
      <div className="kpi-label">{label}</div>
      <div
        className="kpi-value"
        style={tone === "hazard" ? { color: "var(--rp-hazard)" } : undefined}
      >
        {value}
      </div>
    </div>
  );
}
