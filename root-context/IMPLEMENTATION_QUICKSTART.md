# ROOT Onboarding App - Implementation Quick Start

## ✅ Completed This Session

### Utility Classes (Ready to use)
- **DeviceCapability.ts** - 3-tier GPU detection (high/medium/low)
- **SVGToThreeJS.ts** - SVG→Three.js geometry converter
- **ParticleSystem.ts** - Burst + ambient particle effects
- **LocalRelayClient.ts** - WebSocket relay communication
- **CloudGuestbook.ts** - AWS Lambda submission with offline fallback
- **MicrophoneReactivity.ts** - Volume detection (10Hz polling)

### Shaders (Ready to compile)
- **glitch.vert/frag** - RGB shift + scan lines (Judgment low values)
- **kaleidoscope.vert/frag** - 6-fold symmetry (The Void)
- **morphing.vert/frag** - Wireframe morphing (Coffin floating)

### Documentation Updates
- SOW updated with asset strategy, device detection, shader specs
- Session memory with implementation roadmap

---

## 🚀 Next Immediate Steps (For Developers)

### 1. Copy Asset Files to Public Folder
```bash
# From workspace root:
cp content_assets/images/*.svg apps/audience-ar/public/models/
cp content_assets/images/psy-*.png apps/audience-ar/public/models/
cp content_assets/images/*-{angle,top,bottom,front,back,left,right}.png apps/audience-ar/public/models/
```

### 2. Install Three.js Dependencies (if not already done)
```bash
cd apps/audience-ar
npm install three three-bvh-csg gsap
npm install --save-dev @types/three
```

### 3. Create React Component Files (in `apps/audience-ar/src/onboarding/`)
Structure:
```
stages/
  ├── DigitalGuestbook.tsx    # Stage 1
  ├── TechnicalAwakening.tsx  # Stage 2
  ├── TheVoid.tsx             # Stage 3
  └── JudgmentDial.tsx        # Stage 4
```

### 4. Implement Main State Machine (Onboarding.tsx)
```typescript
// apps/audience-ar/src/onboarding/Onboarding.tsx
import { DeviceCapability, RENDER_SETTINGS } from './utils/DeviceCapability';
import { relayClient } from './utils/LocalRelayClient';
import { microphone } from './utils/MicrophoneReactivity';

export const Onboarding: React.FC = () => {
  const [stage, setStage] = useState<'guestbook' | 'awakening' | 'void' | 'judgment'>('guestbook');
  
  useEffect(() => {
    // Initialize systems
    DeviceCapability.initialize();
    const tier = DeviceCapability.getTier();
    const settings = RENDER_SETTINGS[tier];
    
    console.log(`Rendering at ${tier}-tier with settings:`, settings);
    
    // Connect to relay
    relayClient.connectWithRetry().catch(err => {
      console.warn('Relay connection failed:', err);
      // Allow offline mode
    });
    
    // Initialize microphone (optional, graceful fallback if denied)
    microphone.initialize().then(success => {
      if (success) {
        microphone.start();
      }
    });
  }, []);
  
  return (
    <div className="onboarding-container">
      {stage === 'guestbook' && <DigitalGuestbook onNext={() => setStage('awakening')} />}
      {stage === 'awakening' && <TechnicalAwakening onNext={() => setStage('void')} />}
      {stage === 'void' && <TheVoid onNext={() => setStage('judgment')} />}
      {stage === 'judgment' && <JudgmentDial />}
    </div>
  );
};
```

