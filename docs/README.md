# Documentation Index

> Navigation hub for all project documentation

---

## 📚 Documentation Map

```
docs/
├── 📘 README (this file)        → Navigation index
├── 🚀 getting-started.md        → Quick start + learning path
├── 🏗️ architecture.md           → System design deep dive
├── 🎨 patterns.md               → Implementation patterns catalog
├── 🔌 api.md                    → API reference & integration
├── 🛡️ security.md               → Security audit + fixes
├── ⚡ performance.md            → Benchmarks + scalability
└── 🎯 ux.md                     → UX/a11y review
```

---

## 🎯 By Role — Where to Start

### 👨‍💻 Developer (implementing features)

1. [`getting-started.md`](./getting-started.md) — Level 1 & 2
2. [`patterns.md`](./patterns.md) — All patterns, focus on #7 (anti-patterns)
3. [`security.md`](./security.md) — Critical findings SEC-001, SEC-002
4. [`architecture.md`](./architecture.md) — Section 4 (pipeline architecture)

### 🏛️ Architect (system design)

1. [`architecture.md`](./architecture.md) — Complete document
2. [`performance.md`](./performance.md) — Scalability sections 6-7
3. [`patterns.md`](./patterns.md) — Section 8 (production hardening)
4. [`security.md`](./security.md) — Threat model

### 🔍 QA Engineer (testing & review)

1. [`security.md`](./security.md) — Complete audit
2. [`performance.md`](./performance.md) — Benchmark methodology §8
3. [`ux.md`](./ux.md) — Testing checklist §8
4. [`api.md`](./api.md) — Error handling §6

### 🎨 UX Designer

1. [`ux.md`](./ux.md) — Complete review
2. [`getting-started.md`](./getting-started.md) — User journey context
3. [`api.md`](./api.md) — Understand data constraints

### 📊 Product Manager

1. [`getting-started.md`](./getting-started.md) — Demo flow
2. [`performance.md`](./performance.md) — Executive summary §1
3. [`security.md`](./security.md) — Executive summary
4. [`ux.md`](./ux.md) — Executive summary

### 🚀 DevOps / SRE

1. [`performance.md`](./performance.md) — Scalability §6, optimizations §7
2. [`security.md`](./security.md) — Production checklist
3. [`architecture.md`](./architecture.md) — Horizontal scaling §8
4. [`api.md`](./api.md) — Health check requirements

### 🎓 Student / Learner

1. [`getting-started.md`](./getting-started.md) — Full learning path
2. [`patterns.md`](./patterns.md) — Learn Web Streams patterns
3. [`architecture.md`](./architecture.md) — See the big picture
4. Experiment — modify code, break things, learn

---

## 📖 By Task — Quick Links

### "I want to run the demo"
→ [`getting-started.md`](./getting-started.md#2-quick-start-5-min)

### "I want to understand Web Streams"
→ [`patterns.md`](./patterns.md) + [`architecture.md`](./architecture.md#4-stream-pipeline-architecture)

### "I want to fix the security issues"
→ [`security.md`](./security.md#remediation-priority-matrix)

### "I want to improve performance"
→ [`performance.md`](./performance.md#7-optimization-recommendations)

### "I want to add a feature"
→ [`patterns.md`](./patterns.md#8-production-hardening-recipes) + [`api.md`](./api.md#8-integration-examples)

### "I want to deploy to production"
→ [`security.md`](./security.md#security-checklist-for-production) + [`performance.md`](./performance.md#6-scalability-limits)

### "I want to test the code"
→ [`ux.md`](./ux.md#8-testing-checklist) + [`performance.md`](./performance.md#8-benchmark-methodology)

### "I found a bug"
→ [`security.md`](./security.md) + [`patterns.md`](./patterns.md#7-pattern-anti-patterns) (check if known)

---

## 🔑 Key Concepts Cross-Reference

| Concept | Primary Doc | Also See |
|---------|-------------|----------|
| **Web Streams API** | `patterns.md` §1-3 | `architecture.md` §4 |
| **Backpressure** | `architecture.md` §5 | `patterns.md` §6 |
| **AbortController** | `patterns.md` §4.1 | `architecture.md` §6 |
| **NDJSON format** | `api.md` §3.1 | `patterns.md` §2.4 |
| **Node↔Web interop** | `patterns.md` §5 | `architecture.md` §4.1 |
| **XSS prevention** | `security.md` SEC-001 | `ux.md` §7.3 |
| **CORS config** | `security.md` SEC-002 | `api.md` Appendix B |
| **Virtual scrolling** | `ux.md` §4.2 | `performance.md` §2.2 |
| **Compression** | `performance.md` §7.4 | `patterns.md` §8 |
| **Horizontal scaling** | `architecture.md` §8.2 | `performance.md` §6.2 |

---

## 📊 Document Statistics

| Document | Size | Reading Time | Depth |
|----------|------|--------------|-------|
| `getting-started.md` | ~4 KB | 10 min | Beginner |
| `architecture.md` | ~12 KB | 30 min | Advanced |
| `patterns.md` | ~14 KB | 35 min | Intermediate-Advanced |
| `api.md` | ~11 KB | 25 min | Intermediate |
| `security.md` | ~9 KB | 20 min | Intermediate |
| `performance.md` | ~11 KB | 25 min | Advanced |
| `ux.md` | ~12 KB | 25 min | Intermediate |
| **Total** | **~73 KB** | **~3 hours** | Full mastery |

---

## 🔄 Documentation Maintenance

### Update Triggers

Update docs when:
- [ ] New pattern introduced → `patterns.md`
- [ ] Architecture change → `architecture.md` + ADR
- [ ] Breaking API change → `api.md` + version bump
- [ ] Security finding → `security.md` + CVE reference
- [ ] Performance regression → `performance.md` + benchmark
- [ ] UX change → `ux.md` + screenshots

### Review Cadence

| Document | Review Frequency | Owner Role |
|----------|------------------|------------|
| Security | After each dependency update | QA |
| Performance | Quarterly + before releases | Architect |
| UX | After each UI change | UX Designer |
| API | After each endpoint change | PM + Dev |
| All | Annual full review | Team |

---

## 🤝 Contributing to Docs

### Style Guide

- **Headings:** Sentence case, no trailing punctuation
- **Code blocks:** Always specify language (` ```javascript `)
- **Tables:** Use for comparisons, matrices, inventories
- **Diagrams:** Mermaid for flows, ASCII for layouts
- **Links:** Relative paths within docs/
- **Emojis:** Section markers only (📘 🚀 🏗️ 🎨 🔌 🛡️ ⚡ 🎯)

### Process

1. Edit the relevant doc
2. Update cross-references if structure changed
3. Update this index if adding/removing docs
4. Update main README.md if affecting overview
5. Commit with `docs(scope): description` convention

---

*Index maintained by: Avanade Method Team | Last updated: 2026-08-27*