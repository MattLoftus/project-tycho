# Physics Review — Spacetime Tab

*Reviewer: theoretical physicist (GR / astrophysics). All files reviewed under `src/scenes/` plus `src/views/blackhole.js` and `src/spacetime-app.js`.*

---

## Executive Summary

The Spacetime tab is visually strong and most views convey the *right gestalt* to a lay audience, but several views contain physics that is outright wrong, not merely simplified. In rough order of severity: (1) **Frame Dragging** uses a 1/r^2.5 falloff that is qualitatively incorrect — true Lense-Thirring frame dragging is 1/r^3, and the visualization lacks the single most interesting Kerr feature (the ergosphere). (2) **Lensing** uses an outward radial displacement with 1/r^2 strength, which is doubly wrong: physical lensing deflects light *inward* (stars on the far side appear pushed *toward* the lens axis from the observer's view, forming tangential arcs), and the deflection angle falls as 1/r, not 1/r^2. (3) **Inspiral** uses an ad-hoc `SEP_INITIAL/sep * 0.5` radial acceleration instead of the well-known Peters–Mathews formula `da/dt ∝ -M^3/a^3`, and omits the chirp's defining feature: that both frequency and amplitude diverge on the same timescale. (4) **Binary** shows GW ripples as a rotationally symmetric ring, when quadrupole GWs have a distinctive cos(2φ) angular pattern that is the whole point. (5) **Alcubierre** uses a Gaussian wall profile that is not the Alcubierre shape function; this is forgivable but deserves a note in the UI. The **Black Hole** view is the most physically sound of the six. Pedagogically, the universal "rubber sheet" metaphor across five of six views is reinforcing a well-documented misconception; this is not a small issue and I would strongly recommend at least one view that breaks the metaphor (light cones, geodesics, or embedding diagrams with proper captions).

## Extended Executive Summary

The codebase shows thoughtful engineering and a good intuition for what *looks* like GR, but a persistent pattern emerges where qualitative shapes are right while scalings are wrong — and scalings are what separate a physics visualization from a fantasy one. The 1/sqrt(r^2+s^2) softened Newtonian potential used for every "gravity well" is defensible as a rubber-sheet stand-in (it is what a 2D elastic membrane actually does under a point load), but the visualizations then stack additional effects on top (GWs, frame drag, inspiral) whose scalings should be *physically* motivated even when the baseline well is a metaphor. In several cases those scalings are instead hand-tuned for visual impact, which is fine for aesthetics but undermines the educational claim. The second theme is **missing structure that would actually be more visually exciting than what is currently shown**: the ergosphere of a Kerr black hole, the tangential-vs-radial arcs of an Einstein cross, the cos(2φ) pattern of quadrupole radiation, the innermost stable circular orbit (ISCO) for inspirals, and the "event horizon" surface inside the warp bubble where the bubble wall goes superluminal. These are teachable and pretty. Finally, the pedagogical overload of rubber-sheet imagery is the single largest issue: every physics educator who has taught GR has a list of misconceptions this metaphor creates ("gravity as the funnel effect in a wishing well"), and five views in a row using it compounds the problem. A single view that deliberately breaks the metaphor — e.g. showing tilted light cones near a horizon, or geodesics on a Flamm paraboloid with the axis labeled "proper radial distance, not spatial depth" — would do more educational work than polishing the existing five.

## Detailed Analysis

### View 1 — Black Hole (ray-marched Schwarzschild)

**Confidence this view is physically sound: 8/10.** This is by far the best view in the tab. The ray-marching integrates through a curved metric, producing the shadow, photon ring, and higher-order lensed images of the accretion disk. The `diskInner = 4.5` (line 88 of `blackhole.js`) is labeled with the ISCO at 6M for Schwarzschild (r_s = 2M means ISCO = 3*r_s), so the comment is internally inconsistent (ISCO ≈ 3*r_s means 3*(2*1.5) = 9 in your units, not 4.5). Either the variable is in different units than the comment suggests, or the disk inner edge is placed inside the ISCO, which is unphysical — inside the ISCO, material plunges, no stable disk.

**What is correct:**
- Ray-marching through a Schwarzschild-like deflection field. This is the *correct* approach and almost no educational site does this — they usually fake it with a screen-space distortion (as you do for lensing).
- Photon ring, disk tilt, and lensed secondary/tertiary images.

**What is missing:**
- **Doppler beaming and gravitational redshift of the disk.** The Interstellar image famously has near-uniform disk brightness because Nolan demanded it for visual clarity; real images (and the EHT reconstructions of M87* and Sgr A*) show one side strongly brightened by beaming (v·n Doppler boost, factor (1-β cos θ)^-4 for an optically thick disk). This is one of the most visually striking and teachable features of a black hole image — adding it would elevate this view substantially.
- **Inner shadow vs. photon ring distinction.** The EHT-era vocabulary distinguishes the "shadow" (boundary of region from which no photons reach the observer) from the "inner shadow" (direct image of the horizon) and the "photon ring" (infinitely thin stack of n = 1, 2, 3, ... winding images). Current render shows the photon ring, but could be labeled explicitly.

**Concern (low severity):** The disk is Keplerian-rotating in the comment but I didn't see where that's used in the shader. If the disk is static, beaming is impossible — another reason to add it.

---

### View 2 — Binary System (`spacetime-model.js`)

**Confidence this view is physically sound: 5/10.**

**What is correct:**
- Barycenter calculation is correct. Lines 42-43: `R_A = SEPARATION * B_MASS / TOTAL_MASS`, `R_B = SEPARATION * A_MASS / TOTAL_MASS`. Mass ratio is 15:4 so R_A = 2.53, R_B = 9.47. Good.
- Both stars orbit at the same angular frequency, on opposite sides. Lines 194-197. Correct.
- GW frequency at 2× orbital (quadrupole radiation). Line 219: `GW_FREQ = ORBIT_SPEED * 2`. Correct.

**What is oversimplified / wrong:**

1. **Orbital angular frequency is hand-set to 0.2 rad/s, not computed from Kepler's third law.** Line 38: `ORBIT_SPEED = 0.2`. For a real binary with total mass M and separation d, ω = sqrt(GM/d^3). The whole point of a binary is that ω scales as d^{-3/2}. At the chosen numbers (M=19, d=12), Kepler's law would give ω = sqrt(19/1728) ≈ 0.105 in these units. You're off by a factor of 2. This matters because the next view (Inspiral) correctly uses Kepler scaling, making this view inconsistent.
   - **Fix:** Replace with `const ORBIT_SPEED = Math.sqrt(TOTAL_MASS / Math.pow(SEPARATION, 3))` — set an overall G in the file and calibrate visually, but preserve the scaling.

2. **GW ripples are circularly symmetric (line 248: `sin(r*0.5 - time*GW_FREQ*GW_SPEED)`).** This is actively misleading. Quadrupole radiation has a **cos(2φ) angular pattern** — the waveform amplitude depends on the azimuthal angle relative to the orbit plane (for an equatorial observer, this modulation is what encodes the orbital phase). A circularly symmetric ring with radius-only dependence is what you'd get from a monopole or breathing-mode source, which doesn't exist in GR.
   - **Fix:** In line 245, compute the azimuthal angle `phi = atan2(z, x)` and the *retarded* orbit angle `theta_ret = (time - r/GW_SPEED) * ORBIT_SPEED`. Then the grid displacement should be proportional to `cos(2*(phi - theta_ret))` times the amplitude envelope. This will produce the correct rotating "pinwheel" pattern that actually rotates with the binary — and this is *much* more visually striking than the current symmetric ring.

3. **Amplitude decay `1/(1+r*GW_DECAY)` instead of 1/r.** Line 247. In the far zone, quadrupole GW strain falls exactly as 1/r. The current form is a soft saturation that's wrong at large r. Minor but easy to fix.

4. **Superposed Newtonian wells are not GR.** I know this is a stylized view, but the superposition of two 1/sqrt(r^2+s^2) wells does not produce anything like the 3+1 ADM geometry of a binary. This is a venial sin *only if* the interface doesn't claim otherwise. Consider a caption: "Illustrative — not a true 3+1 foliation."

5. **No orbital precession** (periastron advance). For the chosen mass ratio and separation, post-Newtonian periastron precession is small but visible over several orbits. Adding a 1PN term `dθ/dt = 3 GM/(a c^2 (1-e^2))` per orbit (with a slight eccentricity) would be a beautiful addition — you could show the orbit trace as a rosette. Essentially free visually.

**What is missing:**
- **Roche lobe geometry.** With a 15 + 4 M☉ binary at any realistic separation, the less-massive star is well inside its Roche lobe. Showing the lobes (or a mass-transfer stream) would add realism.
- **Orbital energy loss over time.** The binary orbits at fixed separation forever here. Even on a demo timescale, showing slight inspiral (inheriting from your inspiral code) would be more honest.

---

### View 3 — Alcubierre Warp Drive (`alcubierre-model.js`)

**Confidence this view is physically sound: 4/10.** This is the view most forgiven because the Alcubierre metric is itself toy physics (requires negative energy density, violates weak/null energy conditions, etc.), but the implementation is further simplified in ways worth noting.

**What is correct conceptually:**
- Flat space in front and behind, deformed shell at a specific radius. Correct in gestalt.
- Stationary bubble in ship frame, space flowing through. Correct choice of reference frame.
- Z-lines scrolling while X-lines static is a clever visual trick — I like it.

**What is wrong / simplified:**

1. **The shape function is Gaussian, not Alcubierre's f(r_s).** Line 32-35: `wall = exp(-wallDist^2 / (2*WALL_W^2))`. Alcubierre's original paper uses `f(r_s) = [tanh(σ(r_s+R)) - tanh(σ(r_s-R))] / [2 tanh(σR)]`, which is ~1 inside R and ~0 outside with a tanh transition of width 1/σ. Your Gaussian is *close* but the tanh profile is a flat plateau in the interior, not a dome. Given that the ship sits inside the bubble in flat space (the whole point is zero tidal effects), the interior should be flat, not centrally depressed — the current `centerFade = r²/(r²+1)` partially fixes this but the interior still has a gradient.
   - **Fix:** Replace with `wall = 0.5*(tanh(sigma*(r+R)) - tanh(sigma*(r-R)))` and evaluate its *gradient*, which is what actually distorts the grid. This gives a proper "flat interior, flat exterior, only the wall is curved" picture.

2. **The grid displacement is perpendicular-to-flow (y-direction), but the actual Alcubierre metric affects the shift vector β^x, which is an x-direction displacement (boost in front, anti-boost behind).** The current Y-dipole shape (positive bump in front of bubble, negative behind, due to `x/r` factor on line 35) at least encodes the dipole character, but it really should be visualizing how a grid point's *x-coordinate* changes relative to coordinate time, not its elevation. This is hard to show on a rubber sheet, which is a legitimate reason to keep what you have.

3. **No mention of the ergosphere-like structure.** The Alcubierre bubble wall moves at ≥ c in asymptotic frame, creating a region causally disconnected from the interior (the "horizon problem" — passengers can't signal to the bubble wall to steer). This is the single most interesting feature of the metric and it isn't shown.

4. **No wake-field physics.** The wake particles (`buildWake`, lines 251-286) are cosmetic streaks. In Pfenning & Ford / Olum / Hiscock analyses, the actual wake of an Alcubierre bubble includes a photon pile-up at the front wall (any blueshifted radiation becomes arbitrarily energetic at arrival) — this is sometimes called the "Alcubierre blueshift problem." Showing incoming starlight getting blueshifted at the front of the bubble would be physically meaningful, not just decorative.

**What is missing:**
- A label that this is a *toy metric* requiring exotic matter. This is important — kids who see this view might come away thinking warp drive is feasible. Casimir-scale negative energy densities are ~10^-18 J/m^3; Alcubierre requires ~10^44 J/m^3 of negative energy density. That's ~10^62 times too little. A caption would help.

---

### View 4 — Lensing (`lensing-model.js`)

**Confidence this view is physically sound: 2/10.** This is the most physically wrong of the six views. It happens to look cool, but the physics is inverted in two ways.

**What is wrong:**

1. **Deflection falls as 1/r², not 1/r.** Line 157: `deflection = lensStrength * einsteinR² / (r² + 0.002)`. The Einstein deflection angle is α = 4GM / (c² b) where b is the impact parameter, so α ∝ 1/b, not 1/b². This is an elementary textbook result (Schneider, Ehlers, Falco ch. 2). The point-mass lens equation is β = θ - θ_E² / θ, with θ_E the Einstein radius, giving deflection proportional to 1/θ in the far field. Your 1/r² gives the wrong arc shapes: real Einstein rings have fat arcs that extend to large radii; a 1/r² lens has arcs that collapse too tightly to the lens center.

2. **Displacement is outward, not inward.** Line 160: `uv = uv + dir * deflection`, where `dir = delta/r` points radially outward from the lens center. Gravitational lensing makes background sources appear *displaced further from the optical axis* in the observer's image plane, yes — but the standard screen-space shader approach is to *sample* the source *closer to* the lens center (inward) for each output pixel, because we're inverting the lens equation: image position θ maps to source position β = θ - α(θ). For a given output pixel at angular position θ, we read the source at β < θ (inward). Your shader reads at θ + α, which is outward.
   - The visible effect of this bug: stars near the lens appear to be *repelled* from it, rather than forming the characteristic Einstein ring where stars behind the lens double-image (primary bright arc outside θ_E, secondary faint arc inside θ_E).
   - **Fix:** Change line 160 to `uv = uv - dir * deflection`. This alone will fix the fundamental topology. Combined with the 1/r fix, you'll actually get Einstein rings.

3. **Einstein radius is not properly defined.** The Einstein radius depends on the source-lens-observer geometry: θ_E = sqrt((4GM/c²)(D_ls / (D_l D_s))). Your `lensRadius = 0.18` is a visual magic number. For a pedagogical tool, I'd expose a "lens mass" and "source distance ratio" slider and derive θ_E.

**What is correct:**
- Blacking out the center (line 164-167) is a reasonable stand-in for "the lens mass itself is opaque and blocks its own direct image." In strong lensing of point sources this isn't quite right (the mass is usually a galaxy, transparent), but for a "black hole lens" demo it's fine.
- The starfield is dense enough that the visual effect is legible.

**What is missing:**
- **Microlensing light curves.** A beautiful, pedagogically rich extension: move the lens (or source) with time and show the characteristic symmetric-peak light curve as the projected separation passes through θ_E. This is what Kepler/Gaia/OGLE actually observe, and it's easy to compute analytically.
- **Image positions for extended sources.** A galaxy source (as you have with the galaxy band) should show *tangential* arcs (stretching perpendicular to the lens-source axis) and *radial* arcs — your current shader applies a purely radial deflection that stretches things radially, which is literally the opposite.
- **Multi-image formation.** Point sources behind the lens form two images (primary + secondary) straddling the Einstein radius. A screen-space shader can't easily do this, but a billboard-based approach could place a second "ghost" image of each star across θ_E.

**Severity:** This view should be fixed before the site goes into heavy educational use. The current behavior actively teaches incorrect physics.

---

### View 5 — Inspiral (`inspiral-model.js`)

**Confidence this view is physically sound: 4/10.** The phase structure is good; the scaling laws are mostly wrong but they reproduce the right *qualitative* behavior.

**What is correct:**
- Phase transitions (INSPIRAL → MERGER → RINGDOWN → reset). Good structure.
- Orbital angular frequency ω ∝ d^{-3/2} (Kepler). Line 222: `omega = BASE_OMEGA * Math.pow(SEP_INITIAL / sep, 1.5)`. Correct.
- GW frequency = 2× orbital frequency. Line 295-296. Correct.
- Exponential ringdown with fixed frequency. Line 244: `Math.exp(-phaseTime / RINGDOWN_TAU)`. The single-mode exponential is a reasonable approximation to the dominant ℓ=m=2 QNM. Good.

**What is wrong:**

1. **The separation shrinks by an ad-hoc accelerating rule, not Peters–Mathews.** Line 217-218:
   ```
   const accel = (SEP_INITIAL / Math.max(sep, 1)) * 0.5
   sep -= INSPIRAL_RATE * accel * dt
   ```
   This gives `da/dt ∝ -1/a`, which integrates to `a(t) = sqrt(a_0² - kt)` — a *square-root* inspiral. The correct result from quadrupole GW emission is Peters's formula `da/dt ∝ -M^3/a^3`, integrating to `a(t) = (a_0^4 - kt)^(1/4)` — a *quartic* inspiral. The difference is visible: Peters's formula has *much slower* early inspiral and a *much faster* plunge (the famous chirp). Your current scaling gives a roughly linear inspiral rate that doesn't accelerate dramatically.
   - **Fix:** Replace with `sep -= K / Math.pow(sep, 3) * dt` for some calibrated K. This produces the characteristic chirp-shape.

2. **Equal masses mean no center-of-mass offset, which is correct here (`halfR = sep/2`), but the ringdown should include the recoil kick** for unequal masses. For equal masses, the recoil is zero by symmetry, so this is fine.

3. **Chirp amplitude grows only linearly with inverse separation.** Line 288-289: `gwAmp = GW_BASE_AMP * (SEP_INITIAL / Math.max(sep, 1))`. The correct scaling for GW strain in the inspiral is h ∝ ω^(2/3) ∝ sep^{-1}, which *is* linear in 1/sep, so this is approximately right. Good accidentally-correct scaling.

4. **No ISCO cutoff.** For a Schwarzschild equivalent, the innermost stable circular orbit is at 6M (r_s = 2M → ISCO = 3 r_s). Your `SEP_MERGER = 3.5` is hand-set. For M_total = 16 in your units, 6M_total = 96, which is much larger — but you're clearly in code units. The ISCO concept could be labeled: above ISCO, slow inspiral; at ISCO, plunge; then ringdown.

5. **Ringdown frequency is static (`RINGDOWN_FREQ = 3.0`).** The dominant QNM for a Kerr black hole with spin χ depends on χ — the numerical relativity result is ω_ringdown ≈ (1 - 0.63 (1-χ)^0.3) / M. Showing this variation with spin would be a nice touch but is not critical.

**What is missing:**
- **Chirp mass reveal.** The inspiral phase could display the "chirp mass" M_c = (m_1 m_2)^{3/5} / (m_1+m_2)^{1/5} — this is the single parameter that determines the inspiral waveform's amplitude and phase evolution, and it's what LIGO extracts first from GW events. For equal masses it reduces to M_c = M/2^{1/5}.
- **The two GW polarizations (+/×).** The current visualization shows grid *elevation*. A more correct picture: in the TT gauge, a + polarized GW stretches the x-axis and compresses the y-axis alternately. A × polarization does the same at 45°. Show a ring of test particles being squeezed periodically — this is the single most pedagogical GW visualization and it's absent.
- **Audible chirp.** If you want to turn this into an experience, play a sweeping tone whose frequency matches the GW frequency in real time. GW150914 famously sounds like a bird chirp when you pitch up the audio — this would be a memorable moment.

---

### View 6 — Frame Dragging / Kerr (`framedrag-model.js`)

**Confidence this view is physically sound: 3/10.** The correct concept is shown — rotating mass drags spacetime — but the scalings and missing structure undermine the educational claim.

**What is wrong:**

1. **Frame-dragging angular velocity falls as 1/r^2.5, not 1/r^3.** Line 33, 190: `DRAG_FALLOFF = 2.5`. The Lense-Thirring frame-dragging angular velocity for a slowly-rotating body is ω_LT = 2 G J / (c^2 r^3) — exactly 1/r^3, *not* 1/r^2.5 or 1/r^2. The prompt's note that "true Lense-Thirring drag scales as 1/r^3" is correct. Using 1/r^2.5 makes the effect fall off too slowly at large r, which will visually *exaggerate* far-field dragging.
   - **Fix:** Set `DRAG_FALLOFF = 3.0`. Compensate with a larger `DRAG_STRENGTH` if the visual effect becomes too subtle.

2. **The rotation is applied at all radii, ignoring the ergosphere.** This is the *biggest* missed opportunity in the entire tab. The Kerr ergosphere is the region where no observer can remain stationary relative to infinity — spacetime itself is dragged faster than light. For a maximally rotating Kerr (a = M), the ergosphere surface is at r_E(θ) = M + sqrt(M² - a² cos²θ), touching the horizon at the poles and extending to 2M at the equator (oblate shape). This is a *teachable moment* and it's missing entirely. The current visualization treats spacetime as uniformly dragged with smooth 1/r^n falloff.
   - **Fix:** Identify the ergosphere radius in your units. Color the grid inside the ergosphere differently (e.g. red-shifted to indicate "you cannot be stationary here"). Show the horizon as a separate inner surface. Both surfaces should be oblate spheroids depending on spin.

3. **Rotating the *grid vertices* tangentially (line 195-196) implies the frame-dragging angle is a static twist of space itself.** Physically, frame dragging is a *rotation rate* (radians per unit coordinate time), not a static angle. A better visualization: let test particles on geodesics precess around the Kerr black hole at the Lense-Thirring rate, instead of statically twisting the grid. This would make the effect time-dependent and more obvious.
   - Right now, the grid looks like a fixed pretzel shape rather than a rotating dragging field. Adding a *time animation* where the twist slowly rotates (at Ω_LT at each r) would be more accurate.

4. **Spin is a boolean (on/off) rather than a continuous parameter.** Real Kerr black holes have a dimensionless spin 0 ≤ a/M ≤ 1, with a = M being maximal. Sliding from Schwarzschild to near-extremal Kerr and watching the ergosphere grow from zero to 2M (equatorial) would be a fantastic demonstration.

**What is missing:**
- **Ergosphere and horizon surfaces.** (See above.)
- **Polar vs. equatorial shape of the ergosphere.** At the poles, the ergosphere touches the horizon; at the equator, it extends to r = 2M. This 3D structure is striking when shown and is the defining feature of Kerr.
- **Penrose process visualization.** A particle entering the ergosphere, splitting into two, one falling into the hole with negative energy and the other escaping with *more* energy than the original — this is how rotating black holes give up their rotational energy, and it's one of the coolest things in GR. Would take some work but would be unique content.
- **Innermost stable circular orbit depends on spin.** For prograde orbits around Kerr, ISCO shrinks from 6M (Schwarzschild) to M (extremal) as a → M. Showing an accretion disk with ISCO that shrinks as you increase spin would be pedagogically powerful.

---

### Cross-cutting concerns

**The rubber-sheet problem (severity: high).** Five of six views use the rubber-sheet metaphor (everything except the ray-marched black hole). This metaphor is a known pedagogical trap:

1. It teaches gravity as "balls rolling on a curved surface under Earth's downward gravity" — circular, since you need gravity to explain gravity.
2. It suggests spacetime curvature is a *spatial* bending *into a higher dimension*, rather than intrinsic curvature that manifests as changes in the local metric.
3. It lets students conclude that the "depth" of the well is the *meaning* of gravitational potential, which is backward — the depth is a visualization choice, and real GR is about proper time differences along different worldlines.
4. It obscures that time curvature, not space curvature, is the dominant source of Newtonian gravity. In the weak-field limit, almost all of the observed free-fall acceleration of slow-moving objects comes from the tt component of the metric (gravitational time dilation), not the spatial components.

This doesn't mean you should remove the rubber-sheet views — they're visually beautiful and have educational value for intuition. But I'd add:
- A prominent **caption** on each rubber-sheet view: "This is a visualization convention, not the actual geometry of space. Real spacetime curvature cannot be embedded in a lower-dimensional flat space."
- **At least one view that deliberately breaks the metaphor** — see Recommendations below.

**Units and calibration (severity: medium).** Every file uses code units (mass in unit-less "12" or "15", distance in "12" or "16"). This is fine for visualization but creates internal inconsistencies — e.g. the Black Hole's `bhMass = 1.5` vs. the Binary's `A_MASS = 15` — and means you can't meaningfully compare across views. Setting a single reference G and M throughout, or at least documenting unit conventions in each file, would help maintainers.

**No error / stability analysis.** Several files compute grid deformations with `exp(-wallDist²/...)`, `1/(1+r*D)`, etc. At grid resolution 250×41 = ~10^4 vertices per line × ~80 lines = ~800k updates per frame. If any view runs slow, it will ruin immersion. Consider instancing or GPU-shader-based grid deformation (would be a natural refactor and would enable more complex physics).

**No light-cone or causal structure anywhere.** In GR, light cones are the physical structure — not grid bumps. A view that shows light cones tipping over near a horizon would teach actual GR, not rubber-sheet.

---

## Recommendations

### Top 3 fixes to existing views

1. **Fix the lensing shader.** This is the most urgent. Currently *actively teaches wrong physics.*
   - File: `lensing-model.js`, line 157 → change `einsteinR² / (r² + ...)` to `einsteinR / (r + 0.002)` (1/r not 1/r²).
   - Line 160 → change `uv = uv + dir * deflection` to `uv = uv - dir * deflection` (inward sampling).
   - Expose `lensRadius` as an Einstein radius slider; maybe add a "source plane distance" param.
   - Result: actual Einstein rings and tangential arcs, not outward-repelling starfield.

2. **Fix the Kerr view's ergosphere.** Add a second surface at r_E(θ) = M + sqrt(M² - a² cos²θ) colored to indicate "no static observers possible." This single change transforms the view from "pretzel-shaped grid" to "actual Kerr structure." Also change `DRAG_FALLOFF` from 2.5 to 3.0 (line 33 of `framedrag-model.js`) to match Lense-Thirring scaling.

3. **Fix the binary GW pattern.** Change from a circularly symmetric ring to a cos(2φ) pinwheel pattern that actually rotates with the binary. See line 245-250 of `spacetime-model.js`. This will be immediately more visually arresting *and* physically correct.

### Top 5 new views to build

Ranked by pedagogical impact × implementation difficulty:

1. **GW polarization / ring of test particles (+/× modes).** A ring of beads in the plane transverse to an incoming GW, showing the characteristic squeeze-and-stretch. This is the single best way to explain what a GW *is* (a change in proper distance, not a wave of stuff), and it's astonishingly simple to implement. Two toggles: + mode vs. × mode. Slider for amplitude. This view alone would clarify more for visitors than the current inspiral view does.

2. **Light cones near a horizon (Eddington-Finkelstein or tortoise coordinates).** A radial grid of stationary observers, each with a little light cone drawn as a pair of 45° lines. As you approach the horizon, the cones tilt toward the black hole — outside the horizon, the outward null ray escapes; at the horizon, it's frozen; inside, both null rays point inward. This is the *correct* way to show what a horizon is, and it directly breaks the rubber-sheet metaphor. Pedagogical impact: 10/10.

3. **Gravitational redshift / time dilation shell.** Two clocks: one near a mass, one at infinity. Show them ticking at different rates. Explicit formula: dτ_local / dt_∞ = sqrt(1 - r_s/r). This is the most observationally confirmed prediction of GR (GPS corrections, Pound-Rebka, gravitational redshift of Sirius B, etc.) and it's missing entirely. Add a slider for the orbit radius and watch the clock desynchronization accumulate.

4. **Geodesic bundles / tidal effects (geodesic deviation).** A small cloud of test particles released near a black hole. Show them stretching radially (squeezed tangentially) due to tidal forces — this is the Riemann tensor in action, and it *is* real spacetime curvature, not a metaphor. A nice variant: show the "spaghettification" of an extended object falling into a small black hole.

5. **Microlensing light curve / event.** A source star moves behind a point-mass lens (or vice versa), and a panel alongside the 3D view plots the observed brightness vs. time. The characteristic symmetric peak when the projected separation reaches θ_E is instantly recognizable (and is how many exoplanets have been discovered). Bonus: make the lens a planet with a small spike in the light curve.

Additional candidates if time allows:
- **Kerr accretion disk with ISCO-dependent inner edge.** Show how spin affects the inner disk radius.
- **Cosmological expansion / Hubble flow** (but not a rubber sheet — show comoving coordinates and stretching distances).
- **Penrose process** around a rotating black hole.
- **Shapiro delay** (radar echo delay near Sun) — observationally critical GR test.

### Specific code-level changes

**`lensing-model.js`** (fragment shader, lines 148-170):
```glsl
// Replace the deflection computation with proper lens equation inversion:
float einsteinR = lensRadius;
if (r > 0.001) {
  // Deflection angle: α = θ_E² / θ (point-mass lens)
  float alpha = einsteinR * einsteinR / max(r, 0.001);
  vec2 dir = delta / r;
  dir.x /= aspectRatio;
  uv = uv - dir * alpha;  // INWARD, not outward
}
```

**`framedrag-model.js`** (line 33, line 190):
```js
const DRAG_FALLOFF = 3.0       // true Lense-Thirring scaling
// Then increase DRAG_STRENGTH or add a small r-clamp to compensate for visibility
```

Then add ergosphere mesh (new function in `framedrag-model.js`):
```js
function buildErgosphere(spin) {
  // Oblate spheroid: r_E(θ) = M + sqrt(M² - a² cos²θ)
  // Horizon: r_H = M + sqrt(M² - a²)
  // Construct as ParametricGeometry or SphereGeometry with shader deformation
}
```

**`spacetime-model.js`** (line 245-250), replace symmetric ring with quadrupole pattern:
```js
if (gravWaves) {
  const r = Math.sqrt(x*x + z*z)
  if (r > 2) {
    const phi = Math.atan2(z, x)
    const retTheta = (time - r/GW_SPEED) * ORBIT_SPEED
    const wave = GW_AMP / (r + 1) * Math.cos(2*(phi - retTheta))
    y += wave
  }
}
```

**`spacetime-model.js`** (line 38):
```js
// Kepler-consistent orbital frequency
const ORBIT_SPEED = Math.sqrt(TOTAL_MASS / Math.pow(SEPARATION, 3)) * CALIBRATION
```

**`inspiral-model.js`** (line 217-218), replace ad-hoc accel with Peters:
```js
// Peters-Mathews: da/dt = -K / a^3 (equal mass quadrupole)
const K = 0.5  // calibrate for visual
sep -= K / Math.pow(Math.max(sep, SEP_MERGER), 3) * dt
```

**`blackhole.js`** — add Doppler beaming to the disk. In the fragment shader where the disk color is computed, multiply by the Doppler factor D = 1 / (γ (1 - β·n)), raised to the 4th power for optically thick disks. This requires knowing the disk rotation direction and the local line-of-sight, both of which are already computed in the ray-march.

### Closing note on positioning

The tab is marketed as a GR education tool. For that claim to hold, the *scalings* have to be right, not just the *aesthetics*. The fixes above are mostly 1-10 line changes per file, not rewrites. After those fixes + the ergosphere view + the GW polarization view + at least one light-cone view, this would be genuinely the best free GR visualization site I'm aware of. Right now it's visually beautiful with ~50% correct physics.

**Overall physics score (current state): 5/10.**
**After recommended fixes: 8/10.**
**With all five new views added: 9/10.**
