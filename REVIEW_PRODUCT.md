# Product / Interactive Experience Review — Spacetime Tab

*Reviewer lens: senior product/game designer with background in museum-grade interactives (Hayden Planetarium, California Science Center), cinematic games (No Man's Sky, Elite Dangerous), and VR experiences (Tilt Brush, SUPERHOT VR).*

## Executive Summary

The Spacetime tab opens with a genuinely world-class hook — the Interstellar-grade ray-marched Schwarzschild black hole is the strongest single 3D asset in Project Tycho and one of the better real-time black hole renders on the public web. After that opening frame, however, the experience collapses into five rubber-sheet-with-a-ball demos that a physics teacher from 2009 would find familiar, share a single visual language (blue glowing sphere on a blue wireframe grid over a blue starfield), and ask the user to do essentially nothing beyond rotating the camera and occasionally nudging a time slider. The drop-off between "Black Hole" and the rest is brutal, and the rubber-sheet views are nearly indistinguishable from each other at a glance. The tab has the raw shader quality to be the best physics sandbox on the internet, but as currently composed it reads as *one incredible demo plus five screensavers*. The fix is not more rubber sheets — it's agency, unification, and a few high-leverage "throw the thing, watch spacetime react" interactions. **Confidence: 9/10 that this assessment holds.**

## Extended Executive Summary

Project Tycho's Spacetime tab is best understood as a portfolio of technical demos searching for a product. Each view demonstrates a theorem; none of them gives the user a *question* to answer or a *toy* to play with. The hero asset (blackhole.js, ~66k-token file of ray-marching shader work) is extraordinary and deserves the "wow" treatment it gets — it's the reason to open the tab. But the remaining five views, built on a shared `buildDynamicGrid + updateGrid` scaffold, are visually homogeneous: the same 60-unit grid, the same 2500-star starfield, the same palette-locked blue `MeshStandardMaterial` sphere, the same cinematic vignette. A user who clicked in for the black hole is presented with five variations of "blue ball on grid" and given no real controls — Speed slider, occasional toggle, that's it. No mass slider, no spin slider on the Kerr view, no target to shoot, no camera preset, no share button, no story to follow.

The killer missing move is **agency over the physics itself**. A black hole with a "drop a star into the disk" button, a binary system where you can set the masses and watch the chirp retune, a Kerr sphere where you can fire test particles and watch them precess — any one of these would turn this from an exhibit wall into a toy box. The secondary missing move is **narrative continuity**: the six views should be *one spacetime* you fly through (Binary System → Inspiral → Black Hole is literally the same object's life story), not six separate tabs. My strongest recommendation is to rebuild this as a **guided "Life of a Binary" journey** with the current views as chapters, plus a free-roam sandbox mode. Cut Lensing and Frame Drag as standalone views (fold them in as effects layered onto the others) and spend that engineering budget on one great interaction: fire a photon, watch it curve.

## Detailed Analysis

### 1. The Hook — what happens in the first 5 seconds?

**The good:** The black hole loads as the default view and it is *legitimately* a wow moment. Accretion disk, photon ring, lensed secondary image, subtle grain, warm color grade — this is a screensaver-quality render you'd see at a planetarium. On my screenshot, the disk ring wraps cleanly over and under the shadow exactly the way Kip Thorne's team sold Interstellar on. 9/10 hook.

**The bad:** The hook is *completely passive*. After 5 seconds of "whoa," there is nothing to do. The user orbits the camera — and because the black hole is symmetric and the disk texture is FBM noise, rotating the camera yields essentially the same image from every angle. Compare to, e.g., the Kerr BH in *Interstellar* where the disk plane tilts: here there's no handle to grab. The view offers no slider for BH mass, no slider for disk tilt, no way to dive toward the event horizon, no way to see a test particle fall in. The second the wow wears off, there's a cliff.

**The cliff is made worse by the sidebar nav.** The first thing the user sees after the BH is a list of 5 more views whose names — Binary System, Warp Drive, Lensing, Inspiral, Frame Drag — promise more wow. When the user clicks one, they get a blue grid and a blue sphere, which feels like a severe downgrade from the BH. The nav should either *not tease what's weaker* or the weaker views need to be significantly strengthened before being offered.

**What the hook *should* be:** Load into black hole, auto-start a 10-second cinematic dolly ("first contact" style, camera slowly orbiting from wide to close-up), then pop a small prompt: *"Drop a star into Gargantua? [SPACE]"*. Press space, a blue point-mass streaks in from off-screen, spaghettifies, disappears behind the shadow, re-emerges on the other side as a lensed ghost. Then the nav reveals. That's a 20-second hook that *teaches* the user agency is possible.

### 2. Engagement Curve — how long do people stay?

My estimate, based on the current state:
- **Median session: 45-90 seconds.** 15s on BH (admiring), 10s each on 3-4 other views (brief rotate, read HUD, switch), done.
- **Power user session: 2-3 minutes.** They'll read all six descriptions and fiddle with speed sliders.
- **Return visits: near zero.** Nothing persists between sessions, no configurations to save, no reason to come back.

**What pulls deeper:** The Inspiral view's three-phase cycle (inspiral → merger → ringdown → reset) is the *only* view with built-in narrative tension. A user who waits 30 seconds sees the merger flash — that's the one "payoff moment" in the whole tab. It works. The lesson: *time-bounded events with a payoff* are the engagement unit. Add more of these.

**What drops users off:**
1. **Visual sameness of views 2-6.** The rubber-sheet scenes are genuinely hard to tell apart at a glance. Binary vs Inspiral vs Frame Drag — all blue grid, all blue sphere(s), all bloom-lit. Without reading the HUD, a user can't distinguish them. This is a cardinal sin in an exhibit — *every view must have a signature silhouette*.
2. **No parameter agency.** Every slider is a *time* slider. The user can speed up or slow down, but they cannot change the system itself. Binary stars are locked at 15 M☉ + 4 M☉. Kerr spin is a boolean, not a dial. The lensing has a strength slider — that's the best of the bunch, and notably the only view where the user can *see the effect they're controlling*.
3. **Description paragraphs.** The long bottom-left blurbs read like a textbook. Most users won't. The info should be surfaced *in response to action*, not as a wall of body copy.

### 3. Agency vs Passivity — the big one

This is the biggest single weakness. Of the six views:

| View | Active controls | Agency score |
|---|---|---|
| Black Hole | (none) | 0/10 |
| Binary System | Speed, GW toggle | 2/10 |
| Warp Drive | Speed | 1/10 |
| Lensing | Strength slider | **5/10** (user sees direct cause→effect) |
| Inspiral | Speed | 2/10 |
| Frame Drag | Spin on/off | 2/10 |

The average agency is ~2/10. Compare to, e.g., the Universe Sandbox mental model the user is implicitly bringing — they *expect* to be able to drag bodies around. Here they cannot.

**Where users should DO something, not watch:**

1. **Black Hole: fire a photon.** Click anywhere in the frame, a ray of light streaks from that point through the lensing geometry. User sees the bent path. (Engineering lift: low-to-medium — already have ray-marching on the GPU.)
2. **Black Hole: drop a test mass.** Click to spawn a glowing point that spirals in and gets eaten.
3. **Black Hole: tilt the disk.** Slider for `diskTilt` already exists in the shader uniform — just expose it. 1 line of HTML.
4. **Binary: drag-to-reposition stars, scroll-to-resize masses.** When masses change, watch the period change in real time. Watch R_A and R_B re-compute — user sees the barycenter physics.
5. **Binary: place a test particle.** Click on the grid, a tracer mass starts to orbit. Gets flung around by the binary. Three-body chaos made visible.
6. **Warp Drive: "pilot" the ship.** WASD or cursor direction changes the bubble's direction of travel, grid stars Doppler-shift.
7. **Warp Drive: change bubble radius / wall thickness.** The shape is beautiful — let the user sculpt it.
8. **Lensing: drag the lens mass.** Currently it's at the origin. Let the user drag it around; the Einstein ring follows. This alone would make lensing the best view on the tab.
9. **Lensing: change lens mass (M slider).** Einstein radius ∝ √M, the user should see the ring grow.
10. **Inspiral: set mass ratio.** 8+8 is the easy case. Let the user try 30+5 — asymmetric inspiral looks different and the merger remnant kicks.
11. **Inspiral: pause at ringdown.** The post-merger moment is the most interesting and it's over in ~2s. Users want to *hold* there.
12. **Frame Drag: spin dial (not toggle).** Boolean is a crime on a continuous parameter. Also: fire a test gyroscope, watch it precess.
13. **Frame Drag: test particle on orbit.** A particle dropped near the ergosphere gets dragged around. Co-rotating vs counter-rotating orbits diverge. This is the *whole point* of frame-dragging and it's currently invisible.

The design principle: **never a slider without a visible referent**. A speed slider that just speeds up a loop is weak; a mass slider that visibly warps the grid is strong.

### 4. Information/Interaction Balance — feedback quality

- **Sliders feel unsatisfying.** The `input type="range"` with an `0-2500 / 100` step is a mushy, unbranded slider. At 5:00 AM motion it feels good but at rest it feels like an admin panel. Compare to, say, the RED dial in a DAW or a well-tuned React Slider — this is a bare OS default. Style pass needed.
- **The HUD reports state, not consequences.** `PERIOD: ~31 s` is literally static text in the DOM. It should be reactive: drag a mass, watch the period number tick. This is the single biggest "feels alive" improvement available.
- **Speed slider max is 25x which is genuinely useful** — binary star at 25x is one revolution per 1.2s, inspiral chirps to merger in 5s. This is well-tuned. Keep.
- **Phase indicator on Inspiral ("INSPIRAL / MERGER / RINGDOWN") is the best HUD element in the tab.** It *changes in response to the simulation*. More of this. Show the orbital period on Binary as a live-ticking clock. Show the GW frequency on Inspiral as a rising number during the chirp (and play a tone — the famous LIGO chirp is *audible*, turn it into sound!).
- **The status dots ("● ACCRETION DISK ACTIVE") are decorative.** They don't mean anything. They're set-dressing to make it look sci-fi. Either make them meaningful (toggle something) or cut them — they're dishonest UI.
- **Audio is entirely missing.** This is a ~500ms fix away from being a massive improvement. Inspiral → chirp tone. Black hole → subbass drone. Warp drive → engine hum that Dopplers with speed. Museum exhibits use sound because it anchors emotion; a silent GR demo feels sterile.

### 5. Missing Experiences — the killer additions

Ranked by impact-to-effort ratio:

**S-Tier (do this):**
- **"Throw it in" mode.** Universal across views. Click-and-drag to fire a particle (or photon) with an initial velocity vector. Watch the trajectory. Works on BH, Binary, Frame Drag, even Lensing (a photon beam that curves). This is the single best idea I have for this tab. It transforms passive exhibits into a *shooting range for general relativity*.
- **First-person / Tarkovsky mode.** A "ride camera" preset per view. Inside the warp bubble looking forward. Inside the BH accretion disk plane tangent to the disk (the *Interstellar* docking shot). Orbiting one of the binary stars as the partner looms. Museum-grade awe is *proximity*, not orbit.
- **Chirp sound.** The LIGO audio is iconic. Inspiral view without a chirp tone is leaving 50% of the payoff on the table. Frequency tracks GW frequency, amplitude tracks amplitude. Auto-play on merger.

**A-Tier (should do):**
- **Parameter presets.** "Show me GW150914" / "Show me Cygnus X-1" / "Show me the Milky Way's central BH" — one-click loads of real-world systems. Makes the tab a reference tool, not just a toy.
- **Snapshot + share.** Take a PNG with a URL that encodes parameters (mass, spin, disk tilt). URL re-creates the config. Makes the tab shareable on Twitter/Bluesky. Zero server required — URL hash-encode.
- **Named configurations.** User saves "my cursed Kerr hole (a=0.998)" as a local-storage preset, it appears in a list. Tiny change, huge ownership feel.
- **Dolly/keyframe capture.** Let the user record a 10-second camera path and export it as a video loop. Gives users something to *make*, not just *see*.

**B-Tier (nice to have):**
- **Visualize the Schwarzschild radius.** An invisible sphere is shown on hover — users learn where the event horizon actually is. Same for ISCO.
- **Light-cone mode on Binary.** Show how causality propagates from the stars at speed c.
- **Gravity map.** A color heatmap of the potential well superimposed on the grid. Toggle on/off.
- **"Real-time" vs "GR-time" mode toggle.** Show the user that at 10x speed the binary is rotating impossibly fast — remind them this is visualization, not simulation.
- **Keyboard shortcuts.** `1-6` to switch views, `R` to reset, `C` to cycle camera presets, `SPACE` to pause. Power-user muscle memory.

### 6. Cross-View Integration — these should talk to each other

Currently the six views are **totally siloed**: each disposes on exit and re-inits on entry, nothing persists. This is a missed opportunity for the biggest narrative leverage available — because *three of the six views are literally the same physical object at different moments*:

- **Binary System** = two stars orbiting (steady state, billions of years)
- **Inspiral** = same two stars after GW radiation has shrunk the orbit (last few minutes of the life)
- **Black Hole** = the merged remnant after ringdown settles

This is one story told in three tabs. **Merge them.** Call it "Life of a Binary." Present as a timeline at the bottom: [Wide orbit] → [Inspiral] → [Merger] → [Black Hole]. User scrubs along the timeline or watches it auto-play. Camera smoothly follows. The masses, spins, and orbital energy carry continuously. Frame Drag becomes a sub-mode of Black Hole ("spin up the remnant?"). Lensing becomes an *effect* on the BH ("now look at the background stars through it"). The Warp Drive is unrelated sci-fi and should be its own thing.

This would collapse 6 disjoint demos into **2 unified experiences** (Life of a Binary + Alcubierre Pilot) with *more* content, more emotional arc, and much better retention.

### 7. Social / Sharability — basically nothing

- **No share button.** On any view.
- **No URL state.** Reloading resets everything to default.
- **No PNG export.** User wants to post the black hole — they have to OS-screenshot and deal with the browser chrome.
- **No video export.** The Inspiral chirp cycle is *made* for a 30-second loop export. Squandered.
- **No user accounts / saved configs.** Understandable, but localStorage can do this for free.

**Fix:** Every view gets a `📸 Snapshot` button (top-right of HUD). Copies URL to clipboard with hash state. Optionally triggers a canvas toBlob → PNG download. Add a `🎬 Record 10s` button that uses `MediaRecorder` on the canvas. Both are ~50 lines of code and are table-stakes for a 2026 web experience.

### 8. Settings / Customization — seriously lacking

Currently: one speed slider per view, one toggle on two views, one strength slider on Lensing. That's it.

The project's shader code *already computes* most of the parameters that should be exposed. E.g.:
- `blackhole.js` has `bhMass`, `diskInner`, `diskOuter`, `diskTilt`, `quality` — zero of these are user-exposed.
- `framedrag-model.js` has `DRAG_STRENGTH`, `DRAG_FALLOFF`, `SPIN_SPEED` — all constants, not sliders.
- `inspiral-model.js` has `OBJ_MASS`, `SEP_INITIAL`, `INSPIRAL_RATE`, `RINGDOWN_FREQ` — all constants.
- `spacetime-model.js` has `A_MASS`, `B_MASS`, `SEPARATION`, `ORBIT_SPEED` — all constants.

**These should be sliders.** The engineering cost is tiny — pipe each constant into a uniform/prop, wire to a range input. Each slider turns a 5-second demo into a 60-second toy. This is the single highest-leverage change across the tab.

Suggested control panel per view (collapsible, top-right):
- Black Hole: BH mass, disk inner/outer radius, disk tilt, quality, disk turbulence
- Binary: M_A, M_B, separation, eccentricity (new), GW toggle
- Warp: bubble radius, wall thickness, flow speed, bubble shape (new: top-hat vs Alcubierre vs Natário)
- Lensing: lens mass, distance, + drag position
- Inspiral: total mass, mass ratio, starting separation, auto-reset on/off
- Frame Drag: mass, spin 0-0.998, fire-a-gyroscope button

All collapse to a 60px-wide glyph when not in use, so the 3D stays uncluttered.

### 9. Easter Eggs / Delight / Personality

Current state: **zero personality beyond the sci-fi HUD chrome.** No hidden interactions, no surprises, no character, no humor, no references.

Low-effort delight adds:
- **Type "gargantua" anywhere →** loads the BH at exact Interstellar parameters (M ≈ 10⁸ M☉, a/M = 0.998).
- **Konami code →** unlocks a "cursed" view where the BH eats the HUD.
- **"Drop a cat" button on the BH.** Silhouette of a cat falls into the event horizon. Plays a faint meow. Flavor for days.
- **Name your binary system.** Type a name in the HUD, it persists. "Loftus-Carver-1" in your orbital title bar feels personal.
- **Hidden 7th view unlocked after using all 6.** "Exotic — Warp Drive Collapse" or "Interior Schwarzschild solution" or just a very weird shader.
- **Credits on the Warp Drive engine ring.** Tiny text when zoomed in: "NCC-1701-X" or similar.

The point: *museum exhibits should reward the person who leans in*. Tycho currently doesn't.

### 10. Per-View Critique & Cut Candidates

**Black Hole — 9/10, keep and deepen.** The hero. Add sliders (mass, disk tilt), add the "drop something in" interaction, add subbass drone audio. This alone could be a full-screen, full-interactive experience.

**Binary System — 5/10, keep but upgrade.** Currently a watchable clock. Needs mass sliders, period display that actually ticks, an "add a planet" button. Should become the entry to the Inspiral story.

**Warp Drive — 7/10, most *unique* asset here.** The wind-tunnel visual with the scrolling Z-lines is cool and not commonly seen on the web. Biggest issue: the ship is small and doesn't feel like *you*. Needs a ride-inside camera and a WASD pilot mode. Also: this has no relationship to the other 5 views — it's sci-fi, not GR. **Keep but move to its own top-level tab or sub-tab — don't conflate with the astro views.**

**Lensing — 4/10, weakest as currently implemented.** The problem is visible in the screenshot: the Einstein ring is small and weak, the distortion barely reads, and the lens itself is invisible (black sphere on black background). At default settings it looks broken. The strength slider helps but the default value is too low. Also, no dragging = no agency. **Merge into Black Hole** (BH already does proper lensing via ray-marching — just remove the disk and you have a clean lensing demo with better physics). Cut as a standalone view.

**Inspiral — 7/10, best narrative structure.** The three-phase cycle works. Needs sound (LIGO chirp). Needs a "ringdown hold" button. Needs mass-ratio control. After upgrades, this is the natural ending of the merged "Life of a Binary" experience.

**Frame Drag — 3/10, weakest visual.** The twist in the grid is subtle; at a glance it looks identical to Binary System minus one sphere. Without test particles, there is nothing to *show* that frame-dragging is happening. The spin toggle is a boolean on a continuous parameter. **Cut as a standalone; fold into Black Hole** as a spin slider (already supported by Kerr geometry — the BH just doesn't currently expose `a/M`). Firing a gyroscope becomes a one-click interaction.

## Recommendations

### Top 3 Product Moves (most impactful — do these)

1. **Unify Binary + Inspiral + Black Hole + Frame Drag + Lensing into one "Gravity" experience.** Timeline scrubber across the bottom: `Wide Binary → Inspiral → Merger → Kerr Remnant`. Camera flows between phases. Parameters persist. Sound plays. Lensing is an always-on effect layer in the final Kerr phase. This collapses 5 weak-to-moderate views into one *great* unified story. Warp Drive stays as its own thing. **Estimated lift: 2-3 days of focused work. Estimated impact: 5x session length.**

2. **Make every physics constant a slider, and add one "throw-in" interaction per view.** Mass sliders, spin dial, disk tilt, Alcubierre bubble shape. Plus: click-to-drop a test particle (BH, Binary, Frame Drag) or a photon beam (Lensing). This turns observation into experimentation. **Estimated lift: 1 day. Estimated impact: 3x agency score, 2x retention.**

3. **Add audio + snapshot/share.** LIGO chirp tone on Inspiral. Subbass drone on BH. Doppler engine hum on Warp. `📸` button per view that captures PNG + copies sharable URL hash. Enables virality. **Estimated lift: half a day. Estimated impact: 10x social reach (from ~zero to whatever baseline).**

### Top 5 Easy Wins (small effort, big delight)

1. **Expose `diskTilt` as a slider on Black Hole.** The shader uniform already exists. Literally 5 lines of HTML + 3 lines of JS. Massive visual payoff — the Interstellar disk tilting is *the* iconic image.
2. **Make Frame Drag spin a continuous slider, not a toggle.** Same story — `DRAG_STRENGTH` is a constant, promote it to a uniform/prop driven by a slider.
3. **Show a live orbital period / GW frequency in the HUD that actually updates.** Currently it's static text that says `~31 s`. Pipe the computed value in. The moment numbers move in response to input, the tab feels 10x more alive.
4. **Sound on Inspiral chirp.** WebAudio oscillator, frequency = GW frequency, amplitude = GW amplitude. ~30 lines of code. The LIGO sound is iconic — *everyone* knows it. Missing it is a dereliction.
5. **Keyboard shortcuts: `1-6` to switch views, `R` reset, `SPACE` pause.** Muscle memory from every science tool the user has ever used. Trivial code.

### Top 3 Candidates to CUT

1. **Lensing as a standalone view.** The post-processing shader's distortion is visually weak compared to the Black Hole's ray-marched lensing, which already does this properly. Cut the dedicated tab; re-enable a "remove accretion disk" toggle on the BH view that reveals pure lensing. Freed budget: use to deepen BH interactions.

2. **Frame Drag as a standalone view.** The grid-twist is subtle and easy to miss. The effect is strictly a parameter of the Kerr BH and should be a spin slider on the BH view, plus a "fire gyroscope" button. Reclaim the view slot for something new (e.g., "Tidal Stretch" — spaghettification animation, genuinely freaky).

3. **The blanket "Speed 0-25x" slider on every view.** It's not a bad feature but it's the *only* feature on most views, and having it in six identical places is lazy. Replace with view-specific controls (mass, spin, eccentricity, etc.). If time speed is kept, make it global (set in one place, applies everywhere) and less prominent.

---

## Bold Take — Should This Be Rebuilt?

**Yes, partially. Confidence: 8/10.**

If I were shipping this tomorrow I would:
1. Keep and ship the Black Hole view as-is; it's a flagship asset.
2. Kill Binary / Inspiral / Frame Drag / Lensing as standalone views.
3. Build **"Gravity: Life of a Binary"** as a single timeline-driven experience that folds in the physics of all four, with real sliders and real interactions.
4. Keep Warp Drive as a separate "Alcubierre Pilot" toy with a first-person camera.
5. End result: **2 strong experiences instead of 6 weak ones.** The tab becomes a destination instead of a tour.

The current 6-tab layout is a *technical* organization (one physics effect per tab) masquerading as product. A real product-thinking pass organizes around *user experiences*, and the user experience here is "watch a binary become a black hole" — a story, not a taxonomy. Let the shader work shine through a coherent arc rather than hiding behind a vertical nav of flat blue grids.

---

*Files reviewed:*
- `/Users/Loftus/workspace/project-tycho/src/spacetime-app.js`
- `/Users/Loftus/workspace/project-tycho/src/special/spacetime-model.js`
- `/Users/Loftus/workspace/project-tycho/src/special/spacetime-view.js`
- `/Users/Loftus/workspace/project-tycho/src/special/alcubierre-model.js`
- `/Users/Loftus/workspace/project-tycho/src/special/alcubierre-view.js`
- `/Users/Loftus/workspace/project-tycho/src/special/inspiral-model.js`
- `/Users/Loftus/workspace/project-tycho/src/special/inspiral-view.js`
- `/Users/Loftus/workspace/project-tycho/src/special/framedrag-model.js`
- `/Users/Loftus/workspace/project-tycho/src/special/framedrag-view.js`
- `/Users/Loftus/workspace/project-tycho/src/special/lensing-model.js`
- `/Users/Loftus/workspace/project-tycho/src/special/lensing-view.js`
- `/Users/Loftus/workspace/project-tycho/src/views/blackhole.js`
- `/Users/Loftus/workspace/project-tycho/index.html` (Spacetime HUD markup, lines 2840-3145)
- `/Users/Loftus/workspace/project-tycho/src/main.js`

*Live screenshots captured at http://localhost:5176/ for all 6 views.*
