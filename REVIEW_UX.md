# UX/UI Review — Spacetime Tab

*Reviewer: senior UX/UI designer. Scope: the 6 sub-views under the Spacetime tab (Black Hole, Binary System, Warp Drive, Lensing, Inspiral, Frame Drag). Evidence: live capture at 1600×900 and 1920×1080 retina, mobile capture at 390×844, CSS audit of `#spacetime-app` (index.html 1765–1888, 2843–3144), and `src/spacetime-app.js`. Confidence scores inline. I opened the site and clicked through every view; I am *not* guessing.*

## Executive Summary

The Spacetime tab looks cinematic at first glance and falls apart on second glance. The black hole splash is a genuine wow moment and the tactical-HUD vocabulary (corners, gauges, monospace, pulsing status dot) is executed consistently enough to feel intentional. But the HUD is running on **autopilot** — four of five rubber-sheet views use the same blue grid and the same blue sphere regardless of theme color, which makes the per-view accent coloring feel like a sticker on the outside of a uniform experience rather than genuine differentiation. The gauges are a **decorative facade**: 22 of 24 gauge values across the six views are hardcoded literals ("15 M☉", "Keplerian disk", "Einstein (1915)") dressed up with a pulsing status dot that implies real-time telemetry. The speed sliders default to "1.0x" at the 4%-from-left mark of a 0-to-2500 range with no tick marks or end labels, so users will slide right into "25x" before they understand what they've done. And the mobile build is broken: the nav is auto-collapsed behind an invisible 28×27 expand button, the space-sim d-pad renders over the spacetime description text, and the bottom gauge row overflows off-screen. **Confidence: high (0.9).**

## Extended Executive Summary

The *strongest* point of this tab is its narrative clarity: the left nav is plain-English ("BLACK HOLE", "BINARY SYSTEM", "WARP DRIVE"), each view has a single headline title plus a 3-4 sentence explainer, and the physics vocabulary on the gauges — Schwarzschild, Alcubierre, Kerr, Lense-Thirring, LIGO 2015 — teaches the right words without talking down. A user who lands here and reads top-to-bottom actually learns something. That's rare in educational visualizations. The factory-switch UX (one click, instant view swap) is also well-considered and fast.

The *weakest* point is the **systematic mismatch between chrome and content**. The HUD pretends to be a tactical readout — status dot pulsing, "ACCRETION DISK ACTIVE", "GW EMISSION ACTIVE" — but the only dynamic values anywhere are (a) the inspiral phase indicator (INSPIRAL → MERGER → RINGDOWN → RESETTING) and (b) the speed/strength labels on sliders. Every other gauge is a static physics label. This is not *wrong*, exactly — but it's a lie the HUD tells, and users notice. Worse, the theme-color differentiation (orange, cyan, orange, purple, teal, rose) is undermined by the fact that the 3D scenes themselves hardcode cyan grids and stars, so the accent color lives almost entirely in 6-11px label text that reads as faded decoration rather than identity. Contrast ratios on description body copy are **1.6–2.2:1** — well below WCAG AA (4.5:1). The mobile experience is effectively non-functional for spacetime because the expand-nav tab has near-zero affordance.

The fix list is short and the wins are concrete: hide or relabel the fake gauges, reduce slider range to something intuitive (0-5x with tick marks at 0/1/2/5), kill the space-sim d-pad on the spacetime tab, give the mobile nav-expand a visible affordance, and lift description opacity from 0.35 to 0.55 or 0.6. One afternoon of work gets this to "solid."

---

## Detailed Analysis

### 1. Visual Consistency & Design Language

**Typography.** Single font (Share Tech Mono) across all six views, consistent sizing ladder: 14px titles with 5px letter-spacing, 11-13px gauge/coord values, 10-12px labels with 2-3px tracking. This is the one thing the tab gets *really* right. It reads as one product. **Confidence: high.**

**Spacing / alignment.** Top-left title, top-right status dot+label, bottom-left description, bottom-left gauge row, bottom-right controls — the grid is consistent across all 6 views. The corner brackets (.corner-tl etc.) are a nice framing device and they're identical across views. Hairline 1px accent border with 16px margin gives the whole thing a "viewport" feel. This works. **Confidence: high.**

