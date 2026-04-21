# Graphics Review — Spacetime Tab

*Reviewer: senior WebGL / Three.js engineer. Confidence notes are inline. Scope: 6 views in `src/special/*` + shared `src/post.js` + `src/spacetime-app.js`, with `src/views/blackhole.js` as reference.*

## Executive Summary

The Spacetime tab ships a *lot* of convincing visuals for what is, under the hood, a handful of cloned building blocks. It works — but it is overwhelmingly **CPU-bound** by choice: 40k+ line vertices per view are being rewritten from JavaScript every frame when they could be computed in a vertex shader from a handful of uniforms, which would be a 20–100× speedup on that code path. The art direction is competent (the cool-blue grade and threshold-based bloom read cinematic), yet the **line rendering itself is the visual ceiling**: `THREE.Line` draws 1-pixel GL_LINES with no AA, no tapering, no glow-by-proximity — all the expensive per-vertex color work is being thrown away into a hairline. Post-processing is structurally wasteful (5 independent composers, 5 bloom RTs) and the "cinematic" shader is doing an amateur lift/gain approximation. Finally, there's extensive, line-for-line duplication: `buildStarfield` and `buildDynamicGrid` exist 4–5 times verbatim, and each view re-implements the same init/animate/resize/dispose boilerplate (~100 LoC of it). None of this is broken — but it is squarely "competent hobbyist" rather than "production-grade," and the same code could look dramatically better with modest refactors. **Confidence: high (0.9).**

## Extended Executive Summary

The strongest point of the codebase is the **factory pattern in `spacetime-app.js`** (clean swap-in/swap-out of views), and the fact that the rubber-sheet metaphor does render correctly — the superposition math, equator draping, gravitational wave ring, merger state machine, and Kerr twist are all physically motivated and work as advertised. The ray-marched black hole (reference file) is genuinely the most advanced thing here, with a legitimate Schwarzschild leapfrog integrator, photon ring accumulation, and Keplerian-shear disk turbulence. That file sets the bar for what the rest of the tab *could* look like.

The weakest point is the **gap between ambition and implementation choices**. Five views share the same CPU update loop (~40k vertex writes/frame), the same `LineBasicMaterial` (one-pixel aliased GL lines on desktop, fudged with bloom to hide it), and the same per-view composer construction. A single ~80-line shared helper file could replace ~400 LoC of duplication, a single shared composer could halve post-processing RT memory, and a single custom `ShaderMaterial` on an `InstancedMesh` or `Line2` (fat lines) could make the same scenes look an order of magnitude better — while freeing the main thread for controls, camera, and CSS2D. The lensing shader is physically wrong (pure inverse-square blow-up with no Einstein radius constraint), the cinematic shader uses `mediump` precision (banding risk on Android), and the `time` uniform uses `performance.now()*0.001` which will lose mantissa precision after ~20 minutes of uptime. None of these require a rewrite — they are each 30-to-90-minute fixes.

---

## Detailed Analysis

### 1. Architecture & Code Quality

#### 1a. Factory pattern (positive)
`spacetime-app.js` is clean. `viewFactories`, `viewInstances`, `switchView()`, per-view `init/animate/resize/dispose` contract — this is the right shape. The black-hole wrapper (lines 16–24) bridging a singleton module into the factory interface is pragmatic and fine.

**Bug: `dispose()` in `spacetime-app.js` deletes the active instance but never clears instances for *other* views** (line 118 only deletes `activeViewName`). Not a leak while the tab is open; it *is* a leak if the user swaps views repeatedly and then closes the tab, because all cached view instances except the last are orphaned with their buffers/materials still GPU-resident. **Low severity, high confidence.**

#### 1b. Duplication (major)
The file sizes tell the story. Across `spacetime-model.js`, `alcubierre-model.js`, `inspiral-model.js`, `framedrag-model.js`, the following are essentially **verbatim**:

