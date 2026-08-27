# Streaming Patterns Catalog

> Complete catalog of stream patterns implemented in this project, with usage guidance and production-ready alternatives

---

## Table of Contents

1. [Source Patterns](#1-source-patterns)
2. [Transform Patterns](#2-transform-patterns)
3. [Sink Patterns](#3-sink-patterns)
4. [Lifecycle Patterns](#4-lifecycle-patterns)
5. [Interop Patterns](#5-interop-patterns)
6. [Flow Control Patterns](#6-flow-control-patterns)
7. [Pattern Anti-Patterns](#7-pattern-anti-patterns)
8. [Production Hardening Recipes](#8-production-hardening-recipes)

---

## 1. Source Patterns

### 1.1 Pattern: File Stream Source (Server)

**Context:** Read arbitrarily large files without loading into memory.

```javascript
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';

// Node stream → Web stream conversion
const webStream = Readable.toWeb(
  createReadStream('./data/animeflv.csv')
);
```

**Why it works:**
- `createReadStream` reads in 64KB chunks by default
- `Readable.toWeb()` wraps Node stream with Web Streams API
- Backpressure propagates from Web stream consumer back to file reader

**When to use:**
- File size > available RAM
- One-pass processing (no random access needed)
- Sequential I/O bound workloads

**Production variant:**

```javascript
// With error recovery and metrics
const fileSource = new ReadableStream({
  async start(controller) {
    const stream = createReadStream(path, {
      highWaterMark: 64 * 1024,  // Tune chunk size
      encoding: null             // Keep as Buffer
    });
    
    stream.on('data', chunk => {
      metrics.bytesRead += chunk.length;
      controller.enqueue(chunk);
    });
    stream.on('end', () => controller.close());
    stream.on('error', err => controller.error(err));
  },
  
  cancel(reason) {
    stream.destroy();  // Clean up file handle
  }
});
```

---

### 1.2 Pattern: HTTP Response Source (Client)

**Context:** Consume server stream in browser.

```javascript
const response = await fetch('http://localhost:3000', {
  signal: abortController.signal    // ← Cancellation token
});

const stream = response.body;  // ReadableStream<Uint8Array>
```

**Why it works:**
- `fetch` returns immediately after headers
- `response.body` lazily streams bytes as they arrive
- Signal propagates cancellation to underlying TCP connection

**When to use:**
- Server-Sent Events alternative
- Large payload downloads
- Real-time data feeds

---

## 2. Transform Patterns

### 2.1 Pattern: CSV-to-JSON Bridge (Server)

**Context:** Parse CSV as stream (not batch).

```javascript
import csvtojson from 'csvtojson';
import { Transform } from 'node:stream';

const csvTransform = Transform.toWeb(
  csvtojson({
    headers: ['title', 'description', 'url_anime']  // Map columns
  })
);
```

**Why it works:**
- csvtojson emits one JSON object per CSV row
- Operates as Transform: input chunk → zero or more outputs
- Header mapping provides schema control

**⚠️ Hidden complexity:** csvtojson emits Buffers, not strings — the mapper stage must handle conversion:

```javascript
new TransformStream({
  async transform(jsonLine, controller) {
    // jsonLine arrives as Buffer/TypedArray
    const data = JSON.parse(Buffer.from(jsonLine));
    // ...
  }
});
```

---

### 2.2 Pattern: Field Mapping / Projection (Server)

**Context:** Enrich, filter, or reshape records mid-stream.

```javascript
new TransformStream({
  async transform(jsonLine, controller) {
    const data = JSON.parse(Buffer.from(jsonLine));
    
    // Projection: select subset of fields
    const mapped = JSON.stringify({
      title: data.title,
      description: data.description,
      url_anime: data.url_anime
    });
    
    controller.enqueue(mapped + '\n');  // NDJSON delimiter
  }
})
```

**Pattern benefits:**
- Bandwidth reduction (only needed fields)
- Schema contract enforcement
- Decouples storage schema from API schema

**Production variant with validation:**

```javascript
import { z } from 'zod';

const AnimeSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000),
  url_anime: z.string().url()
});

new TransformStream({
  async transform(jsonLine, controller) {
    try {
      const raw = JSON.parse(Buffer.from(jsonLine));
      const valid = AnimeSchema.parse(raw);     // Throws on invalid
      controller.enqueue(JSON.stringify(valid) + '\n');
    } catch (err) {
      // Route to dead-letter queue instead of failing
      deadLetterStream.write({ raw: jsonLine, error: err });
    }
  }
});
```

---

### 2.3 Pattern: Byte-to-Text Decoding (Client)

**Context:** Convert raw bytes to strings incrementally.

```javascript
response.body
  .pipeThrough(new TextDecoderStream('utf-8'))
```

**Why it works:**
- Handles multi-byte UTF-8 characters split across chunks
- Maintains decoder state internally
- Standard web platform primitive

**Character boundary safety:**
```
Chunk 1: bytes for "Hell" + partial bytes for "o" (2-byte char)
Chunk 2: remaining bytes of "o" + " World"
TextDecoderStream: emits "Hello World" correctly
```

---

### 2.4 Pattern: NDJSON Parser (Client)

**Context:** Parse newline-delimited JSON from text stream.

**Current implementation (naive):**

```javascript
function parseNDJSON() {
  return new TransformStream({
    transform(chunk, controller) {
      for (const item of chunk.split('\n')) {
        if (!item.length) continue;
        try {
          controller.enqueue(JSON.parse(item));
        } catch (error) {
          controller.error(error);  // ⚠️ Fails on split JSON
        }
      }
    }
  });
}
```

**🚨 Problem:** Network chunks are arbitrary; JSON objects can split:

```
Chunk A: '{"title":"Dragon Ba'
Chunk B: 'll Z"}\n{"title":"Naruto"}\n'

.split('\n') produces ['{"title":"Dragon Ba', 'll Z"}', ...]
JSON.parse('{"title":"Dragon Ba') → SyntaxError → stream dies
```

**✅ Production-grade implementation:**

```javascript
function parseNDJSON() {
  let buffer = '';
  
  return new TransformStream({
    transform(chunk, controller) {
      buffer += chunk;
      
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        
        if (!line.trim()) continue;
        
        try {
          controller.enqueue(JSON.parse(line));
        } catch (error) {
          // Skip malformed line, don't kill stream
          console.warn('Skipping malformed NDJSON line:', error);
        }
      }
    },
    
    flush(controller) {
      // Handle trailing data without newline
      if (buffer.trim()) {
        try {
          controller.enqueue(JSON.parse(buffer));
        } catch (error) {
          console.warn('Trailing incomplete JSON:', error);
        }
      }
    }
  });
}
```

---

## 3. Sink Patterns

### 3.1 Pattern: HTTP Response Sink (Server)

**Context:** End pipeline by writing to HTTP response.

```javascript
import { Writable } from 'node:stream';

pipeline.pipeTo(
  Writable.toWeb(response),
  { signal: abortController.signal }
);
```

**Pattern details:**
- Node `response` object is a Writable stream
- `.toWeb()` exposes it as Web WritableStream
- Signal allows upstream cancellation on client disconnect

---

### 3.2 Pattern: DOM Writer Sink (Client)

**Context:** Render stream data progressively to UI.

**Current implementation:**

```javascript
function appendToHtml(element) {
  return new WritableStream({
    write({ title, description, url_anime }) {
      const card = `
        <article>
          <h3>[${++counter}] ${title}</h3>
          <p>${description.slice(0, 100)}</p>
          <a href="${url_anime}">Link</a>
        </article>
      `;
      sleep(1000).then(() => element.innerHTML += card);
    },
    
    abort(reason) {
      console.log('Aborted', reason);
    }
  });
}
```

**✅ Secure + efficient production version:**

```javascript
function appendToHtml(container) {
  const fragment = document.createDocumentFragment();
  let batchSize = 0;
  const BATCH_LIMIT = 50;
  
  return new WritableStream({
    write({ title, description, url_anime }) {
      // Safe DOM construction — no innerHTML injection
      const article = document.createElement('article');
      const h3 = document.createElement('h3');
      h3.textContent = `[${++counter}] ${title}`;           // textContent = safe
      const p = document.createElement('p');
      p.textContent = description.slice(0, 100);
      const a = document.createElement('a');
      a.href = new URL(url_anime).href;                     // Validated URL
      a.textContent = "Here's why";
      
      article.append(h3, p, a);
      fragment.appendChild(article);
      
      // Batch DOM mutations for performance
      if (++batchSize >= BATCH_LIMIT) {
        container.appendChild(fragment.cloneNode(true));
        batchSize = 0;
      }
    },
    
    close() {
      if (batchSize > 0) container.appendChild(fragment);
    }
  });
}
```

**Improvements:**
| Aspect | Before | After |
|--------|--------|-------|
| XSS risk | `innerHTML` | `textContent` ✅ |
| Reflows | Every item (O(n²)) | Batched every 50 ✅ |
| URL safety | Raw string | `URL` validation ✅ |
| Memory | Unbounded DOM growth | Batching control ✅ |

---

## 4. Lifecycle Patterns

### 4.1 Pattern: Abort Signal Propagation

**Context:** Cooperative cancellation across async boundaries.

```javascript
// Client-side
let abortController = new AbortController();

stopBtn.addEventListener('click', () => {
  abortController.abort();
  console.log('Aborting...');
  abortController = new AbortController();  // Fresh for next run
});
```

```javascript
// Server-side
createServer(async (request, response) => {
  const abortController = new AbortController();
  
  request.once('close', () => {
    abortController.abort();              // Client gone → stop work
  });
  
  await pipeline.pipeTo(sink, {
    signal: abortController.signal        // Bind to pipeline
  });
});
```

**Signal flow:**

```
[User clicks Stop]
        │
        ▼
[abortController.abort()]
        │
        ├──► fetch() rejects
        ├──► pipeTo() cancels
        │        │
        │        └──► Transform.flush() called
        │        └──► Source.cancel() called
        │
        └──► Server: file stream closed
             └──► response.end()
```

### 4.2 Pattern: Controller Reset for Reconnection

```javascript
let abortController = new AbortController();

startBtn.addEventListener('click', async () => {
  try {
    const reader = await consumeAPI(abortController.signal);
    await reader.pipeTo(appendToHtml(cards), {
      signal: abortController.signal
    });
  } catch (error) {
    if (!error.message.includes('abort')) throw error;
  }
});
```

**Key insight:** AbortController is **single-use**. After abort, must create new instance for subsequent operations.

---

## 5. Interop Patterns

### 5.1 Node ↔ Web Stream Bridge Matrix

| Direction | API | Use Case |
|-----------|-----|----------|
| Node Readable → Web | `Readable.toWeb(nodeStream)` | File source, DB cursor |
| Web Readable → Node | `Readable.fromWeb(webStream)` | Pipe to Node-only sinks |
| Node Transform → Web | `Transform.toWeb(nodeTransform)` | csvtojson integration |
| Node Writable → Web | `Writable.toWeb(nodeWritable)` | HTTP response, file write |

### 5.2 Full Bridge Example

```javascript
// Chain: Node source → Web transform → Web transform → Node sink
import { Readable, Transform, Writable } from 'node:stream';

await Readable.toWeb(nodeReadable)              // Bridge 1
  .pipeThrough(Transform.toWeb(csvParser))      // Bridge 2
  .pipeThrough(new TransformStream({...}))      // Native web
  .pipeTo(Writable.toWeb(httpResponse));        // Bridge 3
```

**Performance note:** Each bridge has a small overhead. For hot paths, stay in one stream paradigm per pipeline section.

---

## 6. Flow Control Patterns

### 6.1 Pattern: Simulated Slow Consumer

**Purpose:** Demonstrate backpressure; throttle render rate.

```javascript
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

new WritableStream({
  write(data) {
    sleep(1000).then(() => render(data));
    // ⚠️ Not awaited → fire-and-forget → NO backpressure!
  }
});
```

**✅ Correct backpressure-respecting version:**

```javascript
new WritableStream({
  async write(data) {
    render(data);
    await sleep(100);      // Await = upstream waits
    // OR: return sleep(100).then(() => render(data));
  }
});
```

### 6.2 Pattern: Batched Rendering (Commented in Code)

```javascript
let elementCounter = 0;

write(data) {
  const card = buildCard(data);
  
  if (++elementCounter > 20) {
    element.innerHTML = card;   // Reset viewport
    elementCounter = 0;
    return;
  }
  // ... normal accumulation
}
```

**Use case:** Infinite scroll with bounded DOM — keeps last N items visible, prevents memory growth.

---

## 7. Pattern Anti-Patterns

### ❌ Anti-Pattern 1: Unbuffered Line Splitting

```javascript
// DON'T
chunk.split('\n').forEach(line => JSON.parse(line));

// DO
buffer += chunk;
const lines = extractCompleteLines(buffer);
lines.forEach(line => tryParse(line));
```

### ❌ Anti-Pattern 2: Fire-and-Forget Sink

```javascript
// DON'T — breaks backpressure
write(data) { asyncRender(data); }

// DO — return the promise
write(data) { return asyncRender(data); }
```

### ❌ Anti-Pattern 3: innerHTML with Untrusted Data

```javascript
// DON'T — XSS
el.innerHTML += `<h3>${userData.title}</h3>`;

// DO — safe text insertion
const h3 = document.createElement('h3');
h3.textContent = userData.title;
el.appendChild(h3);
```

### ❌ Anti-Pattern 4: AbortController Reuse

```javascript
// DON'T — signal is spent after first abort
controller.abort();
fetch(url, { signal: controller.signal });  // Immediately aborted!

// DO — fresh controller per operation
controller = new AbortController();
fetch(url, { signal: controller.signal });
```

---

## 8. Production Hardening Recipes

### 8.1 Resilient NDJSON Pipeline

```javascript
async function createRobustPipeline(url, sink, signal) {
  const response = await fetch(url, { signal });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  return response.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new BufferedLineStream())        // Fix split chunks
    .pipeThrough(new SafeJsonParseStream())       // Skip bad lines
    .pipeThrough(new ValidationStream(schema))    // Schema check
    .pipeThrough(new MetricsStream())             // Observability
    .pipeTo(sink, { signal });
}
```

### 8.2 Server with Graceful Shutdown

```javascript
const server = createServer(handler);
const connections = new Set();

server.on('connection', conn => {
  connections.add(conn);
  conn.on('close', () => connections.delete(conn));
});

process.on('SIGTERM', async () => {
  server.close();                          // Stop accepting
  
  // Drain existing with timeout
  await Promise.race([
    Promise.all([...connections].map(c => drainConnection(c))),
    sleep(10_000)
  ]);
  
  connections.forEach(c => c.destroy());   // Force close laggards
  process.exit(0);
});
```

### 8.3 Client Reconnect with Backoff

```javascript
async function streamWithRetry(url, sink, maxRetries = 5) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await consumeAndRender(url, sink);
    } catch (error) {
      if (error.name === 'AbortError') return;  // Intentional
      
      const delay = Math.min(1000 * 2 ** attempt, 30_000);
      console.warn(`Retry ${attempt + 1} in ${delay}ms`);
      await sleep(delay);
    }
  }
  throw new Error('Max retries exceeded');
}
```

---

## Pattern Summary Table

| Pattern | Purpose | Complexity | Production Ready? |
|---------|---------|------------|-------------------|
| File stream source | Memory-safe file reading | Low | ✅ Yes |
| HTTP body source | Network streaming | Low | ✅ Yes |
| CSV transform | Structured parsing | Medium | ✅ Yes |
| Field mapper | Data shaping | Low | ⚠️ Add validation |
| NDJSON parser | Message framing | Medium | ❌ Needs line buffer |
| TextDecoder | Byte→string | Low | ✅ Yes |
| DOM sink | Progressive render | Medium | ❌ Needs batching + safety |
| Abort propagation | Cancellation | Low | ✅ Yes |
| Backpressure | Flow control | Medium | ⚠️ Currently broken |

---

*Analysis by: @tiago-dev | Avanade Method | Phase 4: Implementation Patterns*