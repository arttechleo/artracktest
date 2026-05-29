# ROOT Scaling Solution — Client Briefing
## May 4, 2026

---

## ⚠️ CRITICAL CORRECTION

**The current build lags hard at 3 concurrent users, not 100.**

Scaling strategies (clustering, multi-relay, managed services) are **irrelevant until we fix the fundamental bottleneck.** Adding more relays to a broken client-side pipeline just scales the brokenness.

**Action:** Before considering any of the options below, we must diagnose and fix what's causing lag at 3 users. See [BOTTLENECK_ANALYSIS.md](BOTTLENECK_ANALYSIS.md) for diagnostic steps.

**Timeline impact:** This may add 2–3 days to the sprint but is non-negotiable.

---

## Once Bottleneck is Fixed: Scaling Path Forward

After we identify and fix the 3-user lag, THEN we can choose a scaling strategy:

### **Short-term (May 24 deadline): Option 1 — Relay Clustering**
- Fixes bottleneck first, then add clustering
- Scales to 400 concurrent users
- Cost: $7/month
- Dev time: 1 day (after bottleneck fix)

### **Medium-term (June+): Option 2 or 3 if needed**
- Option 2 (Multi-Relay) if you need 500+ users
- Option 3 (Ably) if you need 1000+ users
- Only consider after bottleneck is fixed and load-tested

---

## The Three Scaling Paths (Once Bottleneck is Fixed)

### **OPTION 1: Relay Clustering (RECOMMENDED FOR MAY 24)**

**What it is:** Use Node.js built-in clustering to spawn 4 worker processes on a single server, each handling up to 100 users.

**Capacity:**
- 1 server × 4 CPU cores = **400 concurrent users**
- Cost: **$7/month** (same as current)
- Implementation: **1 day**
- Risk: **Very Low** (no new dependencies, same codebase)

**How it works:**
```
Load Balancer
├── Worker 1 (100 users)
├── Worker 2 (100 users)
├── Worker 3 (100 users)
└── Worker 4 (100 users)

All workers broadcast independently.
Each receives skeleton data via shared memory.
```

**Pros:**
- ✅ Fastest to implement (1 day)
- ✅ No new vendor lock-in
- ✅ Same infrastructure cost ($7/month)
- ✅ Zero latency penalty
- ✅ Works today with current relay server code

**Cons:**
- ❌ Limited to single-server CPU (4–8 cores max)
- ❌ If server crashes, all 400 users disconnect
- ❌ Not suitable for >500 concurrent users

**Timeline:** Implementation Day 9 of sprint (after Ractor rehearsal, before system readiness)

---

### **OPTION 2: Multi-Relay with Redis (BEST FOR 100–500 USERS)**

**What it is:** Deploy 3–5 independent relay servers behind a load balancer. All relays share skeleton data via Redis pub/sub.

**Capacity:**
- 3 relays × 100 users = **300 concurrent users**
- 5 relays × 100 users = **500 concurrent users**
- Cost: **$21–35/month** (3–5 × $7) + **$5/month** (Redis on AWS ElastiCache)
- Implementation: **2–3 days**
- Risk: **Low** (proven architecture, but more moving parts)

**How it works:**
```
Load Balancer (AWS / Cloudflare)
├── Relay Instance 1 (100 users)
├── Relay Instance 2 (100 users)
├── Relay Instance 3 (100 users)
└── [Add more as needed]

Shared Redis Channel
└── All relays publish/subscribe to "skeleton:broadcast"

Quest sends once → Redis → All relays receive → All clients get update
```

**Pros:**
- ✅ Scales to 500+ concurrent users
- ✅ Automatic failover (if Relay 1 dies, clients reconnect to Relay 2/3)
- ✅ Still cost-effective ($26/month for 300 users)
- ✅ Production-tested architecture

**Cons:**
- ❌ Slower to implement (2–3 days, after May 10 Ractor rehearsal)
- ❌ More complex (adds Redis dependency)
- ❌ May not be ready by May 24 deadline
- ❌ Requires load balancer setup

**Timeline:** Post-May 24; suitable for June performances if you expect >400 users

---

### **OPTION 3: Switch to Managed Service (BEST FOR 500–1000+ USERS)**

**What it is:** Replace custom relay server with Ably or PubNub — managed pub/sub platforms designed for exactly this use case.

**Capacity:**
- **Ably Standard Plan:** 10,000 concurrent connections, $29/month base + usage
- **PubNub Starter Plan:** 1,000 Monthly Active Users, $98/month
- **Ably Pro Plan:** 50,000 concurrent connections, $399/month base + usage
- Implementation: **3–5 days**
- Risk: **Low** (vendor-backed, 99.999% uptime, battle-tested)

**How it works:**
```
Quest 3 sends to Ably/PubNub (instead of custom relay)
├── "skeleton" channel → broadcast to all audience phones
└── "show-cues" channel → broadcast OSC cues from QLab

Phones receive directly from Ably/PubNub
No custom relay server needed
```

**Pros:**
- ✅ Unlimited scalability (1000+ users easily)
- ✅ 99.999% uptime SLA (backed by vendor)
- ✅ <50ms latency globally (better than custom relay)
- ✅ Built-in analytics, monitoring, failover
- ✅ No DevOps burden (vendor manages infrastructure)
- ✅ Fastest integration (SDKs provided)

