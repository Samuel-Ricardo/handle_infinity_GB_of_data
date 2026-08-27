# Getting Started Guide

> From zero to streaming in 5 minutes — plus learning paths for deeper mastery

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Quick Start (5 min)](#2-quick-start-5-min)
3. [Understanding What You See](#3-understanding-what-you-see)
4. [Learning Path](#4-learning-path)
5. [Experimentation Guide](#5-experimentation-guide)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. Prerequisites

| Requirement | Minimum | Recommended | Verify |
|-------------|---------|-------------|--------|
| Node.js | 18.0+ | 20+ LTS | `node --version` |
| npm | 8+ | 10+ | `npm --version` |
| Browser | Chrome 89 | Latest | Check Web Streams support |
| OS | Any | Any | Windows/macOS/Linux |

**Check Web Streams support:**

```javascript
// Paste in browser console
console.log(
  typeof ReadableStream,     // "function"
  typeof TransformStream,    // "function"
  typeof TextDecoderStream   // "function"
);
```

If any return `"undefined"`, update your browser.

---

## 2. Quick Start (5 min)

### Step 1: Clone/Navigate

```bash
cd handle_infinity_GB_of_data
```

### Step 2: Install Dependencies

```bash
# Server
cd server
npm install

# Client
cd ../app
npm install
```

### Step 3: Start Both Processes

**Terminal 1 — Server:**
```bash
cd server
npm start
```
Expected output:
```
Server running at http://localhost:3000/
```

**Terminal 2 — Client:**
```bash
cd app
npm start
```
Browser opens automatically at `http://localhost:3001`.

### Step 4: Run the Demo

1. Click **Start** button
2. Watch anime cards appear one-by-one (1 per second — this delay is intentional)
3. Click **Stop** to cancel the stream
4. Check server console — you'll see `Connection was closed :()`, proving cancellation propagated

### Step 5: Observe the Magic

✅ **Server memory stays flat** (check Task Manager / Activity Monitor)  
✅ **Client cancellation stops server work** (see console logs)  
✅ **Data appears incrementally** (not all-at-once)

---

## 3. Understanding What You See

### 3.1 Conceptual Model

```
📦 FILE (1.8MB CSV)
        │
        │ read chunk by chunk (never all at once!)
        ▼
🔄 csvtojson  ──► transforms CSV rows to JSON objects
        │
        ▼
🔀 mapper  ──► picks 3 fields, adds newline
        │
        ▼
🌐 HTTP response  ──► chunked transfer to browser
        │
        ▼
📡 fetch()  ──► lazy byte stream
        │
        ▼
🔤 TextDecoder  ──► bytes → text
        │
        ▼
📋 NDJSON parser  ──► text lines → JSON objects
        │
        ▼
🎨 DOM renderer  ──► objects → HTML cards
        │
        ▼
👁️ YOU  ──► see cards appear one by one
```

### 3.2 The "Aha!" Moment

The crucial insight: **at no point is the entire CSV/JSON in memory**.

- Server reads 64KB at a time
- Parser emits one object at a time
- Network sends a few KB at a time
- Client renders one card at a time
- Old objects are garbage collected

**This is why a 1 TB file works exactly the same as a 1 MB file.**

---

## 4. Learning Path

### Level 1: Observer (30 min)

- [ ] Run the demo successfully
- [ ] Open DevTools → Network tab → watch the streaming request
- [ ] Open server console → watch the counter increments
- [ ] Click Stop → confirm both sides log the abort

### Level 2: Reader (2 hours)

- [ ] Read [`docs/architecture.md`](./architecture.md) sections 1-3
- [ ] Trace the code path in `server/index.js` line by line
- [ ] Trace the code path in `app/index.js` line by line
- [ ] Identify all 4 streams in each file (Readable, 2×Transform, Writable)

### Level 3: Modifier (4 hours)

- [ ] Change `sleep(1000)` to `sleep(100)` — observe speed difference
- [ ] Remove the sleep entirely — observe rendering flood
- [ ] Add a new field to the server's mapper output
- [ ] Render the new field in the card template

### Level 4: Fixer (1 day)

- [ ] Fix the XSS vulnerability (see [`security.md`](./security.md#sec-001))
- [ ] Fix the NDJSON split-chunk bug (see [`patterns.md`](./patterns.md#24-pattern-ndjson-parser-client))
- [ ] Add proper CORS (see [`security.md`](./security.md#sec-002))
- [ ] Add a "records rendered" counter to the UI

### Level 5: Extender (1 week)

- [ ] Add server-side gzip compression
- [ ] Add client-side retry with backoff
- [ ] Add virtual scrolling to handle 100K+ records
- [ ] Add a second endpoint streaming a different dataset

### Level 6: Master (2 weeks)

- [ ] Replace CSV source with a live database cursor
- [ ] Add authentication + authorization
- [ ] Add distributed tracing (OpenTelemetry)
- [ ] Write comprehensive test suite
- [ ] Deploy to production environment

---

## 5. Experimentation Guide

### Experiment 1: Speed Test

**Question:** How fast can the pipeline actually run?

```javascript
// app/index.js — change line:
sleep(1000).then(() => (element.innerHTML += card));
// to:
element.innerHTML += card;  // No delay
```

**Observe:** Rendering becomes bottleneck (~thousands/sec), not network.

### Experiment 2: Batching

**Question:** How does batching improve rendering?

```javascript
let batch = [];
let rafPending = false;

write(record) {
  batch.push(record);
  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(() => {
      const html = batch.map(buildCardHTML).join('');
      element.insertAdjacentHTML('beforeend', html);
      batch = [];
      rafPending = false;
    });
  }
}
```

**Measure:** Open DevTools → Performance → record 10 seconds.

### Experiment 3: Multiple Connections

**Question:** Does the server handle concurrency?

```bash
# Terminal: open 5 concurrent fetches
for i in {1..5}; do 
  curl http://localhost:3000 > /dev/null &
done
```

**Observe:** Server memory scales linearly, all 5 receive full stream.

### Experiment 4: Bigger Data

**Question:** Does the architecture scale to 100MB files?

```bash
# Duplicate the CSV 50x
cd server/data
for /L %i in (1,1,50) do type animeflv.csv >> big.csv
```

Update `filename` in `server/index.js`, restart, and verify:
- Server memory stays constant
- Streaming duration scales linearly

### Experiment 5: Interruption Recovery

**Question:** What happens when network drops?

1. Start stream
2. DevTools → Network → Offline checkbox
3. Watch client error handling
4. Re-enable network
5. Currently: stream dead → **your task: add reconnect**

---

## 6. Troubleshooting

### Problem: "Cannot find module 'csvtojson'"

```bash
cd server
npm install
```

### Problem: Port 3000 already in use

```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# macOS/Linux
lsof -ti:3000 | xargs kill -9
```

### Problem: Browser shows "CORS error"

The server responds with `Access-Control-Allow-Origin: *`, so this shouldn't happen. If it does:
- Check server is running (`curl http://localhost:3000` should respond)
- Check browser console for actual error
- Verify no proxy/firewall interference

### Problem: Cards don't appear

1. Open DevTools Console — look for errors
2. Open Network tab — confirm streaming request is active
3. Check server console — confirm records are being sent
4. Verify `cards` element exists: `document.getElementById('cards')`

### Problem: "fetch is not defined" (Node)

You ran client code in Node. The `app/index.js` is browser-only.

### Problem: `node --watch` unrecognized

Upgrade Node.js to 18.11+:

```bash
node --version  # Should be >= 18.11
```

---

## Next Steps

✅ Completed Level 1? → Read [`architecture.md`](./architecture.md)  
✅ Want to contribute? → Read [`patterns.md`](./patterns.md) + fix an open issue  
✅ Planning production use? → Read [`security.md`](./security.md) **first**  
✅ Curious about performance? → Read [`performance.md`](./performance.md)  
✅ Building UI? → Read [`ux.md`](./ux.md)

---

*Guide by: Avanade Method Team | Last updated: 2026-08-27*