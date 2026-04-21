# Spacetime Tab — Comprehensive Review

*Master synthesis of 6 reviews: one first-party analysis plus 5 zero-context specialist subagent reports. Date: 2026-04-20.*

---

## Executive Summary

The Spacetime tab ships a genuinely impressive set of visuals — the ray-marched Schwarzschild black hole is world-class and one of the best real-time GR renders on the public web — but across all five disciplinary lenses a consistent, sharp picture emerges: **one hero demo plus five rubber-sheet variants, with real physics bugs, real UX problems, real rendering inefficiency, and real pedagogical missteps**. The five non-black-hole views share a near-identical visual language (blue grid + blue sphere + cyan starfield), a near-identical HUD scaffold (corner brackets + status dot + static gauges masquerading as live telemetry), and a near-identical architecture (CPU-driven per-vertex deformation of ~20K line vertices per frame, updated from copy-pasted model files). Several views contain physics that is not merely simplified but actively wrong: the Lensing shader pushes pixels *outward* with a 1/r² falloff when real lensing deflects *inward* with 1/r; Frame Dragging uses 1/r^2.5 instead of the true Lense-Thirring 1/r³ and lacks an ergosphere; Binary GW ripples are circularly symmetric when quadrupole radiation has a cos(2φ) pinwheel pattern; and the orbital frequency in the Binary view is hand-set rather than Kepler-derived, making it inconsistent with the Inspiral view's correct Kepler scaling. There is also a real code-level bug: the barycenter marker in the Binary view never actually tracks the grid surface due to a `const marker_` that shadows the outer `let marker_`. The universal rubber-sheet metaphor across five views is both the biggest pedagogical liability and the biggest visual-sameness problem. The single most impactful change is not a new view — it's fixing the four physics bugs, killing the slider range problem (default 1x sits at the 4% mark of a 0–25x range), and making the tab's six views feel like actually-different things rather than palette-swapped siblings. Net grade before fixes: **B− on ambition, C+ on execution**. One focused week closes most of the gap.

---

## Extended Executive Summary

**The good.** The factory pattern in `spacetime-app.js` is clean and well-designed. The black hole view is a legitimate production-grade artifact — a true Schwarzschild leapfrog integrator producing shadow, photon ring, and higher-order lensed disk images. The HUD typography and vocabulary (Schwarzschild, Lense-Thirring, LIGO 2015, Einstein 1915) read as intentional and teach the right words. Tab switching is fast. The factory architecture means new views are cheap to add. And the binary/inspiral/frame-drag/lensing views all demonstrate the *right gestalt* of their respective phenomena — anyone who knows GR will recognize what each view is pointing at.

**The bad.** The gap between "what the tab points at" and "what it actually shows" is substantial. Five views are palette-swapped variants of the same rubber-sheet metaphor and cannot be told apart at a glance — theme accent colors live only in 6-11px HUD text, never in the 3D scene. The HUD gauges are 22-of-24 hardcoded strings ("15 M☉", "Einstein (1915)") sitting inside a chrome that implies real-time telemetry, which is a lie the interface tells to every user who can read it. The sliders cover 0–25x with default 1x at the 4%-from-left mark, no ticks, no labels — guaranteeing every new user immediately scrubs to 5x+ before they understand what happened. Mobile is effectively broken: the space-sim d-pad renders over the spacetime description, the nav auto-collapses behind an invisible affordance, and gauges overflow. Body text sits at opacity 0.35 — contrast ratio 1.6–2.2:1, below WCAG AA (4.5:1 required). Agency is ~2/10 across the board: every "control" is a time-speed slider, and every physics parameter lives as a hardcoded `const` in model files even though the black hole shader is *already* wired to accept most of them as uniforms. Code-level: `buildStarfield()` is verbatim in 4 files, `buildDynamicGrid()` in 3; ~400 LoC of mechanical duplication plus a dead `updateGauges` function, a `marker_` shadowing bug, and a post-processing architecture that builds an independent composer per view (doubling RT memory).

**The ugly (the physics bugs).** The Lensing shader implements the wrong lens equation — pushing outward with 1/r² instead of pulling inward with 1/r — which means the view currently teaches **inverted physics** where stars bend *away* from mass. Frame Dragging uses 1/r^2.5 instead of the true 1/r³ Lense-Thirring scaling, and lacks the ergosphere (the single most interesting Kerr feature). The Binary view's GW ripples are circularly symmetric when real quadrupole radiation has a cos(2φ) pinwheel pattern — this is not a subtlety, it's the defining signature of GWs and the reason the pattern rotates with the binary. The Inspiral view uses an ad-hoc `1/a` radial acceleration instead of Peters-Mathews `1/a³`, so the chirp doesn't chirp right. The Alcubierre view uses a Gaussian wall profile instead of the actual Alcubierre `tanh` shape function — forgivable, but the visualization also omits the bubble-wall causal horizon (the whole *point* of why the metric needs exotic matter). None of these require rewriting the views — each is a 5-to-60-minute fix. But they need to be fixed before claiming this is a physics-education tool.