- `buildStarfield()` — identical 25-line function in 4 files (spacetime:140–165, alcubierre:222–247, inspiral:139–164, framedrag:111–136). Same STAR_COUNT, same STAR_RADIUS, same warmth branching, same colors, same PointsMaterial. *Pure copy-paste*, ~100 LoC of redundancy. **Confidence: certainty (diffed).**
- `buildDynamicGrid()` / `makeLine()` — identical in spacetime:55–108, inspiral:52–105, framedrag:38–91. Alcubierre is the only one that differs meaningfully (split into xLines/zLines).
- View boilerplate (`init/animate/resize/dispose`) — each view file is ~140–200 lines, and roughly 60% of that is duplicated scaffolding: scene/camera/controls creation, light setup, CSS2DRenderer attach/detach, `clock_`, speed slider wiring, `composer_.render() + labelRenderer_.render()` pairs, `scene_.traverse(obj => dispose())`.

**Ballpark savings from a `special/shared/` helper module: ~400 LoC removed, ~5 files slimmer, a single source of truth for starfield/grid quality.** If the user ever wants to crank `STAR_COUNT` or switch to `Line2`, they currently have to edit it in 4 places. That's a maintenance trap.

Verdict: **this is not okay** for a repo you'd show a senior. Refactor.

#### 1c. Module-scoped constants
Most models hardcode `GRID_SIZE`, `GRID_RESOLUTION`, `STAR_COUNT` as top-level consts. Those should be **parameters** to a `buildDynamicGrid(opts)` call, not file-local magic numbers. Currently inspiral and spacetime use `GRID_RESOLUTION = 250` while alcubierre uses `300` — there's no comment explaining why; it's inconsistent by accident rather than design.

#### 1d. `marker_` shadowing bug in `spacetime-view.js`
Lines 19 and 81 both declare `let marker_`. The inner `const marker_` on line 81 shadows the outer one, so `animate()` at line 142 reads the *outer* `marker_` which is `null`. **Result: the barycenter marker never tracks the grid — its Y position is static at -5.5.** This is a straight bug, not an optimization concern. **High confidence.**

Fix: replace `const marker_ = new THREE.Mesh(...)` on line 81 with `marker_ = new THREE.Mesh(...)` (drop `const`).

#### 1e. Dead code
`spacetime-view.js` lines 190–196 define `updateGaugues(camera)` at the bottom of the file that is never called. Remove.

---

### 2. Rendering Technique — Per-vertex JS vs Vertex Shader

This is the **single biggest optimization available**, and it applies to 5 of 6 views.

Current approach: ~41 lines × 251 vertices × 2 directions = **20,582 vertices** per grid view, written every frame from JS. Each vertex requires 2 `Math.sqrt`, multiple `Math.exp`, 1 `Math.sin`, and conditional branches. That is ~150k–250k floating-point ops per frame on the main thread, plus two buffer uploads (positions + colors, both `DynamicDrawUsage`). On an M1/M2 laptop this is a 2–4 ms main-thread cost; on a mid-tier Android phone it's the difference between 60 fps and 30 fps.

The physics is **pointwise closed form** — ideal for a vertex shader. A `ShaderMaterial` could express every view's deformation as uniforms:

```glsl
// Shared grid vertex shader — handles all 5 views
uniform vec2 starA;      // (x,z)
uniform vec2 starB;
uniform float massA, massB, softA, softB;
uniform float time;
uniform float gwAmp, gwFreq, gwDecay;   // 0 to disable
uniform float spinStrength;              // 0 = Schwarzschild, 1 = Kerr

attribute vec2 basePos;  // (x, z) per vertex, static, uploaded ONCE

void main() {
    vec2 p = basePos;
    // Frame drag twist (optional)
    float r = length(p);
    if (spinStrength > 0.0 && r > 0.5) {
        float angle = spinStrength * 12.0 / pow(max(r, 2.4), 2.5);
        p = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p;
    }
    vec2 dA = p - starA;
    vec2 dB = p - starB;
    float y = -massA / sqrt(dot(dA,dA) + softA)
            - massB / sqrt(dot(dB,dB) + softB);
    if (gwAmp > 0.0 && r > 2.0) {
        y += gwAmp / (1.0 + r*gwDecay) * sin(r*0.5 - time*gwFreq);
    }
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p.x, y, p.y, 1.0);
    // pass intensity to fragment shader for color
    vIntensity = ...;
}
```

