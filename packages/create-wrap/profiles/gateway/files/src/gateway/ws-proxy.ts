/**
 * Best-effort WebSocket proxy helper — mounts a Hono route that upgrades
 * the incoming connection (via `hono/bun`'s native WebSocket support, same
 * primitive `@donilite/wrap/realtime` uses) and relays frames bidirectionally
 * to/from an upstream WebSocket server using Bun's native `WebSocket` client.
 *
 * This is a STARTING POINT, not a production-hardened proxy. What it does
 * cover: text/binary frame relay both directions, closing one side when the
 * other closes, and surfacing upstream connection failures as a close code
 * on the client side. What it deliberately does NOT cover (flagged here
 * rather than silently left out):
 *
 * - Backpressure: `ws.send()` on either side is fire-and-forget; a slow
 *   consumer on one side isn't propagated as backpressure to the other
 *   (Bun/the browser both buffer, but there's no bound applied here).
 * - Reconnection: if the upstream connection drops, the client connection
 *   is closed too — no automatic upstream reconnect/retry.
 * - Per-message size/rate limits, auth on the upgrade itself (add your own
 *   check, mirroring `RealtimeOptions.authorize` in
 *   `@donilite/wrap/realtime`, before calling `wsProxy()`).
 * - Subprotocol negotiation beyond passing `protocols` through as-is.
 *
 * For anything beyond a quick internal/trusted-network proxy, harden this
 * (or reach for a purpose-built WS proxy) before relying on it in production.
 */
import { createBunWebSocket } from "hono/bun";
import type { ServerWebSocket } from "bun";
import type { MiddlewareHandler } from "hono";
import type { WSContext } from "hono/ws";
import { logger } from "@donilite/wrap";

const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>();

/** `Bun.serve({ websocket })` — combine with any other subprotocol's `websocket` handlers you use. */
export { websocket as wsProxyWebSocketHandlers };

export interface WsProxyOptions {
  /** Upstream WebSocket URL to relay to, e.g. `wss://upstream.example.com/socket`. */
  target: string | ((requestUrl: URL) => string);
  /** Forwarded as the outgoing connection's subprotocols, if any. */
  protocols?: string[];
}

/**
 * Build a Hono route handler that proxies a WebSocket connection.
 *
 * ```ts
 * app.get("/ws-proxy/*", wsProxy({ target: "wss://upstream.example.com" }));
 * const server = Bun.serve({ fetch: app.fetch, websocket: wsProxyWebSocketHandlers, port });
 * ```
 */
export function wsProxy(options: WsProxyOptions): MiddlewareHandler {
  return upgradeWebSocket((c) => {
    const targetUrl =
      typeof options.target === "function"
        ? options.target(new URL(c.req.url))
        : options.target;

    let upstream: WebSocket | undefined;
    // Frames arriving before the upstream socket is OPEN are queued, not
    // dropped — the upstream connection is opened asynchronously.
    const pending: (string | ArrayBuffer)[] = [];
    // Set once onOpen fires — the upstream's event listeners (registered
    // below) need a way to reach the client-side WSContext, which only
    // exists once Hono's onOpen callback runs.
    let clientWs: WSContext<ServerWebSocket> | undefined;

    try {
      upstream = new WebSocket(targetUrl, options.protocols);
      upstream.binaryType = "arraybuffer";

      upstream.addEventListener("open", () => {
        for (const frame of pending.splice(0)) {
          upstream!.send(frame);
        }
      });

      upstream.addEventListener("message", (event) => {
        const data = event.data as string | ArrayBuffer;
        clientWs?.send(data);
      });

      upstream.addEventListener("close", (event) => {
        clientWs?.close(event.code, event.reason);
      });

      upstream.addEventListener("error", (error) => {
        logger.warn("ws-proxy: upstream connection error", { targetUrl }, error);
        clientWs?.close(1011, "upstream error");
      });
    } catch (error) {
      logger.warn("ws-proxy: failed to open upstream connection", { targetUrl }, error);
      upstream = undefined;
    }

    return {
      onOpen: (_event, ws) => {
        clientWs = ws;
        if (!upstream) {
          ws.close(1011, "failed to reach upstream");
        }
      },
      onMessage: (event) => {
        const data = event.data as string | ArrayBuffer;
        if (!upstream || upstream.readyState !== WebSocket.OPEN) {
          pending.push(data);
          return;
        }
        upstream.send(data);
      },
      onClose: (event) => {
        upstream?.close(event.code, event.reason);
      },
      onError: () => {
        logger.warn("ws-proxy: client connection error", { targetUrl });
        upstream?.close();
      },
    };
  });
}