**The pedagogical concern.** Five views use the rubber-sheet metaphor. Descriptions never flag that this is a metaphor; they say things like "the grid deforms under the superposed gravitational fields" as if the grid *were* spacetime. This is the most-cited bad analogy in GR pedagogy (Brian Greene, PBS Space Time, Veritasium have all explicitly dismantled it) because it requires gravity to explain gravity (the ball rolls into the dip *because* of real-world gravity pulling it down). The Alcubierre description is confidently matter-of-fact about what is in fact a physically exotic and probably-impossible concept, leaving readers to think warp drive is an engineering problem. Gravitational waves are drawn as radial water-like ripples when they're actually transverse quadrupole polarizations. Net effect: a curious 16-year-old leaves this tab visually impressed but conceptually in roughly the same place they started.

**The strategic call.** Five of the six views are the *same object's life story* (Binary → Inspiral → Black Hole, with Frame Drag and Lensing as parameter variants and optical effects of the latter). The tab is structured as a gallery when it should arguably be structured as a journey. The single most product-transformative move would be to merge these into a guided "Life of a Binary" experience (current views as chapters) plus a sandbox mode where users can change masses, spin, and fire test particles. A close second is pushing the theme accent color into the 3D scene (not just HUD text) so each view has its own visual signature. A close third is exposing the physics parameters that are *already* wired up in the shaders, so sliders control the simulation instead of just the clock.

---

## Table of Contents