**Expected speedup: 20×–50×.** The GPU is idle during these 2–4 ms anyway — it's being starved. Grid resolution could be pushed to 500 or 800 vertices/line with no main-thread cost. The geometry becomes a single `BufferGeometry` uploaded *once* at init with a `basePos` attribute; uniforms are updated per frame (6–12 numbers, trivial). The dome draping can become a fragment discard or a simple `max(y, domeY)` in the shader.

This also **unlocks proper line rendering** (see Shader Quality below): once you're on `ShaderMaterial`, swap to `LineMaterial` from `three/addons/lines/` for fat, AA'd lines with real pixel widths. Combined gain: 5–10× speedup AND dramatically better-looking grid.

**Verdict: per-vertex JS deformation is the wrong choice for closed-form physics. Confidence: high (0.95).** The only argument for keeping it is the `draping` over the sphere dome (line 254–263 in spacetime-model), which is trivially expressible as `max(y, sphereTopY(r2))` in a shader — no cost.

Sidebar: the **inspiral phase state machine** and **alcubierre z-line wrap** are stateful and should stay in JS, but that's 2 uniforms of state (phase, sep), not 20k vertex writes.

---

### 3. Shader Quality

#### 3a. Cinematic shader (`post.js`)

**Issues:**

1. **`precision mediump float`** on line 30. On iOS/Android GPUs `mediump` is often FP16, which means the vignette's `smoothstep(0.3, 0.85, dist)` can band visibly at near-black regions. Use `highp` — the cost is zero on desktop and negligible on mobile (and mobile skips this pass anyway per line 77, so there's literally no reason to use `mediump`).

2. **Lift/gain is done wrong.** Actual lift/gain is `out = pow((in - lift)/(gain - lift), gamma)`. What this shader does on lines 48–50:
   ```
   color.r = color.r * gainR + (1.0 - color.r) * (liftR - 1.0) * 0.5
   ```
   is a linear blend that can't actually crush shadows or lift mids in a DaVinci-style way. The values `liftR=0.92, gainR=1.05` effectively just tint the whole image. This is **marketing-copy "cinematic," not real color grading.** It's not *broken*, but calling it lift/gain is misleading. Recommend: use proper ASC-CDL (slope/offset/power) or a simple `pow(color, 1.0/gamma)` after the tint.

3. **Grain noise is not temporally stable.** `rand(vUv + fract(time))` produces full pattern replacement every frame, which reads as noise *flicker* rather than film grain. Real film grain is spatially coherent per frame; tying `fract(time)` in with floor-quantization at ~24 fps gives a proper cinema feel.

4. **`time` uniform = `performance.now() * 0.001`** (e.g. spacetime-view line 147). After ~30 minutes of tab open time, `time` is in the tens of thousands of seconds; FP32 `sin(time * ...)` starts shedding precision. Modulo it to something like `mod(performance.now()/1000, 1000)` before passing.

5. **Vignette intensity of 0.35–0.55 stacks with bloom falloff** to produce a quite dark periphery — OK for black hole but probably too strong for lensing.

**Verdict:** works, reads as cinematic at first glance, is **amateur in the details.** Confidence: high.

#### 3b. Lensing shader (`lensing-model.js` lines 122–172)

**Physics:** the formula `deflection = strength * R² / (r² + eps)` (line 157) is a pure 1/r² deflection — which is the weak-field geodesic deflection, OK, but it has no concept of an Einstein radius **threshold**. A real gravitational lens has a sharp ring where stars pile up (at the Einstein radius) and **double images** outside it. The current shader just radially displaces everything outward, producing a radially-smeared blur rather than the characteristic ring-and-arc pattern.

**Implementation issues:**

1. **No double image**: a real gravitational lens produces two images of a background source on opposite sides of the lens; this shader only produces one displaced image. You can fake this in a few lines by sampling twice (once with `+dir*defl`, once with `-dir*defl`) and averaging or maxing based on position.

2. **`r > 0.001` branch and `0.002` epsilon** (line 157) are duct-tape for the singularity. A `smoothstep`-gated deflection would be smoother.

