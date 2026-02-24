import * as THREE from 'three';

/**
 * Cinematic slingshot flythrough engine.
 *
 * Builds one continuous CatmullRom camera path that slingshots around
 * each body in sequence — starting from the centre, sweeping outward.
 * The look-at target smoothly tracks whichever body the camera is
 * currently nearest to, keeping it in frame as the camera whips past.
 *
 * Uses per-waypoint weighting so the camera lingers near inner planets
 * (short arcs) and moves faster between distant outer planets (long arcs).
 */

/**
 * For each body we generate 3 camera control points that describe
 * a tight slingshot arc: approach → closest pass → departure.
 */
function buildSlingshotPoints(bodyPos, camDist, index) {
  const outward = bodyPos.clone().normalize();
  if (outward.lengthSq() < 0.001) outward.set(0, 0, 1);

  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(outward, up).normalize();
  if (side.lengthSq() < 0.001) side.set(1, 0, 0);

  const patterns = [
    { sideSign: 1, yMult: 0.35 },
    { sideSign: -1, yMult: 0.2 },
    { sideSign: 1, yMult: 0.5 },
    { sideSign: -1, yMult: 0.08 },
    { sideSign: 1, yMult: 0.3 },
  ];
  const pat = patterns[index % patterns.length];

  const approach = bodyPos.clone()
    .addScaledVector(outward, -camDist * 1.5)
    .addScaledVector(side, camDist * 0.5 * pat.sideSign)
    .setY(bodyPos.y + camDist * pat.yMult);

  // Closest pass: camDist IS the distance — right on top of the body
  const closest = bodyPos.clone()
    .addScaledVector(side, camDist * pat.sideSign)
    .setY(bodyPos.y + camDist * pat.yMult * 0.4);

  const departure = bodyPos.clone()
    .addScaledVector(outward, camDist * 1.5)
    .addScaledVector(side, camDist * 0.5 * pat.sideSign)
    .setY(bodyPos.y + camDist * pat.yMult * 0.2);

  return [approach, closest, departure];
}

export function createFlythrough() {
  const state = {
    active: false,
    startTime: 0,
    totalDuration: 0,
    cameraCurve: null,
    // Weighted time mapping: maps linear elapsed fraction → spline t
    // so the camera slows down near high-weight bodies
    timeMap: null,       // array of { tSpline, tTime } pairs
    waypoints: [],
    onFocus: null,
    onComplete: null,
    lastFocusIndex: -1,
  };

  function buildPath(waypoints) {
    const cameraPoints = [];

    // Short opening above the first body (Sun)
    const sunPos = waypoints[0].mesh.getWorldPosition(new THREE.Vector3());
    cameraPoints.push(sunPos.clone().add(new THREE.Vector3(0, 12, 15)));

    // Slingshot arc around each body
    waypoints.forEach((wp, i) => {
      const bodyPos = wp.mesh.getWorldPosition(new THREE.Vector3());
      const pts = buildSlingshotPoints(bodyPos, wp.camDist, i);
      cameraPoints.push(...pts);
    });

    // Short closing
    cameraPoints.push(new THREE.Vector3(0, 30, 45));

    state.cameraCurve = new THREE.CatmullRomCurve3(cameraPoints, false, 'catmullrom', 0.3);

    // tParam for each body's closest pass (for focus panel + look-at)
    const totalPts = cameraPoints.length;
    waypoints.forEach((wp, i) => {
      const closestIdx = 1 + i * 3 + 1;
      wp.tParam = closestIdx / (totalPts - 1);
    });

    // ── Build weighted time mapping ──
    // Each body "owns" a segment of the spline around its tParam.
    // We assign time proportional to the body's weight, not arc length.
    // This makes the camera linger near high-weight bodies.

    // Define segments: opening, then each body's region, then closing
    const segments = [];

    // Opening segment: before first body
    segments.push({ tStart: 0, tEnd: waypoints[0].tParam, weight: 0.5 });

    // Per-body segments: from this body's tParam to the next body's (or end)
    for (let i = 0; i < waypoints.length; i++) {
      const tStart = waypoints[i].tParam;
      const tEnd = i < waypoints.length - 1
        ? waypoints[i + 1].tParam
        : 1.0;
      segments.push({ tStart, tEnd, weight: waypoints[i].weight || 1.0 });
    }

    // Normalise weights to sum to 1
    const totalWeight = segments.reduce((s, seg) => s + seg.weight, 0);
    let cumTime = 0;
    const timeMap = [{ tSpline: 0, tTime: 0 }];
    for (const seg of segments) {
      cumTime += seg.weight / totalWeight;
      timeMap.push({ tSpline: seg.tEnd, tTime: cumTime });
    }
    // Ensure last entry is exactly 1
    timeMap[timeMap.length - 1].tTime = 1;
    timeMap[timeMap.length - 1].tSpline = 1;

    state.timeMap = timeMap;
  }

  /** Map elapsed time fraction [0,1] → spline t using weighted segments */
  function timeToSplineT(timeFrac) {
    const map = state.timeMap;
    // Find the segment
    for (let i = 1; i < map.length; i++) {
      if (timeFrac <= map[i].tTime) {
        const segTimeFrac = (timeFrac - map[i - 1].tTime) / (map[i].tTime - map[i - 1].tTime);
        return map[i - 1].tSpline + segTimeFrac * (map[i].tSpline - map[i - 1].tSpline);
      }
    }
    return 1;
  }

  function start(waypoints, camera, controls, onFocus, onComplete) {
    state.waypoints = waypoints;
    state.onFocus = onFocus;
    state.onComplete = onComplete;
    state.lastFocusIndex = -1;

    buildPath(waypoints);

    // Duration: ~8s per body + 4s overhead
    state.totalDuration = waypoints.length * 8000 + 4000;
    state.startTime = performance.now();
    state.active = true;

    controls.enabled = false;
    camera.position.copy(state.cameraCurve.getPoint(0));
    controls.target.copy(waypoints[0].mesh.getWorldPosition(new THREE.Vector3()));
  }

  function cancel(camera, controls) {
    if (!state.active) return;
    state.active = false;
    controls.enabled = true;
  }

  function update(camera, controls, now) {
    if (!state.active) return false;

    const elapsed = now - state.startTime;
    const rawT = Math.min(elapsed / state.totalDuration, 1);

    // Map elapsed time → spline position using weighted segments
    const t = timeToSplineT(rawT);

    camera.position.copy(state.cameraCurve.getPoint(t));

    // Look-at: find closest body by tParam
    let bestIdx = 0;
    let bestDist = Infinity;
    state.waypoints.forEach((wp, i) => {
      const d = Math.abs(t - wp.tParam);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });

    const nearestWp = state.waypoints[bestIdx];
    const bodyPos = nearestWp.mesh.getWorldPosition(new THREE.Vector3());

    controls.target.lerp(bodyPos, 0.08);

    // Show focus panel when approaching a body
    if (bestIdx !== state.lastFocusIndex && bestDist < 0.06) {
      state.lastFocusIndex = bestIdx;
      if (nearestWp.name && state.onFocus) state.onFocus(nearestWp.name);
    }

    if (rawT >= 1) {
      state.active = false;
      controls.enabled = true;
      if (state.onComplete) state.onComplete();
      return false;
    }

    return true;
  }

  return {
    start,
    cancel,
    update,
    isActive: () => state.active,
  };
}
