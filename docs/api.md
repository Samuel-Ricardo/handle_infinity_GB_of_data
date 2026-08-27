# API Reference

> Streaming API specification for the NDJSON anime data service

---

## Table of Contents

1. [Overview](#1-overview)
2. [Endpoints](#2-endpoints)
3. [Data Formats](#3-data-formats)
4. [Client Stream API](#4-client-stream-api)
5. [Server Stream API](#5-server-stream-api)
6. [Error Handling](#6-error-handling)
7. [Lifecycle Events](#7-lifecycle-events)
8. [Integration Examples](#8-integration-examples)

---

## 1. Overview

| Property | Value |
|----------|-------|
| **Base URL** | `http://localhost:3000` |
| **Protocol** | HTTP/1.1 (chunked transfer encoding) |
| **Format** | NDJSON (Newline-Delimited JSON) |
| **Auth** | None (⚠️ add for production) |
| **Rate Limit** | None (⚠️ add for production) |
| **CORS** | `Access-Control-Allow-Origin: *` (⚠️ permissive) |

---

## 2. Endpoints

### 2.1 `GET /`

Streams the entire anime dataset as NDJSON.

#### Request

```http
GET / HTTP/1.1
Host: localhost:3000
Accept: application/x-ndjson
```

#### Response

**Status:** `200 OK`

**Headers:**

| Header | Value | Notes |
|--------|-------|-------|
| `Access-Control-Allow-Origin` | `*` | Wide open — restrict in production |
| `Access-Control-Allow-Methods` | `*` | Supports all methods |
| `Transfer-Encoding` | `chunked` | Implicit for streaming |
| `Content-Type` | *not set* | ⚠️ Should be `application/x-ndjson` |

**Body:** Stream of NDJSON lines (one JSON object per line)

```ndjson
{"title":"Dragon Ball Z","description":"Los Saiyajin...","url_anime":"https://..."}
{"title":"Naruto","description":"Naruto Uzumaki...","url_anime":"https://..."}
{"title":"One Piece","description":"Gol D. Roger...","url_anime":"https://..."}
```

#### Behavior Notes

| Aspect | Detail |
|--------|--------|
| **First byte latency** | < 10ms (streaming starts immediately) |
| **Connection duration** | Until CSV exhausted OR client disconnects |
| **Concurrency** | Each request opens separate file stream (safe for parallel) |
| **Cancellation** | Client disconnect triggers server-side abort |

---

### 2.2 `OPTIONS /`

CORS preflight handler.

#### Request

```http
OPTIONS / HTTP/1.1
Origin: http://localhost:3001
Access-Control-Request-Method: GET
```

#### Response

**Status:** `204 No Content`

```http
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: *
```

---

## 3. Data Formats

### 3.1 NDJSON Specification

**NDJSON** = Newline-Delimited JSON:
- Each line is a complete, valid JSON object
- Lines separated by `\n` (LF)
- No top-level array wrapper
- Allows streaming parse

```
{"a":1}\n{"b":2}\n{"c":3}\n
```

**Why NDJSON over JSON array:**

| JSON Array | NDJSON |
|------------|--------|
| `[{...},{...},...]` | `{...}\n{...}\n{...}` |
| Must read entire payload | Parse each line independently |
| Invalid if truncated | Valid prefix always parseable |
| O(n) memory | O(1) memory per record |

### 3.2 Anime Record Schema

**Source CSV columns (12):**
`title, description, year, type, rate_start, votes, status, followers, episodes, genders, url_anime, image`

**Streamed NDJSON (3 projected fields):**

```typescript
interface AnimeRecord {
  title: string;        // Anime title
  description: string;  // Synopsis (may be long)
  url_anime: string;    // Source URL (animeflv.net)
}
```

**Example record:**

```json
{
  "title": "Dragon Ball Z Especial: Freezer contra el padre de Goku",
  "description": "Los Saiyajin han trabajado muy duro para Freezer. Sin embargo...",
  "url_anime": "https://www3.animeflv.net/anime/dragon-ball-z-especial-1"
}
```

### 3.3 Recommended Schema with Validation (Production)

```typescript
import { z } from 'zod';

const AnimeRecordSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10_000),
  url_anime: z.string().url().startsWith('https://')
});

type AnimeRecord = z.infer<typeof AnimeRecordSchema>;
```

---

## 4. Client Stream API

### 4.1 Public Functions

#### `consumeAPI(signal: AbortSignal): Promise<ReadableStream>`

Establishes HTTP connection and returns processed stream.

```javascript
const abortController = new AbortController();
const stream = await consumeAPI(abortController.signal);
```

**Pipeline internally:**
```
fetch() → response.body → TextDecoderStream → parseNDJSON()
```

**Returns:** `ReadableStream<AnimeRecord>`

---

#### `parseNDJSON(): TransformStream<string, AnimeRecord>`

Creates NDJSON parser. ⚠️ Current implementation has [split-chunk bug](./patterns.md#24-pattern-ndjson-parser-client).

```javascript
const parser = parseNDJSON();
const jsonStream = textStream.pipeThrough(parser);
```

---

#### `appendToHtml(element: HTMLElement): WritableStream<AnimeRecord>`

Creates DOM-rendering sink.

```javascript
const sink = appendToHtml(document.getElementById('cards'));
await stream.pipeTo(sink);
```

**Behavior:**
- Each record appends an `<article>` card to the element
- 1-second artificial delay per record (demo purpose)
- Logs to console on abort

---

### 4.2 Usage Example

```javascript
// Controller setup
let abortController = new AbortController();
const cardsEl = document.getElementById('cards');

// Start streaming
async function start() {
  try {
    const stream = await consumeAPI(abortController.signal);
    await stream.pipeTo(appendToHtml(cardsEl), {
      signal: abortController.signal
    });
  } catch (err) {
    if (err.name !== 'AbortError') throw err;
  }
}

// Stop streaming
function stop() {
  abortController.abort();
  abortController = new AbortController();  // Fresh for next run
}
```

---

## 5. Server Stream API

### 5.1 Pipeline Composition

```javascript
Readable.toWeb(createReadStream(filename))       // Source
  .pipeThrough(Transform.toWeb(csvtojson({...}))) // Parse CSV
  .pipeThrough(new TransformStream({...}))        // Map → NDJSON
  .pipeTo(Writable.toWeb(response), { signal });  // Sink
```

### 5.2 Configuration Constants

| Constant | Value | Location | Purpose |
|----------|-------|----------|---------|
| `PORT` | `3000` | `server/index.js:11` | HTTP listen port |
| `filename` | `./data/animeflv.csv` | `server/index.js:24` | Data source |
| `headers` | `['title','description','url_anime']` | `server/index.js:33` | CSV column mapping |

### 5.3 Signal Handling

```javascript
request.once('close', () => {
  abortController.abort();     // Cancel upstream work
});
```

| Signal Trigger | Effect |
|----------------|--------|
| Client disconnect | File stream closed, response ended |
| Parse error | Pipeline errors, connection closed |
| EOF | Normal completion, connection closed |

---

## 6. Error Handling

### 6.1 Server Error Responses

The current implementation **does not send structured errors to the client**. Errors are logged server-side; the connection simply closes.

| Error Type | Server Behavior | Client Sees |
|------------|-----------------|-------------|
| File not found | Log + thrown, connection hangs | Fetch hangs/aborts |
| CSV parse error | Log + abort | Stream terminates |
| Client disconnect | Clean abort | (n/a) |
| Unknown error | `console.error({error})` | Connection close |

### 6.2 Recommended Error Response Format (Production)

Switch to an error envelope mid-stream is impossible in NDJSON; instead:

1. **Pre-stream checks** → Fail with `4xx/5xx` before streaming starts
2. **Mid-stream errors** → Inject error record with sentinel field:

```ndjson
{"title":"..."}
{"title":"..."}
{"__error__":true,"code":"PARSE_PARTIAL","message":"Row 4521 malformed"}
{"title":"..."}
```

3. **Fatal mid-stream** → Terminate connection with trailer headers (HTTP/1.1 trailers)

### 6.3 Client Error Types

```javascript
try {
  await stream.pipeTo(sink);
} catch (error) {
  if (error.name === 'AbortError') {
    // User clicked stop — intentional
  } else if (error instanceof SyntaxError) {
    // JSON.parse failure — malformed server data
  } else if (error instanceof TypeError) {
    // Network failure — server unreachable
  } else {
    // Unknown
  }
}
```

---

## 7. Lifecycle Events

### 7.1 Full Request Lifecycle

```
CLIENT                          SERVER
  │                               │
  │────── GET / ─────────────────▶│
  │                               │── open file stream
  │                               │── attach csvtojson
  │◀───── 200 + chunked ──────────│── start piping
  │                               │
  │── render card 1 ◀─────────────│── record 1
  │── render card 2 ◀─────────────│── record 2
  │           ...                 │      ...
  │                               │
  │── [user clicks STOP]          │
  │── abort ─▶ socket close ─────▶│── request.close fires
  │                               │── abortController.abort()
  │                               │── file stream closed
  │                               │── response.end()
  │                               │
  ▼                               ▼
```

### 7.2 Stream Events (Web Streams)

| Event | When | How to Observe |
|-------|------|----------------|
| `start` | Stream constructed | Constructor callback |
| `pull` | Consumer requests data | `pull()` in underlying source |
| `enqueue` | Chunk available | After `controller.enqueue()` |
| `transform` | Each chunk through Transform | `transform()` method |
| `write` | Each chunk into Writable | `write()` method |
| `close` | Normal completion | `close()` callback / `pipeTo` resolves |
| `abort` | Cancellation | `abort()` callback / `pipeTo` rejects with `AbortError` |
| `error` | Failure | Rejected promise |

---

## 8. Integration Examples

### 8.1 Vanilla JavaScript (Current Implementation)

```javascript
const controller = new AbortController();
fetch('http://localhost:3000', { signal: controller.signal })
  .then(res => res.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(parseNDJSON())
    .pipeTo(myWritableSink)
  );
```

### 8.2 With `for await...of` (Alternative Consumption)

```javascript
const response = await fetch('http://localhost:3000');
const stream = response.body
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(parseNDJSON());

for await (const record of stream) {
  console.log(record.title);
  // Manual per-record processing
}
```

### 8.3 Node.js Client

```javascript
import { fetch } from 'undici';

const response = await fetch('http://localhost:3000');
for await (const chunk of response.body) {
  // Process Buffer chunks
}
```

### 8.4 With Retry + Backoff

```javascript
import pRetry from 'p-retry';

await pRetry(
  () => consumeAPI(controller.signal),
  { retries: 3, minTimeout: 1000, factor: 2 }
);
```

### 8.5 React Integration Sketch

```jsx
function useAnimeStream() {
  const [animes, setAnimes] = useState([]);
  const controllerRef = useRef(new AbortController());

  useEffect(() => {
    (async () => {
      const stream = await consumeAPI(controllerRef.current.signal);
      await stream.pipeTo(new WritableStream({
        write(record) {
          setAnimes(prev => [...prev, record]);
        }
      }));
    })();
    
    return () => controllerRef.current.abort();
  }, []);

  return animes;
}
```

---

## Appendix A: HTTP Semantics Quick Reference

| Code | Used Here | Meaning |
|------|-----------|---------|
| 200 | ✅ On stream start | OK, streaming begins |
| 204 | ✅ On OPTIONS | No content (preflight) |
| 404 | Should add | File not found |
| 500 | Should add | Internal server error |
| 503 | Should add | Server overloaded |

## Appendix B: Headers Checklist for Production

```
✔ Access-Control-Allow-Origin: https://yourapp.com
✔ Content-Type: application/x-ndjson
✔ Cache-Control: no-cache
✔ X-Content-Type-Options: nosniff
✔ X-Accel-Buffering: no           (disable Nginx buffering)
✔ Connection: keep-alive
```

---

*Specification by: @joao-pm + @wilson-architect | Avanade Method | Phases 2-3*