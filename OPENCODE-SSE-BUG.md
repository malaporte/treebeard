# OpenCode SSE Heartbeat Memory Leak

## Problem

When an OpenCode server's SSE endpoints (`/global/event` and `/event`) are consumed
through a reverse proxy, OpenCode's memory usage grows unboundedly. The process
eventually consumes all available RAM.

## Root Cause

Both SSE endpoints use `setInterval` to send heartbeat messages every 10 seconds.
The `stream.writeSSE()` call inside the interval callback is **not awaited**:

```ts
// packages/opencode/src/server/routes/global.ts, lines 88-97
const heartbeat = setInterval(() => {
  stream.writeSSE({      // <-- Promise NOT awaited (fire-and-forget)
    data: JSON.stringify({
      payload: { type: "server.heartbeat", properties: {} },
    }),
  })
}, 10_000)
```

The same pattern exists in `server.ts` lines 522-530 for the per-directory `/event` endpoint.

## Mechanism

1. `stream.writeSSE()` internally calls `writer.write()` on a Hono `TransformStream`.
2. `TransformStream`'s writable writer returns a `Promise` that resolves when the
   readable side has consumed the chunk (i.e., when backpressure clears).
3. Because the heartbeat is in a `setInterval` callback, the returned Promise is
   discarded. Each heartbeat creates a new write operation that queues independently.
4. If the downstream consumer (proxy or slow client) applies any backpressure —
   even briefly — the `TransformStream` internal queue grows with each heartbeat.
5. Each queued write holds references to: the encoded chunk (`Uint8Array`), the
   Promise and its resolution callbacks, and Hono's internal writer queue state.
6. At 6 writes/minute, this accumulates thousands of unresolved Promises per hour.
   The objects are small individually but the reference chain prevents GC.

Note: the bus event handler (`await stream.writeSSE(...)`) correctly awaits, so
real events don't contribute to the leak. Only the heartbeat does.

## Reproduction

1. Start `opencode serve`
2. Connect a reverse proxy (e.g., Nginx, Caddy, or a custom `http.request` proxy)
   that consumes `/global/event`
3. Have the proxy apply any form of backpressure (pause reads, slow consumer, etc.)
4. Monitor OpenCode's RSS with `ps -o rss -p <pid>` every 30 seconds
5. Memory will grow linearly with time (proportional to heartbeat interval)

Even without intentional backpressure, Bun's `fetch()` API can create brief stalls
during TCP window adjustments that are enough to start the queue growth.

## Suggested Fix

Replace the `setInterval` + fire-and-forget pattern with a recursive `setTimeout`
that awaits each write before scheduling the next:

```ts
// Replace this:
const heartbeat = setInterval(() => {
  stream.writeSSE({ data: JSON.stringify({ ... }) })
}, 10_000)

// ...
stream.onAbort(() => {
  clearInterval(heartbeat)
  // ...
})

// With this:
let heartbeatTimer: ReturnType<typeof setTimeout> | undefined
const sendHeartbeat = async () => {
  try {
    await stream.writeSSE({
      data: JSON.stringify({
        payload: { type: "server.heartbeat", properties: {} },
      }),
    })
  } catch {
    return  // Stream closed
  }
  heartbeatTimer = setTimeout(sendHeartbeat, 10_000)
}
heartbeatTimer = setTimeout(sendHeartbeat, 10_000)

// ...
stream.onAbort(() => {
  if (heartbeatTimer) clearTimeout(heartbeatTimer)
  // ...
})
```

This ensures:
- Only one heartbeat write is in-flight at a time
- Backpressure from the consumer naturally delays the next heartbeat
- No unbounded Promise/chunk queue accumulation
- Heartbeat timing degrades gracefully under load (slightly longer intervals)

## Affected Files

- `packages/opencode/src/server/routes/global.ts` — `/global/event` endpoint (lines 88-97)
- `packages/opencode/src/server/server.ts` — `/event` endpoint (lines 522-530)

## Workaround (Treebeard bridge)

The Treebeard bridge uses raw TCP sockets (`node:net`) instead of `fetch()` for SSE
endpoints and never applies backpressure (always draining eagerly). This prevents the
upstream queue from growing. Since SSE payloads are tiny (~80 bytes every 10 seconds),
this is safe in practice.

Note: Treebeard also had a separate issue where the spawned OpenCode process's
stdout/stderr pipes were not continuously drained after startup URL detection,
causing Bun's in-process pipe buffers to grow unboundedly. This was fixed by keeping
the stream readers alive for the lifetime of the process (discarding data after the
URL is found).