3. **`schwarzschild = smoothstep(0.008, 0.015, r)`** (line 164) multiplies the final color by 0→1 near center — good idea (simulates the BH shadow blocking background light) but is fully in UV space, not accounting for aspect ratio, so the shadow is a horizontal oval, not a circle. Fix: compute on the aspect-corrected `delta`.

4. **`lensStrength` at 0.08 * slider (0–1)** gives a max displacement of 0.08 UV units ≈ 150px at 1080p. At the max slider value the effect is way too mild for an "Einstein ring" reveal. Consider pushing to 0.2 max and adding a non-linear slider curve.

**Verdict:** a solid 2-minute hack that reads as "lensing" from the corner of the eye. Not physically accurate; no rings/arcs form. Confidence: high.

#### 3c. Black-hole shader (reference)

Legitimately well-crafted. Correct leapfrog integration, pseudo-Newtonian deflection with the `3*L²/r³` relativistic correction, Keplerian shear in the disk noise coordinates, temperature gradient following Novikov-Thorne `r^(-3/4)`, Doppler beaming. The one critique: `MAX_STEPS = 6144` on low-mid Android at `quality=0.5` is still ~300 steps → 5–8 ms fragment cost at 1080p. Worth exposing `quality` as a visible setting (it already is) and defaulting lower on mobile detection.

---

### 4. Post-Processing

#### 4a. Each view has its own composer
Every view currently calls `createComposer(renderer, scene_, camera_)` in `init()`, creating:
- 1 EffectComposer (2 float render targets)
- 1 UnrealBloomPass (5 downsample RTs + blur buffers ≈ 10–12 render targets at half-chain sizes)
- 1 ShaderPass (1 full-res RT)

That's **~14 render targets per view × 6 views = 84 RTs** of GPU memory allocated over the tab's lifetime. At 1080p, each full-res RT is ~8 MB (RGBA16F via EffectComposer default); the bloom chain is smaller. Ballpark: **200–400 MB of VRAM** held across view switches even though only one is active.

This *could* be justified if views held state across switches, but they don't — `switchView()` disposes the view before creating the next. So the cached instances in `viewInstances` retain composer RTs that are never used until the user returns to that view.