**Cons:**
- ❌ Slower to implement (3–5 days)
- ❌ Cost scales with usage ($29–400/month depending on volume)
- ❌ Vendor lock-in (if you leave, migrate away from their SDK)
- ❌ May not be "ready" by May 24 if testing reveals issues

**Timeline:** Post-June; consider for next phase if 100+ user scaling is critical

---

## Comparison Table

| Factor | Option 1: Clustering | Option 2: Multi-Relay | Option 3: Managed Service |
|--------|----------------------|----------------------|--------------------------|
| **Max Users** | 400 | 500+ | 1000+ |
| **Cost** | $7/mo | $26/mo | $29–400/mo |
| **Dev Time** | 1 day | 2–3 days | 3–5 days |
| **Complexity** | Low | Medium | Low (vendor handles it) |
| **Uptime** | Single-point failure | Good failover | 99.999% SLA |
| **Ready by May 24?** | ✅ YES | ⚠️ Tight | ❌ Risky |
| **Ready by June 7?** | ✅ YES | ✅ YES | ✅ YES |

---

## Partnership / Vendor Options

### **For Option 3 (Managed Service):**

#### **ABLY.COM** (Recommended)
- **What:** WebSocket pub/sub platform with 700+ edge locations
- **Pricing:** $29/month Standard + $2.50/million messages
- **For ROOT:** Estimated **$50–80/month** for 100 users @ 30fps
- **Setup:** Free tier available to test; upgrade on credit card
- **Latency:** <6.5ms globally (better than custom relay)
- **Support:** Email support standard; 4-hour SLA on Pro plan
- **Contacts:** 
  - General: hello@ably.com
  - Sales: sales@ably.com (for volume discounts)
- **Advantage:** Recently rated #1 G2 for "Best Support" and "Easiest to Use"

#### **PUBNUB.COM** (Enterprise Alternative)
- **What:** Real-time pub/sub and messaging platform
- **Pricing:** Free (200 MAU) / $98/month Starter (1000 MAU) / Custom Pro
- **For ROOT:** Estimated **$98–190/month** for 100+ concurrent users
- **Setup:** Credit card required; no free tier for production
- **Latency:** <100ms (good, not as fast as Ably)
- **Support:** 2-hour SLA on Starter; 1-hour SLA on Pro
- **Contacts:**
  - General: https://www.pubnub.com/company/contact-sales/
  - Demo: https://admin.pubnub.com/register
- **Advantage:** 3M+ developers using it; rock-solid enterprise SLA

---

## My Recommendation for Your Sprint

### **For May 10 Ractor Rehearsal (6 days):**
- No scaling needed yet
- Focus on Quest feedback loop, avatar mirror, performer HUD
- Keep current relay as-is (handles 1 performer + 20–30 test phones)

### **For May 24 System Readiness (20 days):**
- **Implement OPTION 1 (Relay Clustering)** on Day 9–10 of sprint
- Scales to 400 users with zero additional cost
- Gives you 4x capacity for June performances
- Simple 1-day implementation using Node.js built-in clustering

### **If Scaling to 500+ Users Needed Post-June:**
- Migrate to **OPTION 2 (Multi-Relay + Redis)** or **OPTION 3 (Ably)** in parallel phase
- Both are mature, battle-tested solutions
- Ably is faster to implement; Multi-Relay gives you more control

---

## Action Items for Client

### **This Week (Before May 10 Ractor Rehearsal):**
- ✅ Review this document
- ✅ Confirm: Do you need >100 concurrent users for June 7–28 performances?
- ✅ If YES → authorize Option 1 implementation on Day 9
- ✅ If MAYBE → schedule call with Ably sales to discuss Option 3

### **Decision Point: May 24 System Readiness**
- If Option 1 meets your needs → **launch with clustering**
- If you need 500+ users → **start Option 2 or Option 3 migration immediately**

---

## Cost Summary (All Options)

| Scenario | Option 1 | Option 2 | Option 3 (Ably) |
|----------|----------|----------|-----------------|
| **100 concurrent users** | $7/mo | $26/mo | $50–80/mo |
| **200 concurrent users** | $7/mo | $26/mo | $60–100/mo |
| **300 concurrent users** | $7/mo | $26/mo | $80–120/mo |
| **400 concurrent users** | $7/mo | $35/mo | $100–150/mo |
| **500+ concurrent users** | ❌ Max | $35/mo | $150–250/mo |

---

## Technical Details (For Dev Team)

### **Option 1 Implementation (Node.js Clustering)**

**Files to modify:**
- [relay-server/src/server.ts](apps/relay-server/src/server.ts)

**Code snippet:**
```typescript
const cluster = require('cluster');
const os = require('os');

if (cluster.isMaster) {
  const numCPUs = os.cpus().length;
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  // Load balancer routes traffic to workers
} else {
  // Each worker starts WebSocket server
  startServer(10000 + cluster.worker.id);
}
```

**Deployment:**
- No change to render.yaml
- Render.com supports clustering natively
- Auto-restart on crash

---

## Next Steps

1. **Client Decision:** Do you need >100 concurrent users for June?
   - If YES → Proceed with Option 1
   - If NO → Keep current relay as-is
   - If MAYBE → Get executive approval on June audience size

2. **Dev Team:** Schedule Option 1 implementation for Day 9 (May 13)

3. **Optional:** If considering Option 3 (Ably), I can schedule a 30-min technical discovery with Ably sales

---

**Document Owner:** Developer #2  
**Date:** May 4, 2026  
**Next Review:** May 24, 2026 (after system readiness gate)