**Theme differentiation (major problem).** Each view gets a theme class (`theme-blackhole`, `theme-spacetime`, `theme-alcubierre`, `theme-lensing`, `theme-inspiral`, `theme-framedrag`) that sets `--sp-accent` and `--sp-bg`. I probed the DOM — this *works* correctly, the accent variable does change. But:

- **Only the HUD text adopts the accent.** The 3D grid lines, stars, spheres, and warp rings are hardcoded cyan/blue inside the view JS files. So Binary System (cyan theme) and Warp Drive (orange theme) look nearly identical on-screen because both show a blue grid with blue deformation, differentiated only by faded 10-12px orange vs cyan text in corners. That's a weak signal — far too weak to read as "a different concept."
- **Black Hole is the exception** because it's a completely different scene (ray-marched disk with warm orange bloom). It earns its orange theme. The other five look like recolored variants of "blue blob on blue grid."
- **Net effect:** the theme-color system is doing *accessibility/branding* work (HUD accent) but is *failing* at content-differentiation work. A user rapidly switching between Binary/Warp/Inspiral/Framedrag may not notice they changed views.

**Recommendation (high impact, 2-3 hours):** Push the accent color into the 3D grid (tint the LineBasicMaterial's color per-view), into the sphere emissive, and into the star warmth distribution. Same orange grid for warp, purple grid for lensing, rose grid for framedrag — suddenly each view reads as its own thing.

**Confidence: high (0.9).**

### 2. Information Architecture & Controls

**Nav.** The left nav is excellent: 6 items, alphabetized by discovery not alphabet (Black Hole first as the hero), all-caps monospace, cyan active-state with a 2px left border. The nav has a "VIEWS" header and a close-X in the top-right. Clean. **Confidence: high.**

**The "fake gauge" problem (significant).** Every view has a 4-gauge row at the bottom. Across all 6 views, I count 24 gauges. Of those:
- **2 are dynamic:** `sp2-inspiral-phase` (INSPIRAL → MERGER → RINGDOWN → RESETTING) and the slider-value labels.
- **22 are static string literals:** "Schwarzschild", "Ray-marched", "15 M☉ (r = 2.5)", "σ = 3", "Alcubierre (1994)", "Einstein (1915)", "Gravity Probe B (2011)", "Quadrupole", "Kerr", etc.

The problem is that these static labels sit inside a chrome that screams "live telemetry" — pulsing dot, "STATUS: OBSERVING", "STATUS: ORBITING", monospace readout styling. The convention throughout tactical/sci-fi HUDs is that values in that position *update*. When the user clicks Binary System and sees "PERIOD ~31 s," they will reasonably expect a counter or a changing value. They don't get one.

Two options:
1. **Honest relabel (recommended).** Rename these "gauges" to "Facts" or "Parameters" or "About". Drop the status dot on static views. Keep the visual treatment but signal "this is reference info, not telemetry."
2. **Make them dynamic.** Some *could* be: the binary system could expose orbital period, phase angle, separation; the inspiral could expose frequency/amplitude; the framedrag could expose current spin rate. That's more work, but more rewarding.

Either way, the status quo is misleading. **Confidence: high (0.9).**

**Sliders (major UX flaw).**
- Range is `min=0 max=2500 value=100` mapping `slider.value / 100` → `speedMultiplier`. So the slider covers 0x–25x, default is 1x, and **1x sits at 4% from the left edge**.
- There are no tick marks, no midpoint indicator, no end labels ("0x | 25x"), no visual hint that the default is the "normal" position.
- A first-time user sees a nearly-empty slider bar and assumes they need to drag right to "start" the simulation. When they do, the simulation jumps to 5x, 10x, 15x speed and the grid starts wobbling chaotically. They will not understand that they were already at 1x.
- Secondary issue: slider bar is 120px wide with a 12px thumb — that's a 108px draggable travel distance for a range of 0-25x. Precision is poor (each pixel = ~0.23x). Trying to dial in "2x" from scratch is guesswork.

**Recommendation:** drop the range to `min=0 max=500 value=100` (0-5x), add tick marks at 0/1/2/5 via CSS gradient, and show the range bounds. Speeds above 5x aren't useful for these simulations anyway (the grid updates look identical at 10x and 25x).

**Confidence: high (0.95).**

**Toggle controls (Binary GW / FrameDrag Spin).** Using a native `<input type="checkbox">` with `accent-color` set. Works, but stylistically a mismatch — a 16px square white checkbox sits awkwardly next to the 10px-2px-letterspacing monospace labels. Every other control is custom-styled. The checkbox looks like a forgotten debug toggle.

**Recommendation:** build a 2-state pill toggle that matches the sci-fi vocabulary (like the `mode-btn` pattern already in the special-app). 20 minutes of work.

**Binary System control stack.** This is the only view with *two* controls (Grav Waves toggle + Speed slider), stacked vertically in the bottom-right. The toggle is at `bottom: 112px; right: 24px;` and the slider is at `bottom: 80px; right: 24px;`. This works, but the two controls are clearly living in ad-hoc inline styles rather than a proper control cluster with shared padding/gap rules. Visually OK. Structurally fragile.

**Confidence: high.**

### 3. Theme Colors

Measured contrast ratios against pure black (the actual rendered background in most views):

| View        | Accent    | Full  | Title (0.75) | Coord (0.55) | Gauge (0.7) | Desc/Label (0.35) |
|-------------|-----------|-------|--------------|--------------|-------------|-------------------|
| Black Hole  | #e0a040   | 9.3   | 5.4          | 3.3          | 4.8         | **1.9 FAIL**      |
| Binary Sys  | #40ddee   | 12.8  | 7.2          | 4.2          | 6.4         | **2.2 FAIL**      |
| Warp Drive  | #e09030   | 8.2   | 4.8          | 3.0 *fail*   | 4.3         | **1.8 FAIL**      |
| Lensing     | #c0a0ff   | 9.7   | 5.6          | 3.4          | 5.0         | **1.9 FAIL**      |
| Inspiral    | #50e0c0   | 12.8  | 7.2          | 4.1          | 6.3         | **2.2 FAIL**      |
| Frame Drag  | #e06090   | 6.2   | 3.8          | **2.5 FAIL** | 3.4         | **1.6 FAIL**      |

WCAG AA for normal text (below 18pt) is **4.5:1**. For large text (18pt+) is **3:1**. Notes:

- **All descriptive body copy (4 lines at 13px, opacity 0.35) fails AA** across every view. This is the primary text the user is supposed to read to *learn what they're looking at*.
- Inactive nav button text is at opacity 0.4 — effectively equal or worse than description. Also fails.
- Frame Drag is the worst-case palette; the rose hue only reaches 6.2:1 at full opacity versus cyan's 12.8:1. Frame Drag's coord row at 0.55 fails AA even for large text.
- Title text at 0.75 is broadly fine (4.8-7.2:1).

**Is the color-per-view idea working?** As a functional element, no. The accent is too faint to register at the sizes used. As a *brand / differentiation* element, it would work if the accent bled into the 3D scene itself (see §1 recommendation).

**Recommendation:** bump body description opacity from 0.35 → 0.60, bump gauge values from 0.7 → 0.85, bump inactive nav from 0.4 → 0.55. The sci-fi aesthetic will survive — it's currently too dim to read, which is a failure mode, not a style.

**Confidence: high (numerical).**

### 4. HUD Density

My count for a single view (Binary System):
- 4 corner brackets
- 1 outer 1px border at 16px inset
- 1 title + 1 coord line (2 elements)
- 1 status dot + 1 status label
- 1 view nav with 7 visible elements (VIEWS header + 6 buttons + close X)
- 4 gauges (8 elements — label + value each)
- 1 description block (~3 lines of body text)
- 2 controls (GW toggle + Speed slider)
- App switcher with 5 tabs at top

That's ~30 on-screen elements before the 3D scene is counted. Is it too much?

- **For desktop (1920×1080): it's busy but works.** The eye has room. The low opacities intentionally push chrome into the background. Nothing actually collides or overlaps.
- **For desktop (1280×720): starting to feel cramped.** Description text nearly touches the gauge row. Not broken.
- **For mobile (390×844): broken.** The description (originally 500px max-width) wraps over the d-pad region. Gauges overflow the screen. Nav is hidden.

The HUD density is **appropriate for desktop-first educational content** but is doing **zero mobile-responsive work** beyond hiding a few corner brackets. See §6.

**Confidence: high.**

### 5. Accessibility

Beyond the contrast issues already documented:

- **Keyboard navigation:** The left view-nav buttons are `<button>` elements (good, focusable), but there's no visible `:focus` style anywhere in `#spacetime-app` CSS. Tab-through will work but not be visible. The hover style (increase opacity) is similar to focus in effect, but focus-visible should be explicit. **Confidence: high.**
- **Color-only information:** The inspiral phase indicator transitions through labels (INSPIRAL → MERGER → RINGDOWN), which is textual. Good. But the status dot pulses (animation: sp2-pulse) with no text alternative — for screen readers it's invisible, and visually it doesn't convey distinct states, just "something is active." Low importance.
- **Slider labels:** Sliders are `<input type="range">` (native, keyboard-accessible, correct). The label text is visual but not `aria-label`'d on the input. Screen readers will announce "slider" with no context. **Fix: add `aria-label="Simulation speed"` to each slider. 5 minutes.**
- **Animation:** Status dot pulses every 2s; no `prefers-reduced-motion` handling. Users who disable animations will still see it. Low importance (small element), but nonzero.
- **Description text:** 13px body at opacity 0.35 on black. Not just WCAG-failing — physically hard to read for anyone over 40 or with any visual impairment. **High importance.**

**Confidence: high.**

### 6. Responsive / Mobile

This is the worst-performing dimension of the tab. Findings from 390×844 capture:

1. **Nav is auto-collapsed but the expand button (`#st-nav-expand`) has near-zero affordance.** It's a 28×27 square positioned at (6, 140) with a dim accent border and no label. A mobile user will not see it. When I ran a Playwright mobile test with `isMobile: true`, the canvas captured all pointer events, making the expand button itself un-clickable in some gestures. Desktop version works fine. **This is a blocker.** Confidence: high (reproduced in scripted test).

2. **The space-sim d-pad (`#mobile-dpad`) renders in the Spacetime tab.** It's CSS-scoped to `display: flex !important` at mobile width with no `html[data-active-app=...]` selector. Spacetime has its own mouse-drag-only orbit controls; the d-pad sends keyboard events (W/A/S/D/Q/E) that nothing in the spacetime app listens to. So it's visible, tappable, and completely non-functional. It also overlaps the description text. **Fix:** hide `#mobile-dpad` when `#spacetime-app` is active. One CSS rule. **High importance.** Confidence: certainty (diffed CSS).

3. **Gauge row overflow.** The bottom HUD has 4 gauges with `gap: 32px` and `padding: 28px 38px`. At 390px viewport, that's not enough horizontal room — the gauges wrap to two rows and collide with the description. There's no mobile override. **Fix:** on mobile, reduce to 2 gauges or stack them vertically.

4. **Description max-width 500px, no mobile shrink.** On small screens it just wraps over whatever is beneath.

5. **The bottom-right controls stack (slider or toggle) is hardcoded at `right: 24px; bottom: 80px`.** On mobile it sits on top of the d-pad area. Even if the d-pad is hidden, the 120px-wide slider needs a mobile position.

**Verdict:** the Spacetime tab was designed for desktop and shipped to mobile without adaptation. This is not unusual for Three.js-heavy sites, but it should be acknowledged — or the mobile view should show an elegant "Best viewed on desktop" screen rather than a broken one.

**Confidence: high.**

### 7. Discoverability / First-time User Experience

Pretending I am a user who lands on the Spacetime tab for the first time:

- I see a ray-marched black hole. **Wow.** This is unambiguously great.
- I see "BLACK HOLE" in the top-left. I see a nav with 6 items. I understand I can switch.
- I see a description paragraph at the bottom-left telling me what this is. Cognitive load is appropriate.
- I see "TYPE: Schwarzschild" / "RENDERING: Ray-marched" — I might read these, I might not; they don't impede me.
- **I do NOT see any control** on the black hole view. (Confirmed — Black Hole is the only view without a slider or toggle.) So the black hole is *not* interactive, it's a showcase. That's fine, but there's no visual cue that I can click other views to get interactive ones.
- I click "BINARY SYSTEM." I see two blue spheres on a warped grid. I see "Grav Waves ☑" and "SPEED [slider at 4%] 1.0x" in the bottom-right. I probably try the slider first. I drag right. The simulation speeds up chaotically. I drag back. I notice nothing broke. Good.
- I toggle "Grav Waves" off. The animation changes subtly — the ring structure disappears. I may or may not understand *why* that matters. There's no in-view legend.

**Learnability:** moderate. Users who *read* the description learn things. Users who just *poke* get mixed feedback. The gauges don't teach anything because they don't respond.

**First action likely:** drag the speed slider, because sliders scream "interact with me." That's fine. But then the user has no indication that their expectations about toggles / gauges are unmet.

**Recommendation:** add a one-line micro-tooltip or subtle visual hint ("TIP: Drag the canvas to orbit, scroll to zoom") for each view. ~1 hour.

**Confidence: moderate (0.7) — first-time UX is hard to measure without real testing.**

### 8. Microinteractions

- **Tab switch (app-level):** appears instant. Actually it's `renderer.toneMappingExposure` change + dispose/init. No fade, no loading spinner. On slower machines, there may be a 100-300ms white flash. Acceptable. **Confidence: moderate.**
- **View switch (intra-spacetime):** `switchView()` disposes the old view and inits a new one. There's no transition — the screen goes black-ish for ~100ms while the new composer initializes. This is abrupt. A 200ms fade-out of the old view + fade-in of the new would feel much more polished.
- **Slider feedback:** changes the `1.0x` label in real-time. Good.
- **Toggle feedback:** native checkbox, no animation. Should be a custom toggle with smooth state transition.
- **Status dot pulse:** 2s ease-in-out, opacity 1→0.4→1. Subtle, appropriate, works.
- **Nav button hover/active:** opacity shift + 2px left border on active. Clean.
- **No loading state** for the black hole view which takes longer to compile the ray-march shader. Users see a black screen for ~400-800ms after clicking into the tab for the first time. A skeleton loader or fade-in would hide this.

**Confidence: high (measured).**

### 9. Gauge/Telemetry Design

This overlaps with §2 but deserves its own section because it's a foundational choice.

**Verdict: misleading.** Specifically:

- The HUD vocabulary (`STATUS: OBSERVING`, `STATUS: ORBITING`, pulsing dot, "EMISSION ACTIVE") makes a promise: something is being monitored.
- The values displayed (`15 M☉`, `σ = 3`, `Einstein (1915)`) are reference labels.
- These categories are confused. A real telemetry HUD mixes: live values (frequencies, positions), setpoints (target mass, target spin), and reference info. This HUD has no live values in most views — it's all reference info dressed as telemetry.

**This is a taste/honesty issue, not a bug.** It works for the demo/wow effect. It weakens the educational mission (if every number is static, users can't develop intuition by seeing them move). And it has already caused the primary reviewer (you) to flag "static labels masquerading as real-time telemetry" — which means it's also causing cognitive dissonance for the designer, not just users.

**Three honest paths:**

1. **Own the reference-card framing.** Rename the status dot + pulse, the "STATUS: OBSERVING" lines, and reconceive the bottom row as a "Physics Card" with proper card styling. Gauges become small inset stat blocks. Keep the monospace chrome but drop the telemetry fiction. **Cheapest fix. ~1 hour.**
2. **Make the gauges dynamic.** Binary System shows orbital period (already known, just compute phase), phase angle, instantaneous separation, GW emission rate. Inspiral shows GW frequency and amplitude (already computed internally, just bind to DOM). Frame drag shows angular velocity. Warp drive shows the `σ` as you drag the slider. ~4-6 hours.
3. **Hybrid.** Drop static gauges on non-interactive views (Black Hole, Lensing), keep dynamic gauges on views where they'd tell a real story. ~2-3 hours.

I'd advocate for (2) — the educational payoff is significant and it's exactly the kind of thing that separates a good viz from a screensaver.

**Confidence: high.**

---

## Per-View Issues

| View         | Signature issue                                                                                                                 | Severity |
|--------------|---------------------------------------------------------------------------------------------------------------------------------|----------|
| Black Hole   | No interactive control. No slider/toggle. User has no way to influence the scene. Consider: "Disk Hotness" slider. Or an M slider. | Medium   |
| Binary System| Grid is cyan, not theme-colored. Checkbox is style-mismatched. Two stars' masses shown as static; actual orbital period is computable and could be live. | High     |
| Warp Drive   | Theme is orange but every visible 3D element is cyan. "ENERGY DENSITY < 0 (exotic)" is the one styled gauge with a colored value (good touch, underused pattern). | High     |
| Lensing      | Visual is starfield only — no clear "lens." The lensed deflection is subtle, and with the sliding strength at 1x the effect is nearly invisible. User may think the view is broken. "Lens Type: Point mass" static. No indicator of *where* the lens is. | High     |
| Inspiral     | Phase indicator is genuinely live and great (only dynamic gauge in tab). But it's buried in the coord row; could be promoted to a dedicated phase meter bar. | Low      |
| Frame Drag   | Rose accent is the lowest-contrast palette (6.2:1 full). Grid is still cyan despite rose theme. "Toggle spin on/off to compare" — the toggle works, the difference is subtle, no side-by-side. | Medium   |

---

## Recommendations

### Top 3 UX Improvements (highest impact)

1. **Push the theme accent into the 3D scene, not just the HUD.** Tint grid lines, sphere emissive, star warmth per-theme. This single change transforms the tab from "one visualization with 6 recolored HUDs" into "6 distinct visualizations." Strongly recommended. **Effort: 2-3 hours. Impact: very high.**

2. **Reduce slider range and add tick marks.** 0-5x with ticks at 0/1/2/5, default visually centered-ish at 1x. Users will never again accidentally slam to 25x and think they broke it. Add `aria-label`s while you're there. **Effort: 30 min. Impact: high.**

3. **Reframe the bottom-row "gauges" honestly.** Either rename them as "Physics" / "About" / "Reference" (cheap), or wire real dynamic values into at least Binary System and Inspiral (expensive but educational). Drop the pulsing status dot on non-dynamic views. **Effort: 1-6 hours depending on path. Impact: medium-high.**

### Top 5 Visual Polish Wins

1. **Bump body opacity from 0.35 → 0.60.** Descriptions become readable. Single CSS change. **Confidence: certainty.**
2. **Replace native checkbox with custom pill toggle.** Matches the sci-fi vocabulary of everything else. 20 min.
3. **Add a 150-250ms fade transition between view switches.** Hides the brief-black abrupt-swap artifact. Tiny CSS + a setTimeout.
4. **Style focus-visible states on all buttons and sliders.** Currently invisible on keyboard tab-through. 15 min.
5. **Add subtle "TIP" microcopy per view:** "Drag to orbit · Scroll to zoom" in bottom-left above the description. Teaches camera controls. 30 min.

### What to Cut / Simplify

- **Cut the static gauges on Lensing and Black Hole** — they don't earn their space. The description is enough.
- **Cut "STATUS: OBSERVING"** from all non-dynamic views. It's performative — use it only where something is actually active (Inspiral, Binary).
- **Cut the app switcher border / gradient styling** on mobile — it's competing with content for attention. Simplify to plain-text tabs below 768px.
- **Merge the 3 nearly-identical slider CSS blocks** into a shared `.sp2-slider` class. Currently each view re-declares the styles inline.
- **Consider cutting Frame Drag's rose accent** and using a deeper plum/violet — the rose fails AA on small text and competes poorly with the cyan-dominant 3D content.

---

## Summary Scores (1-10)

| Dimension                  | Score | Notes                                                              |
|----------------------------|-------|--------------------------------------------------------------------|
| Visual consistency         | 8     | Typography and layout consistency are genuinely strong.            |
| Theme color effectiveness  | 4     | Doesn't reach the 3D content; theme is HUD-only.                   |
| Information architecture   | 6     | Nav excellent, gauges misleading, sliders poorly ranged.            |
| Accessibility              | 3     | Body text fails WCAG AA across the board; no focus states.         |
| Mobile / responsive        | 2     | Fundamentally broken. D-pad overlay, invisible nav, overflowing gauges. |
| First-time discoverability | 7     | Users learn what they're looking at; fail modes are forgiving.     |
| Microinteractions          | 5     | Slider labels live; everything else abrupt.                        |
| Honesty of telemetry chrome| 4     | The HUD implies dynamic readouts it doesn't deliver.               |
| Overall                    | **5** | Strong first-impression, real cracks on second look.               |

---

*End of review. Happy to drill deeper into any dimension, prototype a cleaned-up HUD, or script the contrast / slider / theme fixes. Confidence in the findings above: high across the board, with measured data supporting contrast, mobile, and static-vs-dynamic-gauge claims.*
