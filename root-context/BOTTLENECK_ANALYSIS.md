# Bottleneck Analysis & Diagnostic Plan
## May 4, 2026 — URGENT

**Status:** Build lags hard at 3 concurrent users (expected to handle 100)

---

## Symptom

- 1 user: smooth
- 2 users: starting to lag
- 3+ users: noticeable frame rate drop / latency spike

**Suspected causes (in order of likelihood):**

1. **Relay server broadcasting inefficiency** (O(n) loop with no backpressure)
2. **Three.js avatar rendering** (high poly count, expensive shader, no LOD)
3. **Network saturation** (WiFi 6 router, competing traffic)
4. **WebSocket serialization** (JSON.stringify blocking event loop)
5. **8th Wall WebAR pipeline** (too many cameras, expensive physics)

---

## Diagnostic Steps (Priority Order)

### **Step 1: Identify Where Lag Lives (15 mins)**

**On relay server:**
```bash
# Monitor CPU/memory while 3 users connect
while true; do
  curl -s https://root-relay.onrender.com/metrics | jq '.relay_cpu_usage, .relay_memory_usage'
  sleep 1
done
```
- If CPU > 40% → relay is the bottleneck
- If CPU < 20% → lag is client-side (Three.js / network)

**On test phone (Chrome DevTools):**
1. Open https://audience-app-url on 3 different phones
2. F12 → Performance tab → Record 5 seconds
3. Look for:
   - FPS drop (should stay 60fps, check if drops to 30fps)
   - Long tasks (>100ms) blocking render
   - WebSocket message frequency (should be 30 msgs/sec per skeleton)

**Expected findings:**
- Relay CPU: ~10–20% per user (linear scaling)
- Phone FPS: 60fps → 30fps at 3 users (halved)
- WebSocket: 30 msgs/sec from relay (not spiking)

---

### **Step 2: Measure Relay Message Throughput (10 mins)**

**Add console logging to relay:**
```typescript
// relay-server/src/server.ts, in broadcastToRole()
const startTime = Date.now();
for (const client of clients.values()) {
  if (client.role === 'audience' && client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(data);
  }
}
const elapsed = Date.now() - startTime;
if (elapsed > 50) {
  console.warn(`[RELAY] Broadcast to ${clients.size} clients took ${elapsed}ms`);
}
```

**Expected:** <10ms to broadcast to 3 clients
- If >50ms → relay is serialization-bound (backpressure fix needed)

---

### **Step 3: Measure Phone Render Performance (10 mins)**

**Add to GhostAvatar.ts:**
```typescript
private frameCount = 0;
private lastFrameTime = Date.now();

update() {
  this.frameCount++;
  const now = Date.now();
  if (now - this.lastFrameTime >= 1000) {
    const fps = this.frameCount;
    console.log(`[AVATAR] FPS: ${fps}, Poly count: ?, Texture VRAM: ?MB`);
    this.frameCount = 0;
    this.lastFrameTime = now;
  }
  // ... rest of update
}
```

**Also measure avatar complexity:**
```typescript
// Load model, then:
const box = new THREE.Box3().setFromObject(model);
const verts = model.geometry.attributes.position.count;
const textures = model.material.map ? '2K' : 'Unknown';
console.log(`[AVATAR] ${verts} verts, ${textures} texture, bbox: ${box.getSize(new THREE.Vector3())}`);
```

**Expected at 3 users:**
- FPS: 45–60 (no drops)
- If drops to 20–30fps → avatar is too heavy OR shader is expensive

---

### **Step 4: Check Network Saturation (5 mins)**

**On WiFi router:**
- Check 2.4GHz vs 5GHz band usage
- 100 devices on 2.4GHz will saturate; 5GHz can handle it

**On phones (Chrome DevTools → Network tab):**
- Each skeleton frame: ~2KB
- 30 fps × 2KB = 60 KB/s per phone
- 3 phones × 60 KB/s = 180 KB/s total (well below WiFi 6 speed)
- **If Network shows throttling:** WiFi issue, not app issue

---

### **Step 5: Isolate the Culprit (30 mins)**

**Hypothesis A: Relay is the bottleneck**
- Fix: Implement backpressure handling + frame skipping
- Add monitoring: `/metrics` endpoint shows dropped frames
- Test: 3 users should stay smooth

**Hypothesis B: Three.js is the bottleneck**
- Measure: Use Chrome DevTools Performance to find long tasks
- Fix: Profile avatar complexity, reduce polygon count, or implement LOD
- Test: 3 users should maintain 60fps

**Hypothesis C: Network is the bottleneck**
- Check: Network waterfall in DevTools shows latency
- Fix: Switch to 5GHz WiFi, reduce message size, enable compression
- Test: Latency should stay <50ms

**Hypothesis D: Shader is expensive**
- Check: DevTools GPU profile shows long fragment shader times
- Fix: Simplify ghostAura.ts shader, remove noise, reduce effects
- Test: Should free up GPU cycles

---

## Immediate Action Plan (Today, May 4)

### **Priority 1: Verify It's Real (30 mins)**
1. Connect 3 phones to relay
2. Record Chrome DevTools Performance on each
3. Measure CPU on relay server
4. Measure FPS on phones
5. **Document actual metrics in Slack/email**

### **Priority 2: Identify Root Cause (1–2 hours)**
- Run diagnostic steps 1–4 above
- Narrow down to: relay, client render, network, or shader
- Post findings with screenshots of DevTools

### **Priority 3: Fix (1–2 days depending on cause)**
- **If relay:** backpressure + frame skipping (high priority)
- **If client render:** avatar optimization + LOD
- **If network:** WiFi band switch + compression
- **If shader:** simplify effects

### **Priority 4: Re-test (1 hour)**
- Test with 5 users (not just 3)
- Measure metrics again
- Should see linear scaling, not exponential lag

---

## What NOT to Do

❌ Don't guess—measure first  
❌ Don't implement scaling (clustering, Ably) until you fix the bottleneck  
❌ Don't assume it's the relay—could be 8th Wall WebAR  
❌ Don't change code without before/after metrics  

---

## Expected Timeline

- **Today (May 4):** Diagnose (1–2 hours)
- **Tomorrow (May 5):** Implement fix (2–4 hours depending on cause)
- **May 6:** Verify fix with 10 users
- **May 10:** Ractor rehearsal (should be smooth by then)

---

## Questions to Answer ASAP

1. **What FPS do you see at 3 users?** (60fps? 30fps? 10fps?)
2. **Is latency spiking?** (avatar jumps every second, or smooth-but-slow?)
3. **Is it the same on iPhone 12 and Pixel 6, or worse on one?**
4. **What relay `/metrics` shows when 3 users connect?** (CPU%, memory, frame rate)
5. **Do all 3 users lag equally, or does user #3 lag more than user #1?**

---

## Tools to Use

| Tool | Purpose | Command |
|------|---------|---------|
| Chrome DevTools | FPS, GPU, network | F12 → Performance |
| Relay metrics | CPU, memory, frames | `curl relay-url/metrics \| jq` |
| Android Profiler | Android phone GPU | Android Studio → Profiler |
| Xcode Instruments | iPhone GPU | Xcode → Product → Profile |
| Network Monitor | WiFi usage | Router admin panel |

---

**Next step: Run diagnostics and report back with metrics.**

**This is blocking everything. Fix this before considering scaling.**
