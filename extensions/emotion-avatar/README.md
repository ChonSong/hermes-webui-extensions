# Emotion Avatar

Modular companion avatar with emotion detection. 5 SVG characters, FAC voice integration, LLM tag scanning, agent state polling. Pluggable inputs, swappable renderers.

```
assets/
├── core/
│   ├── presets.js        # 5 character definitions (Pixel, Neko, Yuki, Robot, Monster)
│   ├── visemes.js        # Phoneme → mouth shape mapping (7-class, lightweight)
│   └── pipeline.js       # Expression priority engine — resolves conflicts, emits events
├── inputs/               # Pluggable emotion sources
│   ├── agent-state.js    # speechSynthesis + S.busy → speaking/thinking/idle
│   ├── llm-tags.js       # Scans messages for [happy] [surprised] etc.
│   └── fac-emotion.js    # Listens hermes:fac:emotion events from FAC
├── renderers/            # Swappable — currently canvas-2d
│   └── canvas-2d.js      # 2D Canvas SVG path renderer with mouse tracking
├── emotion-avatar.js     # Bootstrap — wires inputs → pipeline → renderer
└── emotion-avatar.css    # Styles
```

## Architecture

```
inputs/agent-state ──┐
inputs/llm-tags    ──┤
inputs/fac-emotion ──┤   priority    renderers/canvas-2d
                       ├────────────► pipeline ──────────────► canvas draw()
external dispatch ────┘   resolve     │
                                      ├─ hermes:avatar:expression event
                                      └─ window.__avatarExpression
```

## Substitution guide

| Replace this | With this | How |
|---|---|---|
| `inputs/agent-state.js` | Custom state detector | Same API: `start()`/`stop()`, calls `__ea.pipe.pulse(expr, 'source')` |
| `inputs/fac-emotion.js` | Any voice emotion detector | Listen for events, call `__ea.pipe.set(expr, 'fac')` |
| `renderers/canvas-2d.js` | VRM 3D Three.js renderer | Subscribe to `hermes:avatar:expression`, render a VRM model with blend shapes |
| `core/visemes.js` | wlipsync full profile | Replace light viseme map with wlipsync npm module, pipe phoneme→shape to renderer |

## VTuber component provenance

| Component | Origin | License | Usage |
|---|---|---|---|
| wlipsync viseme model | Airi (moeru-ai) `@proj-airi/model-driver-lipsync` | MIT | Reference only — we use a lightweight 7-class viseme map instead (37KB ML profile too heavy for 2D canvas) |
| VRM rendering concept | Airi `@proj-airi/stage-ui-three` via @pixiv/three-vrm | MIT | Future upgrade path — sub out `canvas-2d.js` for a VRM renderer |
| Expression pipeline pattern | Airi `@proj-airi/core-character` | MIT | Architectural reference — priority-based expression resolution |
| LLM tag system | Open-LLM-VTuber (Snowfork) | MIT | Pattern reference — `[happy]` tags in LLM responses |

## Public API

```javascript
window.HermesEmotionAvatar.setExpression('surprised')   // Force expression
window.HermesEmotionAvatar.setMouseTracking(false)       // Disable eye tracking
window.HermesEmotionAvatar.switchPreset('neko')          // Switch character
window.HermesEmotionAvatar.hide()                        // Hide avatar
window.HermesEmotionAvatar.destroy()                     // Clean shutdown
```

## FAC integration

```javascript
// FAC plugin emits this event when it detects user emotion:
window.dispatchEvent(new CustomEvent('hermes:fac:emotion', {
  detail: { emotion: 'happy', confidence: 0.92 }
}));
// Avatar automatically picks it up and transitions expressions
```

## Install alongside assistant-avatar

`assistant-avatar` and `emotion-avatar` are independent extensions. Install either or both — they don't conflict. `emotion-avatar` supersedes `assistant-avatar` by bundling the renderer + emotion bridge in one module.