1. [First-Party Analysis (me)](#first-party-analysis)
2. [Physics Review (subagent)](#physics-review)
3. [Graphics Review (subagent)](#graphics-review)
4. [UX / UI Review (subagent)](#ux--ui-review)
5. [Science Education Review (subagent)](#science-education-review)
6. [Product / Interactive Experience Review (subagent)](#product--interactive-experience-review)
7. [Cross-Disciplinary Synthesis — Where Reviews Converge and Diverge](#cross-disciplinary-synthesis)
8. [Consolidated Priority Recommendations](#consolidated-recommendations)

Full text of each subagent report lives in its own file: `REVIEW_PHYSICS.md`, `REVIEW_GRAPHICS.md`, `REVIEW_UX.md`, `REVIEW_EDUCATION.md`, `REVIEW_PRODUCT.md`. This document summarizes each and synthesizes across all.

---

## First-Party Analysis

*My own review, having watched the tab come into existence over the past several days and having written most of it.*

### Executive Summary (me)

Having built this tab iteratively with the user over several days, I can add context the zero-context subagents can't see: the tab evolved by accretion, not by design. Each view was built in response to a conversation ("now let's do inspiral," "now frame drag"), each HUD was copied from the template of the previous one, and each model file was started by duplicating the prior. The result is a tab that *looks* designed but was in fact *composed* — and the seams show in exactly the places the subagents flagged. The strongest observations are: (1) the rubber-sheet scaffolding was generalized far past the point where it made sense — we keep reusing it because it's what we have; (2) we never revisited the physics accuracy of earlier views when building later ones (hence the Kepler inconsistency between Binary and Inspiral); (3) we passed up cheap agency wins because the conversational flow rewarded "add another view" over "make existing views interactive"; and (4) the UX scaffolding calcified around the earliest view (Binary System) without being redesigned for the set. My strongest recommendation: stop adding views. Fix the existing six. Ship.

### Extended Executive Summary (me)

The iterative development pattern produced predictable pathologies. The Binary System view went through ~15 iterations on sphere positioning alone ("the ball needs to be moved up about 1 radius" was a real user comment), which drove careful parameter tuning for *that view* — but the parameters ossified into hardcoded constants that were never re-examined for the views that followed. When we added Inspiral, we correctly implemented Kepler's third law (`omega ∝ sep^(-3/2)`), but Binary System still has `ORBIT_SPEED = 0.2` hardcoded, so the two views are internally inconsistent by an order of magnitude. When we added Frame Drag, we wrote the azimuthal drag term as `spin * DRAG_STRENGTH / r^2.5` without checking whether 2.5 is the Lense-Thirring exponent (it's 3, and more importantly it's anisotropic in the full Kerr metric). When we added Lensing, we wrote a screen-space shader based on "push pixels away from the lens center" without deriving it from the actual lens equation — and when the user noticed duplicate galaxies in the later spiral-galaxy iteration, I correctly diagnosed this as a sign error and exponent error, fixed it, then *reverted the fix* when the user preferred the old look. The current shipped state has the wrong physics because it was visually preferred — fine for a screensaver, not fine for an educational tool that cites Einstein 1915.

The HUD pattern calcified too early. When the first view shipped, it had a title, status dot, four gauges, a description, and a single slider — fine for one view. By view six, we were still filling in four gauges regardless of whether there were four facts worth surfacing (hence "PREDICTION: Thirring & Lense (1918)" — a genuinely interesting historical factoid, but sitting in a "gauge" slot that implies real-time data). The speed slider range — `min=0 max=2500 value=100` — was copied verbatim from Binary System's original 25x range across every subsequent view without anyone asking whether Lensing or Frame Drag benefit from 25x time speed. (They do not.) And because every view builds its own composer and its own scene, the "five near-identical views" problem was baked in at the file-structure level — three of the model files are essentially copies of one another with different deformation functions, and the duplication prevents any visual upgrade from propagating cheaply.

The agency gap — which the Product subagent called the single biggest product weakness — is a direct consequence of the development pattern. Each view was built to demonstrate a phenomenon, not to let the user *play with* the phenomenon, and adding agency retroactively is harder than designing for it. The black hole view has `diskTilt`, `bhMass`, `quality`, and more as existing uniforms — all hardcoded despite being one line of HTML away from being sliders. The Binary system's masses, separation, and GW toggle are all top-level constants that could trivially be exposed. The fact that *none* of these are exposed is a product choice by omission, not a technical limitation. My sixth sense here is that this is the single highest-impact change: expose the physics. One afternoon. It transforms every view.

My final observation is about discipline specialization: each of the five subagents had a real complaint, and the *intersection* of their complaints forms the highest-priority fix list. The UX designer found the slider range problem; the physicist found the lens equation sign error; the graphics engineer found a real JS bug (`marker_` shadowing) that would have been hard to notice in casual testing; the educator pointed out the rubber-sheet pedagogy problem; the product designer found the agency deficit. Any one review alone would have hit some of these; the convergence across all five is what makes the priority list credible.

### Detailed Analysis (me)

**On the rubber-sheet over-commitment.** The pattern matches a well-known anti-pattern in visualization: when you have a good metaphor, you stop looking for other metaphors. The rubber-sheet visual works beautifully for the Binary System view — curvature, orbits, wells — and so when the user asked for an inspiral view, we reused the rubber-sheet. When the user asked for frame drag, we reused the rubber-sheet. When the user asked for lensing, we reused the starfield + shader but kept the rubber-sheet mental model. The cost is that the tab has no visual variety. The fix is not "build more rubber-sheet views"; it's "build at least two views that break the metaphor" — candidates: a light-cone view showing causal structure, a geodesic deviation view showing tidal forces on a ring of test particles, a redshift comparison showing two clocks at different depths running at different rates.

**On the agency gap being technically trivial.** The black hole shader has `diskTilt`, `diskInnerR`, `diskOuterR`, `diskBrightness`, `bhMass`, `quality` as existing uniforms. Exposing `diskTilt` as a slider is literally: add one `<input type="range">`, one `addEventListener`, one `uniforms.diskTilt.value = ...`. Five minutes. The fact that this hasn't happened is pure product prioritization, not implementation cost.

**On the duplication being a maintenance trap.** We have four identical `buildStarfield()` functions. If the user says "I want warmer stars" we have to change four files. If they say "fewer stars on mobile" we have to change four files. Every "small tweak" is now a four-file tweak. The cost of refactoring is real (~2 hours) but pays itself back on the second tweak.

**On the physics bugs being embarrassing-if-discovered.** The Lensing shader is the most serious. Anyone with a physics degree will immediately notice that the stars are pushed outward when they should be pulled inward, and that the effect drops as 1/r² when real lensing drops as 1/r. Same goes for the 1/r^2.5 in Frame Drag. These are the kind of errors that, if surfaced, will make the whole tab look unserious. Fixing them is quick (a sign flip and an exponent change).

**On the HUD chrome vs content mismatch.** The HUD vocabulary ("STATUS: OBSERVING", pulsing dot, "GW EMISSION ACTIVE") suggests live telemetry. The gauges below are 22/24 static labels. The mismatch is subconsciously jarring in the same way that a fake emergency-exit sign is subconsciously jarring. Two paths forward: (a) relabel the static gauges as "Parameters" or "Reference" and drop the live-telemetry chrome, or (b) make the gauges dynamic — the binary orbital phase can be shown, the inspiral frequency/amplitude can be shown, the framedrag angular velocity can be shown. Path (b) is more work but actually delivers on the promise the chrome makes.

### My Recommendations (me)

1. **Fix the four physics bugs.** Lensing sign+exponent (30 min). Frame drag exponent (30 min). Binary Kepler scaling (15 min). Binary GW cos(2φ) pattern (60 min). Total: ~3 hours.
2. **Fix the slider range.** Every view's speed slider should be 0–5x with ticks (30 min).
3. **Fix the `marker_` shadowing bug.** One-line change (1 min).
4. **Fix the mobile d-pad overlap.** One CSS rule (5 min).
5. **Push accent color into the 3D scene.** Each view's grid/sphere/stars adopt the theme color (2 hours). This alone transforms the visual sameness problem.
6. **Expose existing shader uniforms as sliders.** Black hole: `diskTilt`, `bhMass`. Binary: `A_MASS`, `B_MASS`. Frame drag: `spin` continuous not boolean. ~3 hours total.
7. **Lift description body opacity from 0.35 → 0.6** for accessibility (5 min).
8. **Rewrite the six description paragraphs** with hook-first prose; add a tab-level intro (half day).
9. **Add one non-rubber-sheet view** — candidate: light cones tipping near a horizon (half day).
10. **Stop adding views until the above ship.**

---

## Physics Review

*Full report: `REVIEW_PHYSICS.md`*

### Executive Summary (Physics subagent)

The Spacetime tab is visually strong and most views convey the *right gestalt*, but several views contain physics that is outright wrong, not merely simplified.

- **Frame Dragging** uses a 1/r^2.5 falloff that is qualitatively incorrect — true Lense-Thirring frame dragging is 1/r³, and the visualization lacks the single most interesting Kerr feature (the ergosphere).
- **Lensing** uses an outward radial displacement with 1/r² strength, which is doubly wrong: physical lensing deflects light *inward* with 1/r falloff.
- **Inspiral** uses an ad-hoc `SEP_INITIAL/sep * 0.5` radial acceleration instead of the Peters-Mathews `da/dt ∝ -M³/a³`, omitting the chirp's defining feature.
- **Binary** shows GW ripples as a rotationally symmetric ring when quadrupole GWs have a distinctive cos(2φ) angular pattern — this is the whole point.
- **Alcubierre** uses a Gaussian wall instead of the Alcubierre shape function; forgivable but should be flagged.
- **Black Hole** is the most physically sound of the six (8/10), only real miss is no Doppler beaming on the disk.

Pedagogically, the universal rubber-sheet metaphor across five of six views is reinforcing a well-documented misconception; strongly recommend at least one view that breaks the metaphor.

### Extended Executive Summary (Physics subagent)

Pattern: qualitative shapes right, scalings wrong — and scalings are what separate a physics visualization from a fantasy one. The softened Newtonian potential is defensible as a rubber-sheet stand-in, but the visualizations stack additional effects (GWs, frame drag, inspiral) on top whose scalings should be physically motivated even when the baseline well is a metaphor. The missing structure that would actually be *more* visually exciting than what is currently shown — ergosphere, tangential-vs-radial Einstein cross arcs, cos(2φ) quadrupole pinwheel, ISCO, bubble-wall causal horizon — is a bigger opportunity than fixing existing views. The rubber-sheet metaphor pedagogical overload is the single largest issue; a single view that deliberately breaks the metaphor (e.g. tilted light cones, Flamm paraboloid with honest captions) would do more educational work than polishing the existing five.

### Top Recommendations (Physics subagent)

**Top 3 fixes to existing views:**
1. Lensing shader: fix sign and exponent (two-line shader change, `uv + dir*deflection` → `uv - dir*(lensStrength*einsteinR*einsteinR/(r+epsilon))`)
2. Frame Drag: change exponent 2.5 → 3.0; add an oblate ergosphere surface
3. Binary: use Kepler `ORBIT_SPEED = sqrt(TOTAL_MASS / SEPARATION^3)`; change GW ripple to cos(2*(phi - theta_ret)) pinwheel

**Top 5 new views:**
1. **GW polarization** — ring of test particles showing +/× modes as oblate/prolate distortions (highest impact, corrects the water-ripple misconception)
2. **Light cones tipping near a horizon** — breaks rubber-sheet metaphor, shows causal structure
3. **Gravitational redshift / two clocks** — makes time curvature tangible
4. **Tidal effects / spaghettification** — visceral, visual, correct
5. **Microlensing light curve** — time-domain counterpart to the static Lensing view

---

## Graphics Review

*Full report: `REVIEW_GRAPHICS.md`*

### Executive Summary (Graphics subagent)

The tab ships a lot of convincing visuals from a handful of cloned building blocks. It works, but it's overwhelmingly **CPU-bound by choice**: ~20,580 line vertices per view rewritten from JavaScript every frame when a vertex shader would give a 20–100× speedup. The art direction is competent (cool-blue grade, threshold-based bloom) but the **line rendering itself is the visual ceiling** — `THREE.Line` + `LineBasicMaterial` draws 1-pixel aliased GL_LINES with no tapering. Post-processing is structurally wasteful (5 independent composers, 5 bloom RTs). Extensive duplication: `buildStarfield` in 4 files verbatim, `buildDynamicGrid` in 3. ~400 LoC of mechanical duplication. Competent-hobbyist rather than production-grade, but modest refactors unlock dramatic improvements. **Confidence: high (0.9).**

### Extended Executive Summary (Graphics subagent)

Strongest point: the factory pattern in `spacetime-app.js` is clean, the rubber-sheet math is physically motivated, and the ray-marched black hole (reference file) is the most advanced code in the tab — it sets the bar for what the rest *could* look like. Weakest point: gap between ambition and implementation choices. Five views share the same CPU update loop, same `LineBasicMaterial`, same per-view composer construction. Single ~80-line shared helper could replace ~400 LoC of duplication. Single shared composer could halve RT memory. Single custom `ShaderMaterial` on `InstancedMesh` or `Line2` could make scenes look an order of magnitude better while freeing the main thread. Lensing shader is physically wrong. Cinematic shader uses `mediump` (Android banding risk). `time` uniform via `performance.now()*0.001` loses FP32 precision after ~20 minutes uptime.

### Real Bugs Found (Graphics subagent)

1. **`spacetime-view.js:81`** — `const marker_` shadows outer `let marker_`, barycenter marker never tracks grid surface. Straight bug, high confidence. Fix: drop `const`.
2. **`spacetime-app.js:114–123`** — `dispose()` leaks cached view instances other than the active one.
3. **`spacetime-view.js:190–196`** — dead `updateGauges` function.
4. **`post.js:30, 104`** — `precision mediump float` in desktop-only shader, banding risk.
5. **`lensing-model.js:164`** — `schwarzschild` shadow computed in raw UV space → horizontal oval, not circle.

### Top Recommendations (Graphics subagent)

**Top 3 refactors:**
1. Extract `shared/`: `buildStarfield()`, `buildDynamicGrid()`, composer setup. ~400 LoC removed.
2. Move vertex deformation to GPU via `ShaderMaterial` with uniforms — 20–100× speedup.
3. Replace grid with a deformed `PlaneGeometry` + shader-drawn grid lines — single mesh, infinite resolution, free AA.

**Top 5 graphics upgrades:**
1. Add ACES tone mapping (3 lines)
2. Env cubemap on spheres (10 lines)
3. `FogExp2` for depth (5 lines)
4. Real Einstein-ring lensing shader (30 min)
5. Replace `THREE.Line` with `Line2` (fat lines) for actual visible line width

---

## UX / UI Review

*Full report: `REVIEW_UX.md`*

### Executive Summary (UX subagent)

The tab looks cinematic at first glance and falls apart on second. Tactical-HUD vocabulary (corners, gauges, monospace, pulsing dot) is executed consistently enough to feel intentional. But the HUD is on **autopilot** — four of five rubber-sheet views use the same blue grid and blue sphere regardless of theme color. Per-view accent coloring is a sticker on the outside of a uniform experience. Gauges are a **decorative facade**: 22 of 24 gauge values across six views are hardcoded literals dressed up with a pulsing status dot that implies real-time telemetry. Speed sliders default to "1.0x" at the 4%-from-left mark of 0–2500 range with no ticks. Mobile is broken: space-sim d-pad renders over spacetime description, nav auto-collapses behind an invisible 28×27 expand button, gauge row overflows. **Confidence: high (0.9).**

### Extended Executive Summary (UX subagent)

Strongest point: narrative clarity. Nav labels ("BLACK HOLE", "BINARY SYSTEM", "WARP DRIVE"), 3-4 sentence explainers, physics vocabulary (Schwarzschild, Alcubierre, Kerr, Lense-Thirring) teaching the right words without talking down. Factory switch UX is well-considered and fast. Weakest point: **systematic mismatch between chrome and content**. HUD pretends to be tactical readout; only dynamic values are inspiral phase and slider labels. Theme-color differentiation is undermined by hardcoded cyan grids. Contrast ratios on body copy are 1.6–2.2:1 (WCAG AA requires 4.5:1). Mobile is effectively non-functional.

### Top Recommendations (UX subagent)

1. Push accent color into the 3D scene (2-3 hours) — highest-impact visual change
2. Reduce slider range to 0-5x with tick marks (30 min)
3. Reframe gauges: honest relabel as "Physics/Reference" or wire real dynamic values (1-6 hours)
4. Hide `#mobile-dpad` when `#spacetime-app` is active (1 CSS rule)
5. Bump body opacity from 0.35 → 0.60 (1 CSS value)

Overall score: **5/10** — strong first impression, real cracks on second look. One afternoon lifts this to 8.

---

## Science Education Review

*Full report: `REVIEW_EDUCATION.md`*

### Executive Summary (Education subagent)

Genuinely beautiful visual work — the ray-marched Gargantua, wind-tunnel Alcubierre, screen-space lensing shader are at the high end of what browser WebGL can do in 2026, comparable to Kurzgesagt/NASA ScienceOn. But as an **educational** tool it is under-written. Five of six views lean on a rubber-sheet metaphor (2D grid + central dimple) that descriptions never acknowledge is a metaphor, never explain limits of, and in places subtly reinforce as if it *is* general relativity. Text is factually careful in the footnote sense (dates, symbols, detector names correct) but uniformly dense, jargon-first, reads like wall-plaque copy rather than an explanation of *why any of this should matter to you*. No narrative arc, no guided path, no "start here," no moment where a learner is told that a curving grid is not how gravity actually works. A curious 16-year-old leaves visually impressed but conceptually in the same place they started. **Confidence: 85%.**

### Extended Executive Summary (Education subagent)

The tab is best understood as a **gallery of beautifully rendered demos with physics-themed HUD chrome** — not an educational module. Core problem: mismatch between what visuals *show* (2D embedding diagram of spatial curvature with ball in dimple) and what text *says* ("both masses warp the fabric of spacetime"). Visual is a metaphor for one particular slice of curvature; text treats it as literal. Exactly the trap Sean Carroll, Brian Greene, and Matt O'Dowd spend entire episodes warning against. Pairing the visual with authoritative formulas (α = 4GM/rc²) and dates (Einstein 1915) lends the metaphor more scientific weight than it deserves. Alcubierre description is worst offender: "requires exotic matter with negative energy density" never tells the reader that such matter has never been observed and is not known to exist in macroscopic quantities. Net: current tab dispels one misconception (light bending, via Lensing) and **reinforces at least three** (rubber-sheet, warp-drive-achievability, GW-as-water-waves).

### Top Recommendations (Education subagent)

**Top 3 content improvements (half day of writing):**
1. Add a one-screen tab intro that names the rubber-sheet as a visual aid and introduces time dilation
2. Rewrite all 6 descriptions hook-first (current style: "Gravitational wave inspiral — two compact objects spiral inward"; hook style: "When two black holes fall toward each other, they shake spacetime itself. In 2015, for the first time, we heard them")
3. Add a "What you're really looking at" dismissible toggle on rubber-sheet views explaining the metaphor's limits

**Top 5 new features:**
1. Embedding diagram disclosure toggle
2. Split-screen compare mode (Schwarzschild vs Kerr for Frame Drag)
3. **LIGO chirp audio on Inspiral** (the single most famous-and-omitted feature)
4. Guided-tour mode (intro → BH → binary → inspiral → ringdown → …)
5. Per-view misconceptions panel

**Net grade:** Visuals A−, text C−, net **C+**.

---

## Product / Interactive Experience Review

*Full report: `REVIEW_PRODUCT.md`*

### Executive Summary (Product subagent)

The tab opens with a world-class hook — the Interstellar-grade ray-marched Schwarzschild black hole is the strongest single 3D asset in Project Tycho and one of the better real-time black hole renders on the public web. After that opening frame, the experience collapses into five rubber-sheet-with-a-ball demos that share a single visual language (blue sphere on blue wireframe grid over blue starfield) and ask the user to do essentially nothing beyond rotating the camera and occasionally nudging a time slider. Drop-off between "Black Hole" and the rest is brutal. Views are nearly indistinguishable from each other at a glance. As currently composed it reads as *one incredible demo plus five screensavers*. Fix is not more rubber sheets — it's agency, unification, and a few "throw the thing, watch spacetime react" interactions. **Confidence: 9/10.**

### Extended Executive Summary (Product subagent)

Best understood as a portfolio of technical demos searching for a product. Each view demonstrates a theorem; none gives the user a *question* to answer or a *toy* to play with. Hero asset (blackhole.js) is extraordinary. Remaining five views, built on shared `buildDynamicGrid + updateGrid` scaffold, are visually homogeneous. Only "control" on most views is a Speed slider. No mass slider, no Kerr spin dial, no target to shoot, no camera preset, no share button, no story.

**Killer missing moves:**
1. **Agency over physics itself** — drop-a-star-into-disk button, mass sliders, fire test particles
2. **Narrative continuity** — six views are *one spacetime* you fly through (Binary → Inspiral → Black Hole is literally the same object's life story), not six separate tabs

### Top Recommendations (Product subagent)

**Top 3 product moves:**
1. **Rebuild as a guided "Life of a Binary" journey** with current views as chapters + free-roam sandbox
2. **Expose every physics constant as a slider** — they already exist as shader uniforms
3. **Add fire-a-photon / drop-a-particle click interaction** to Black Hole — transforms observation into experimentation

**Top 5 easy wins:**
1. Expose `diskTilt` on BH (5 lines of HTML)
2. Make Frame Drag spin continuous not boolean
3. Wire HUD readouts to actual dynamic values (e.g. inspiral frequency)
4. WebAudio chirp on Inspiral (LIGO sound)
5. `1-6` keyboard shortcuts

**Top 3 cuts:**
1. **Lensing as standalone** — BH already does proper lensing via ray-marching; fold it in
2. **Frame Drag as standalone** — it's just a Kerr parameter; make it a spin slider on BH
3. The universal "0-25x speed" slider that's the only control on most views

**Agency scores by view:** BH 0/10, Binary 2/10, Warp 1/10, Lensing **5/10** (only view where user controls something they can see changing), Inspiral 2/10, Frame Drag 2/10. Average 2/10.

---

## Cross-Disciplinary Synthesis

### Where All Five Reviews Converge

**These findings appeared, unprompted, in multiple reviews:**

| Finding | Physics | Graphics | UX | Education | Product |
|---|---|---|---|---|---|
| Black Hole is a world-class hook, the other 5 are a severe downgrade | ✓ | ✓ | ✓ | ✓ | ✓ |
| Rubber-sheet metaphor is over-used (5 of 6 views) | ✓ | — | ✓ | ✓ | ✓ |
| Agency/interactivity is nearly absent | — | — | ✓ | ✓ | ✓ |
| HUD gauges are static strings masquerading as live data | — | — | ✓ | ✓ | ✓ |
| Views are visually too similar | — | ✓ | ✓ | — | ✓ |
| Code duplication across model files | — | ✓ | — | — | — |
| Speed slider range is wrong | — | — | ✓ | — | ✓ |
| Physics parameters should be user-controllable | ✓ | — | — | — | ✓ |
| Missing: GW polarization pattern (+/×) | ✓ | — | — | ✓ | — |
| Text descriptions are flat / jargon-first | — | — | — | ✓ | ✓ |
| Theme accent color doesn't reach the 3D scene | — | — | ✓ | — | ✓ |
| Missing: LIGO chirp audio on Inspiral | — | — | — | ✓ | ✓ |

The darkest column in the heatmap is "these 5 things appear in 4+ reviews":
1. Black hole is a cliff — other 5 views a downgrade
2. Rubber-sheet is over-used as a metaphor AND as a visual template
3. Agency / interactivity is missing
4. Views are too visually similar (theme accent doesn't reach 3D)
5. HUD gauges deceive — static content in live-telemetry chrome

### Where Reviews Diverge

**Physics subagent's strongest push: fix the physics bugs.** None of the other four reviews caught the lens equation sign error, the Lense-Thirring exponent, or the Kepler inconsistency. These are all correct technically, and no one else's lens catches them because they're only visible to someone who knows the formulas. This is a clear argument for expert review.

**Graphics subagent's strongest push: refactor and move to GPU.** Only this review surfaces the per-vertex JS cost, the `buildStarfield` duplication, the `marker_` shadowing bug, the `mediump` precision concern, and the Line2 upgrade. These are the kind of findings that save engineering time long-term but don't show up in a user-facing audit.

**UX subagent's strongest push: slider ranges + accessibility + mobile.** Only this review opened the site at 390×844 and saw the mobile d-pad overlap; only this review computed contrast ratios and found the 1.6:1 body copy; only this review counted gauges and noted that 22/24 are static.

**Education subagent's strongest push: text quality and metaphor framing.** Only this review argues that "rewriting six paragraphs" is the single highest-leverage half-day of work available — the code changes matter less than the framing.

**Product subagent's strongest push: unify the tab as a journey, cut the weaker views.** The strongest structural recommendation — that Binary + Inspiral + Black Hole + Frame Drag + Lensing is literally the same object's life story and should be one experience — only emerged from the product/experience lens. The other reviews analyzed views individually; only this one stepped back to see the five views as pieces of a larger narrative.

### What the Convergence Tells Us

The five findings that appeared in 4+ reviews are the highest-priority issues **by definition** — they are the things multiple independent perspectives, each given different analytical frames, all flagged as important. These are:

1. Black hole hook → rubber-sheet cliff
2. Metaphor overuse
3. Agency deficit
4. Visual sameness
5. Deceptive HUD gauges

Anything we do should address at least two of these. The cheapest fixes address multiple at once:

- **Push accent color into the 3D scene** — addresses (4) and visually differentiates the rubber-sheet views so they're less interchangeable, which reduces the (1) cliff.
- **Expose physics uniforms as sliders** — addresses (3) and (5), because the gauges can be wired to reflect the slider values, and the static-label problem becomes a live-readout solution.
- **Rewrite descriptions hook-first + add metaphor-caveat tooltip** — addresses (2) and partially (1) because a better-written intro makes the rubber-sheet views feel less like a downgrade.

---

## Consolidated Priority Recommendations

*Organized by impact/cost ratio, drawn from convergence across all 6 reviews (5 subagents + my own).*

### Tier 0 — Must-Fix Bugs (1 hour total)

1. **Lensing shader: wrong sign and exponent.** Currently pushes stars outward with 1/r² — real lensing pulls inward with 1/r. Two-line fix. (Physics)
2. **`marker_` shadowing bug in `spacetime-view.js:81`.** Barycenter marker never tracks the grid. Drop one `const`. (Graphics)
3. **Frame Drag exponent: 2.5 → 3.0.** Correct Lense-Thirring scaling. One-line fix. (Physics)
4. **Binary `ORBIT_SPEED` hardcoded.** Use Kepler `sqrt(TOTAL_MASS / SEPARATION^3)` for consistency with Inspiral. One-line fix. (Physics)
5. **Mobile d-pad overlaps spacetime description.** One CSS rule. (UX)
6. **Body copy opacity 0.35 → 0.60 for WCAG AA.** One CSS value. (UX)
7. **Dead `updateGauges` function in `spacetime-view.js:190-196`.** Delete. (Graphics)

### Tier 1 — Single-Afternoon Wins (4–6 hours total)

1. **Slider range 0–25x → 0–5x with tick marks.** Defaults work. Precision improves 5×. (UX, Product)
2. **Push theme accent into 3D scene** — per-view grid tint + sphere emissive + star warmth. Finally differentiates the five rubber-sheet views. (UX, Product, Graphics)
3. **Expose existing shader uniforms as sliders** — BH `diskTilt`, `bhMass`; Binary `A_MASS`/`B_MASS`/`SEPARATION`; Frame Drag continuous spin. (Product, UX)
4. **Wire HUD gauges to dynamic values** where possible (inspiral frequency, orbital phase, current spin). Drop "gauge" framing for pure static labels. (UX, Education)
5. **Binary GW ripples: radial → cos(2φ) pinwheel.** Physically correct AND more visually striking. ~60 min. (Physics, Education)
6. **Add LIGO chirp audio to Inspiral.** The most famous-and-omitted feature of the whole tab. WebAudio in 30 min. (Education, Product)

### Tier 2 — Half-Week Upgrades (2–3 days total)

1. **Rewrite all six description paragraphs hook-first.** Per the education review: facts unchanged, storytelling added. Single highest-leverage writing work available. (Education)
2. **Add a tab-level intro screen** that names the rubber-sheet metaphor as a metaphor, introduces time dilation, provides a "start here" path. (Education, Product)
3. **Extract `special/shared/` helpers** — dedupe `buildStarfield`, `buildDynamicGrid`, composer setup. ~400 LoC removed, maintenance unified. (Graphics)
4. **Move grid deformation from JS to GPU** — `ShaderMaterial` with uniforms. 20–100× speedup on grid views. (Graphics)
5. **Add ergosphere surface to Frame Drag view.** The single most visually interesting Kerr feature, currently absent. (Physics, Product)
6. **Add a "What you're really looking at" dismissible toggle** on rubber-sheet views explaining the metaphor's limits. (Education)

### Tier 3 — Strategic (1+ week)

1. **"Life of a Binary" guided journey** — unify Binary + Inspiral + Black Hole + Frame Drag into one experience with current views as chapters + a sandbox mode. (Product)
2. **Replace `THREE.Line` with `Line2` (fat lines) across the tab** — finally fixes the 1-pixel aliased GL_LINES limit that defeats all the per-vertex color work. (Graphics)
3. **Consider cutting Lensing + Frame Drag as standalone views** — Lensing is already done properly by the BH ray-marcher (fold it in); Frame Drag is a Kerr parameter (make it a spin slider on BH). Net simpler tab, better BH view. (Product)
4. **Add one non-rubber-sheet view** — candidate: **light cones tipping near a horizon** (breaks the metaphor) OR **GW polarization with a ring of test particles** (corrects the water-ripple misconception). Either addresses the five-views-all-rubber-sheet problem AND teaches something the other views can't. (Physics, Education)
5. **Add fire-a-photon / drop-a-test-mass click interaction** on the Black Hole view. Transforms observation into experimentation. This is the single feature most likely to take the tab from "cool demo" to "toy people return to." (Product)

### New Views Worth Building — Ranked by Impact (Drawn from All Reviews)

Combining recommendations from all reviewers:

1. **GW polarization (+/×) with a ring of test particles** (Physics, Education) — corrects the water-ripple misconception, visually striking, breaks rubber-sheet monotony
2. **Light cones tipping near a horizon** (Physics) — breaks rubber-sheet, shows causal structure, genuinely novel visualization
3. **Gravitational redshift with two clocks at different depths** (Physics) — makes time curvature tangible, the single most important-and-missing concept
4. **Tidal effects / spaghettification** (Physics, Product) — visceral, visual, correct, teaches geodesic deviation
5. **Microlensing light curve** (Physics) — time-domain counterpart to Lensing, concrete scientific output
6. **Photon sphere / unstable circular orbit** (Physics, Product) — near the BH, teaches ISCO and orbital stability
7. **ISCO visualization — stable vs unstable orbits as a slider** (Physics, Product)

**If I had to pick one to build:** GW polarization with the test-particle ring. It simultaneously (a) corrects a real misconception currently reinforced by the Binary view, (b) breaks the rubber-sheet visual monotony, (c) is genuinely visually striking (imagine a ring of glowing points rhythmically oblating and prolating as waves pass), and (d) has natural interactivity (user can rotate the wave propagation axis, see polarization modes).

---

## Final Note

This review was performed by six reviewers in parallel: one first-party (me, with full context of the build history) and five zero-context specialists (physics, graphics, UX, education, product). The convergence across the five independent zero-context reviews is the strongest signal. When four or five different disciplinary lenses all flag the same thing as important, that's a priority signal that transcends any one perspective's biases.

The tab is in a genuinely good place to be rapidly improved — most of the work is **small fixes, not new features**. One focused week fixes the bugs, ships the easy wins, and lifts this from "competent hobbyist demo" to "genuinely strong educational tool." The strategic decisions (unify into a journey? cut redundant views? add a non-rubber-sheet view?) are worth discussing before that week begins.

The individual subagent reports (`REVIEW_PHYSICS.md`, `REVIEW_GRAPHICS.md`, `REVIEW_UX.md`, `REVIEW_EDUCATION.md`, `REVIEW_PRODUCT.md`) contain extensive detail, specific line numbers, code-level suggestions, and confidence scores that are too granular to reproduce here. Read those for implementation specifics.