### 5. Example: DigitalGuestbook Component
```typescript
// stages/DigitalGuestbook.tsx
import React, { useState, useEffect } from 'react';
import { guestbook } from '../utils/CloudGuestbook';
import { relayClient } from '../utils/LocalRelayClient';

export const DigitalGuestbook: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [relayConnected, setRelayConnected] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Check relay status
    relayClient.onRelayReady(() => setRelayConnected(true));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Submit to cloud/local
      const result = await guestbook.submit(name, email);
      console.log('Guestbook result:', result);

      // Send to relay for local logging
      if (relayConnected) {
        relayClient.sendGuestbookEntry(name, email);
      }

      // Advance to next stage
      onNext();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="guestbook-stage">
      <h1>Sign the Digital Guestbook</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Your Name"
          value={name}
          onChange={e => setName(e.target.value)}
          required
        />
        <input
          type="email"
          placeholder="Your Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <button type="submit" disabled={isSubmitting || !relayConnected}>
          {isSubmitting ? 'Signing...' : 'SIGN & ASCEND'}
        </button>
      </form>
      {relayConnected && <p className="connected">✓ Relay Connected</p>}
    </div>
  );
};
```

---

## 📋 Configuration Checklist

### Environment Variables
Add to `.env.local`:
```
VITE_GUESTBOOK_ENDPOINT=https://api.root-onboarding.aws/guestbook
VITE_RELAY_URL=wss://10.42.0.1:8080/relay
VITE_DEVICE_TIER_OVERRIDE=  # Leave empty for auto-detection, or 'high'/'medium'/'low'
```

### Vite Config (vite.config.ts)
```typescript
export default defineConfig({
  plugins: [react()],
  server: {
    https: true, // Required for camera access
    proxy: {
      '/api': 'https://10.42.0.1:8080'
    }
  },
  optimizeDeps: {
    include: ['three', 'gsap']
  }
});
```

---

## 🎨 Asset File Mapping

| Asset | SVG Path | PNG Fallback | Usage |
|-------|----------|--------------|-------|
| Ouroboros | `models/ouroboros.svg` | `models/psy-ouroboros.png` | Badge + dial |
| Coffin | `models/coffin.svg` | `models/psy-coffin.png` | Morphing geometry |
| Stained Glass | `models/stained-glass.svg` | `models/psy-stainglass.png` | Background |

---

## 🔬 Testing Device Tiers

### High-End Device (Chrome on MacBook)
```typescript
// Should detect as 'high'
DeviceCapability.logDeviceInfo();
// Output: WebGL2, 16+ texture units, 256+ fragment uniforms
```

### Medium-End Device (iOS Safari)
- Uses fallback PNG carousel + CSS animations
- Targets 30fps, 50 particles max

### Low-End Device (Android 6 Nexus 5)
- Static PNG images only
- CSS fade transitions
- No Three.js overhead

---

## 🚨 Critical Implementation Notes

1. **Device Detection Must Run EARLY**
   - Call `DeviceCapability.initialize()` before any Three.js setup
   - Routes all render decisions based on tier

2. **Relay Connection is Non-Blocking**
   - Onboarding works offline (uses localStorage fallback)
   - Relay connection enhances but doesn't block
   - Allow 3-second timeout, then continue

3. **Microphone Permission is Optional**
   - Graceful fallback to silent animation if denied
   - Do NOT block on microphone permission

4. **Cloud Submission Fallback Chain**
   - Cloud first (fast path) → localStorage if timeout → Continue anyway
   - Users never blocked on network

5. **Shader Uniforms Must Match Usage**
   - glitch_intensity, time, volume are critical
   - Mismatch causes black screen/errors

---

## 📞 Support & Debugging

### Check Device Tier
```typescript
import { DeviceCapability } from './utils/DeviceCapability';
DeviceCapability.logDeviceInfo();
```

### Monitor Relay Connection
```typescript
import { relayClient } from './utils/LocalRelayClient';
relayClient.onError(err => console.error('Relay error:', err));
relayClient.onDisconnect(() => console.log('Relay disconnected'));
```

### Test Microphone Volume
```typescript
import { microphone } from './utils/MicrophoneReactivity';
microphone.onVolume(vol => console.log('Volume:', vol.toFixed(2)));
```

---

## ✨ Next Session Goals

- [ ] Implement all 4 stage components
- [ ] Wire up shader materials to geometries
- [ ] Integrate Three.js rendering into React
- [ ] Test on low/medium/high devices
- [ ] Deploy Lambda + DynamoDB
- [ ] Final QA before May 10 rehearsal