**Fix options:**
- **Easy:** dispose composer in `dispose()` properly (the current `composer_.dispose()` call does dispose pass render targets; verify via `renderer.info.memory.textures` that it's actually falling).
- **Better:** a shared composer in `spacetime-app.js` that gets re-targeted to the current view's scene+camera on switch. Saves 80% of post-processing RT memory.
- **Best:** single render pipeline for the whole app (tabs/ocean/etc.) — not in scope.

#### 4b. Bloom parameter consistency

| View | Strength | Radius | Threshold |
|------|----------|--------|-----------|
| Black hole | 1.4 | 0.6 | 0.7 |
| Binary system | 0.7 | 0.6 | 0.25 |
| Alcubierre | 0.8 | 0.5 | 0.2 |
| Lensing | 0.3 | 0.5 | 0.9 |
| Inspiral | 0.7 | 0.6 | 0.25 |
| Frame drag | 0.7 | 0.6 | 0.25 |
| *Shared default* | 0.8 | 0.4 | 0.85 |

The default in `post.js` (0.8/0.4/0.85) is **overridden in every single view**, which defeats the point of a shared factory. Either the factory should accept a preset (`{blackhole, grid, lensing}`) or the views should stop overriding.

Binary/inspiral/frame-drag use identical bloom settings (0.7/0.6/0.25) — those should be a named constant `GRID_BLOOM`. Lensing uses a very different profile (low strength, high threshold) which is right for stars-on-black.

**Confidence: high.** This is a clear "pick-one" refactor.

#### 4c. Lensing pass ordering
`lensing-view.js` uses `render → lensing → bloom`, deliberately. This is actually correct — the distorted stars then get bloom, which sells the ring. Other views use `render → bloom → cinematic`. Inconsistency is *justified* here.

#### 4d. Cinematic pass on lensing?
Lensing view doesn't apply the cinematic pass at all (line 75 adds bloom as the last pass). Looks intentional but isn't called out — either document or unify.

---

### 5. Performance Bottlenecks

**Ranked by impact on low-end devices:**

1. **CPU per-vertex grid update** (~3–5 ms/frame on mid-tier laptop, ~10–15 ms on mid-tier phone). #1 bottleneck for all non-black-hole views. Fix: shader-based deformation (see §2). Expected: **10× speedup** on this code path alone. Mobile goes from 20 fps → 60 fps on binary/inspiral/framedrag.

2. **Black hole ray-march** at quality > 0.5 is fragment-bound. Already has a quality slider — default lower on mobile/integrated GPUs. Current mobile check in `post.js` should also gate BH quality; right now `setQuality(q)` is called externally but there's no mobile default.

3. **Post-processing RT overhead**. On mobile, `post.js` already returns a no-op composer (good). On desktop, UnrealBloom's 5-level downsample chain is 2–3 ms at 1080p and ~6 ms at 1440p. Acceptable.

4. **Buffer uploads** (`posAttr.needsUpdate = true` × 82 lines × 2 attributes per view per frame = 164 buffer updates/frame). The WebGL driver batches these but each triggers a `bufferSubData`. Fix as part of §2 (shader deformation removes all buffer uploads).

5. **CSS2DRenderer traversals** — if no labels are added (and I don't see any), this is pure overhead. Remove it from views that don't use labels.

6. **Starfield 2500 points × 5 copies = 12500 draw calls**? No — each starfield is one Points draw call. Fine. The `STAR_COUNT = 8000` in lensing is also one draw call, fine.

**Easiest 10× speedup: GPU the grid.** §2. That's the whole answer.

---

### 6. Visual Quality — Rendering Metaphor

#### 6a. Line rendering
`THREE.Line` with `LineBasicMaterial` → draws 1-pixel-wide `gl.LINES`. This is:
- **Aliased** (no line AA on most GPUs/browsers unless MSAA is on).
- **Non-scalable** — line width does not respect `linewidth` on most platforms (a known WebGL limitation; Chrome/Firefox on Win10+ ignore it entirely).
- **No per-segment depth** information — the per-vertex colors are blended along the GL_LINES interpolation, but the line itself is infinitely thin in depth.

The result: from any meaningful distance, the grid looks like noisy antennae rather than a draped sheet. Bloom is partially hiding this by making bright segments fuzz out, but that's a band-aid.

**Recommended upgrade path:**

- **Tier 1 (10 min):** Switch to `Line2` / `LineGeometry` / `LineMaterial` from `three/addons/lines/`. Real screen-space-pixel line widths, proper AA, works on all platforms. Cost: slightly more vertex buffer (each segment becomes a quad), negligible at 20k segments.
- **Tier 2 (1 hour):** Use a `ShaderMaterial` on a `Mesh` (triangle strip) and render the grid as ribbons — each grid line becomes a thin oriented ribbon. Lets you control thickness per-vertex (thicker near wells, thinner at rest), gradient along length, proper depth, and you can have the ribbon glow as a separate shader without needing bloom.
- **Tier 3 (afternoon):** Replace grid entirely with a deformed plane `Mesh` using `ShaderMaterial` with a "grid line" fragment shader (a `smoothstep(thickness, 0.0, fract(uv * n))` trick). This gives infinite resolution, AA for free, and can encode per-pixel glow from curvature. This is how "proper" rubber-sheet visualizations are usually done (e.g. Shadertoy #gdXyRR).

My pick: **Tier 3**. A single deformed PlaneGeometry (128×128 subdivisions) with the curvature math in the vertex shader and the line pattern in the fragment shader would look dramatically better than the current 41 `Line`s, at a fraction of the cost.

#### 6b. Color gradients
Per-vertex color based on distance to wells is good in principle but because the line is 1px thick, the color variation is barely visible — you get blue lines, brighter blue lines near wells. Switching to ribbons/plane would let the gradient actually *read*.

#### 6c. Grid "draping" seam
On spacetime-model.js:254–263 (and equivalent in framedrag/inspiral), the grid Y is clamped to `max(y, sphereTopY)` when the vertex is inside the sphere projection, which drapes the grid over the sphere. Visually this works but creates a **hard C⁰ discontinuity** at the horizon (the grid kinks visibly). A `smoothstep` blend or a signed-distance blend would smooth this.

---

### 7. What's Missing

Things I'd expect to see in a production-grade "Spacetime" visualizer that aren't here:

1. **Proper HDR pipeline.** `WebGLRenderer` supports `outputColorSpace = THREE.SRGBColorSpace` and physical lights with `toneMapping = THREE.ACESFilmicToneMapping`. Right now, from what I can tell, there's no tonemapping — bright bloom areas clamp to 1.0 and look plastic. A `toneMapping = ACESFilmic` + `toneMappingExposure = 1.2` would give bloom soft roll-off that looks genuinely cinematic. **Quick win: ~5 lines.**

2. **Volumetric / fog.** A thin directional fog (space dust) would add tremendous depth to the binary/inspiral/framedrag views. `scene.fog = new THREE.FogExp2(0x020408, 0.005)` for $0 cost. Or go bigger with a ray-marched volumetric nebula shader.

3. **Motion blur.** For the warp drive view in particular, wake particles without motion blur look like stuttering dots. Cheap fake: leave a trailing `render target with slight alpha accumulation`. Proper: velocity buffer + per-pixel blur.

4. **Depth-of-field.** The black hole would benefit; on the grid views, less so.

5. **Screen-space reflections on the spheres.** The stars are metalness=0.95 (spacetime-model line 117) but `envMap = null`, so they have no reflections — they just have emissive color. Adding a cubemap or even a simple `CubeCamera` reflection probe would make them feel substantial instead of painted. **Easy: ~10 lines.**

6. **Chromatic aberration.** For lensing, this would sell the wavelength-dependent deflection (which is actually part of real lensing near a massive object). Single extra fragment shader pass or merge into cinematic.

7. **Shadow casting from the central mass onto the grid.** Currently the sphere is lit but casts no shadow on the rubber sheet, which breaks the illusion that the sphere is "sitting in" the deformation. A simple vertex-shader shadow (darken grid color by `exp(-r)` on the sphere-side) would suffice.

8. **Einstein ring in lensing.** Already addressed — the lensing shader doesn't actually produce one.

9. **Gravitational wave polarization** in the binary system. Right now GWs are radial ripples; real GWs have `+` and `×` polarization that would show as different stretching along perpendicular axes. Easy to add once on GPU.

10. **Temporal reprojection / TAA.** Kills the 1-pixel-line sparkle for free.

---

## Recommendations

### Top 3 refactors worth doing (ranked by value/cost)

1. **Ship the grid to the GPU.** Create `src/special/shared/gridShader.js` with a single vertex+fragment shader that takes well positions/masses/spin/gw as uniforms, and a `buildCurvedGrid(opts)` helper. Replace `buildDynamicGrid()` + `updateGrid()` in 4 files with one uniform-update call per frame. **Cost: 4–6 hours. Gain: 10× perf, grid resolution can double, unlocks Tier 2/3 visual upgrades.**
   - Concrete file: new `src/special/shared/curved-grid.js` exporting `{buildCurvedGrid(opts), updateGridUniforms(grid, state)}`.
   - Deletions: `buildDynamicGrid()` + `updateGrid()` in `spacetime-model.js`, `inspiral-model.js`, `framedrag-model.js`.

2. **Extract shared helpers.** Create `src/special/shared/starfield.js`, `src/special/shared/lights.js`, `src/special/shared/view-boilerplate.js` (the init/dispose skeleton as a factory). Reduces ~400 LoC across the 5 non-black-hole views. **Cost: 2 hours. Gain: maintenance, single-point tuning.**
   - Concrete: `createStandardSpacetimeScene({bg, cameraPos, target}) → {scene, camera, controls, lights}`.

3. **Fix the bugs.** `marker_` shadowing in `spacetime-view.js:81` (30 seconds), dead `updateGauges` (30 sec), lensing aspect in schwarzschild-shadow calc (2 min), `time` uniform mod to prevent precision loss (2 min), `precision mediump` → `highp` in both cinematic shaders (30 sec). **Cost: 10 minutes. Gain: visible correctness.**

### Top 5 graphics upgrades that would most improve visual quality

1. **Replace `THREE.Line` + `LineBasicMaterial` with a deformed `PlaneGeometry` + shader-drawn grid lines (Tier 3 above).** Biggest visual jump. The grid would look like a real 3D surface with real AA, real glow, real depth.
2. **ACES tone mapping + proper sRGB output.** `renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1; renderer.outputColorSpace = THREE.SRGBColorSpace`. Bloom stops clipping, whites have roll-off. ~3 lines.
3. **Cubemap reflection on the spheres** (env map — a low-res starfield cube). Turns plastic balls into "objects in a universe." ~10 lines with `RoomEnvironment` or a loaded HDR.
4. **Real lensing shader:** implement Einstein-radius thresholding, double image, and aspect-correct shadow. Makes the lensing tab actually demonstrate gravitational lensing instead of blur. ~30 min.
5. **Volumetric fog** (`THREE.FogExp2` as minimum, ray-marched dust as stretch goal). Instantly adds depth; especially good for inspiral/framedrag. ~5 lines.

### Specific line-number change recommendations

| File | Line | Change |
|------|------|--------|
| `src/spacetime-app.js` | 114–123 | `dispose()` should iterate `viewInstances` and dispose each, then clear. Currently only disposes active. |
| `src/special/spacetime-view.js` | 81 | Remove `const` so `marker_` actually assigns to outer scope. |
| `src/special/spacetime-view.js` | 190–196 | Delete dead `updateGauges()` function. |
| `src/special/lensing-model.js` | 148–170 | Rewrite deflection with Einstein radius + double image. Compute `schwarzschild` in aspect-corrected space. |
| `src/post.js` | 30, 104 | `precision mediump float` → `precision highp float`. |
| `src/post.js` | 100–106 | Move bloom defaults `(0.8, 0.4, 0.85)` into named presets; each view picks one instead of overriding. |
| `src/special/*-view.js` | `cinematicPass_.uniforms.time.value = performance.now() * 0.001` | `= (performance.now() % 1000000) * 0.001` to prevent precision loss. |
| `src/special/spacetime-model.js` | 140–165 | Delete, import `buildStarfield` from `src/special/shared/starfield.js`. |
| `src/special/alcubierre-model.js` | 222–247 | Same. |
| `src/special/inspiral-model.js` | 139–164 | Same. |
| `src/special/framedrag-model.js` | 111–136 | Same. |
| `src/special/spacetime-model.js` | 55–108, 224–281 | Replace with shared GPU grid — see recommendation #1. |
| `src/special/inspiral-model.js` | 52–105, 286–371 | Same. |
| `src/special/framedrag-model.js` | 38–91, 168–219 | Same. |

---

## Bluntness Section

**Amateur-hour:**
- `buildStarfield` copy-pasted four times.
- `marker_` double-declaration bug.
- `mediump` precision in desktop-only shaders.
- Per-vertex JS deformation when the physics is closed-form and GPU-ready.
- "Lift/gain" color grading that isn't.
- Each view constructs its own bloom pipeline and then immediately overrides the shared defaults.
- Lensing shader physics is fake.

**Production-grade:**
- Factory pattern in `spacetime-app.js`.
- `DynamicDrawUsage` correctly flagged on the buffer attributes.
- `frustumCulled = false` on lines that extend beyond camera frustum (correct — a deformed line's bounding box is invalidated every frame and auto-culling would misbehave).
- Mobile bypass of post-processing in `post.js`.
- Black hole ray-marcher (reference) — legitimately good work.
- Inspiral phase state machine is cleanly structured.
- Alcubierre z-line wrap-around logic is clever and correct.

**Hobbyist-with-promise:**
- The art direction (cool blue grade, bloom thresholds, emissive spheres). The *intent* is cinematic; the *execution* is one refactor away from matching it.

**Overall grade: C+ on code quality, B- on visual fidelity, A- on ambition.** Ambition is the hardest one. The fixes are easy.

*Confidence on overall assessment: 0.9. Confidence on the specific speedup claims: 0.85 (depends on target hardware). Confidence on the bugs listed: 0.95 (all diffable).*
