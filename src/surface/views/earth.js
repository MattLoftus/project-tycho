import * as THREE from 'three'
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { CameraController } from '../camera.js'
import { initMarsHUD, setStatus, setTerrainLabel, setFeatureClickCallback } from '../hud.js'

// ─── Region definitions ──────────────────────────────────────────────────────

export const REGIONS = {
  grandcanyon: {
    label:    'GRAND CANYON',
    subtitle: 'COLORADO PLATEAU · ARIZONA',
    z: 11, baseX: 384, baseY: 800, grid: 4, sceneH: 40,
    camPos:    [0, 55, 240],
    camTarget: [0, -5, 100],   // canyon center, not the plateau at origin
    // Warm sandstone palette — no ice or snow at top, this is a desert canyon
    palette: [
      [0.20, 0.12, 0.08],  // dark schist / canyon floor
      [0.62, 0.32, 0.16],  // Redwall / Supai rust-orange
      [0.78, 0.62, 0.42],  // Coconino sandstone cream
      [0.72, 0.68, 0.54],  // Kaibab limestone pale tan
      [0.62, 0.62, 0.50],  // Kaibab Plateau — forest/limestone, NOT snow
    ],
    features: [
      { name: 'South Rim',        type: 'Rim',    lat: 36.06, lon: -112.14, depth: '1,800 m', width: '16 km'  },
      { name: 'North Rim',        type: 'Rim',    lat: 36.20, lon: -112.06, depth: '2,450 m', width: '---'    },
      { name: 'Colorado River',   type: 'River',  lat: 36.10, lon: -112.10, depth: '---',     width: '90 m'   },
      { name: 'Bright Angel Pt',  type: 'Vista',  lat: 36.21, lon: -112.05, depth: '---',     width: '---'    },
    ],
  },
  himalayas: {
    label:    'HIMALAYAS',
    subtitle: 'MOUNT EVEREST MASSIF · NEPAL',
    z: 9, baseX: 377, baseY: 212, grid: 4, sceneH: 52,
    camPos: [0, 80, 200],
    // Cool rock → permanent snow cap (appropriate for the Everest massif)
    palette: [
      [0.10, 0.09, 0.08],  // dark rock base
      [0.30, 0.28, 0.26],  // gray scree
      [0.55, 0.55, 0.55],  // lighter rock
      [0.82, 0.84, 0.86],  // snow / rock mix
      [0.95, 0.97, 1.00],  // permanent snow cap
    ],
    features: [
      { name: 'Mount Everest',   type: 'Summit',  lat: 27.99, lon:  86.93, depth: '---', width: '8,848 m' },
      { name: 'Lhotse',          type: 'Summit',  lat: 27.96, lon:  86.93, depth: '---', width: '8,516 m' },
      { name: 'Makalu',          type: 'Summit',  lat: 27.89, lon:  87.09, depth: '---', width: '8,485 m' },
      { name: 'Khumbu Icefall',  type: 'Glacier', lat: 28.01, lon:  86.86, depth: '---', width: '5,500 m' },
    ],
  },
}

// ─── Coordinate utilities ────────────────────────────────────────────────────

function gridBounds(z, baseX, baseY, grid) {
  const n     = Math.pow(2, z)
  const west  = (baseX / n) * 360 - 180
  const east  = ((baseX + grid) / n) * 360 - 180
  const north = Math.atan(Math.sinh(Math.PI * (1 - 2 * baseY / n))) * (180 / Math.PI)
  const south = Math.atan(Math.sinh(Math.PI * (1 - 2 * (baseY + grid) / n))) * (180 / Math.PI)
  return { west, east, north, south }
}

function latlonToScene(lat, lon, bounds, planeSize = 300) {
  const nx = (lon - bounds.west)  / (bounds.east  - bounds.west)
  const ny = (lat - bounds.north) / (bounds.south - bounds.north)
  return new THREE.Vector3(
    (nx - 0.5) * planeSize,
    0,
    (ny - 0.5) * planeSize,
  )
}

// ─── Shaders ─────────────────────────────────────────────────────────────────

const VERT = /* glsl */`
  varying float vHeight;
  varying vec3  vWorldNormal;
  varying vec3  vWorldPos;
  void main() {
    vHeight      = position.y;
    vWorldPos    = (modelMatrix * vec4(position, 1.0)).xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG = /* glsl */`
  precision mediump float;
  uniform float uTime;
  uniform float uMinH;
  uniform float uMaxH;
  uniform vec3  uC0;
  uniform vec3  uC1;
  uniform vec3  uC2;
  uniform vec3  uC3;
  uniform vec3  uC4;
  varying float vHeight;
  varying vec3  vWorldNormal;
  varying vec3  vWorldPos;

  vec3 terrainColor(float t) {
    if (t < 0.25) return mix(uC0, uC1, t * 4.0);
    if (t < 0.50) return mix(uC1, uC2, (t - 0.25) * 4.0);
    if (t < 0.75) return mix(uC2, uC3, (t - 0.50) * 4.0);
    return            mix(uC3, uC4, (t - 0.75) * 4.0);
  }

  void main() {
    float t     = clamp((vHeight - uMinH) / (uMaxH - uMinH), 0.0, 1.0);
    vec3  color = terrainColor(t);

    vec3  sunDir = normalize(vec3(1.0, 1.8, 0.7));
    float diff   = max(dot(normalize(vWorldNormal), sunDir), 0.0);
    color *= (0.18 + diff * 0.82);

    float range = uMaxH - uMinH;
    float cStep = range / 24.0;
    float c     = mod(vHeight - uMinH, cStep) / cStep;
    float line  = 1.0 - smoothstep(0.0, 0.055, min(c, 1.0 - c));
    color = mix(color, vec3(0.25, 0.42, 0.70) * 0.7, line * 0.55);

    float gx   = 1.0 - smoothstep(0.0, 0.045, abs(fract(vWorldPos.x / 8.0) - 0.5) * 2.0);
    float gz   = 1.0 - smoothstep(0.0, 0.045, abs(fract(vWorldPos.z / 8.0) - 0.5) * 2.0);
    color += vec3(0.06, 0.15, 0.35) * max(gx, gz) * 0.13;

    float scanPos   = vWorldPos.x / 100.0;
    float scanPhase = fract(uTime * 0.10) * 2.0 - 1.0;
    color += vec3(0.20, 0.60, 1.00) * exp(-abs(scanPos - scanPhase) * 18.0) * 0.11;

    float fog = smoothstep(150.0, 210.0, length(vWorldPos.xz));
    color = mix(color, vec3(0.02, 0.04, 0.08), fog);

    gl_FragColor = vec4(color, 1.0);
  }
`

// ─── Tile loading ─────────────────────────────────────────────────────────────

function fetchTile(z, x, y) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => resolve(img)
    img.onerror = () => reject(new Error(`Tile ${z}/${x}/${y} failed`))
    // Proxy: /terrarium → https://s3.amazonaws.com/elevation-tiles-prod
    img.src = `/terrarium/terrarium/${z}/${x}/${y}.png`
  })
}

async function loadHeightmap(region, onStatus) {
  const { z, baseX, baseY, grid } = region
  const TILE  = 256
  const total = TILE * grid

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = total
  const ctx = canvas.getContext('2d')

  onStatus('FETCHING ELEVATION TILES...')

  await Promise.all(
    Array.from({ length: grid * grid }, (_, i) => {
      const col = i % grid
      const row = Math.floor(i / grid)
      return fetchTile(z, baseX + col, baseY + row)
        .then(img => ctx.drawImage(img, col * TILE, row * TILE))
    }),
  )

  onStatus('PROCESSING ELEVATION DATA...')

  const { data } = ctx.getImageData(0, 0, total, total)
  const raw = new Float32Array(total * total)
  // Terrarium RGB encoding: elevation (m) = R*256 + G + B/256 - 32768
  for (let i = 0; i < raw.length; i++) {
    raw[i] = data[i * 4] * 256 + data[i * 4 + 1] + data[i * 4 + 2] / 256 - 32768
  }

  return { raw, size: total }
}

// ─── Terrain mesh ─────────────────────────────────────────────────────────────

function blurHeightmap(src, size, radius) {
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  const w   = 2 * radius + 1

  for (let r = 0; r < size; r++) {
    const off = r * size
    let sum = 0
    for (let k = -radius; k <= radius; k++) sum += src[off + Math.max(0, Math.min(size - 1, k))]
    tmp[off] = sum / w
    for (let c = 1; c < size; c++) {
      sum -= src[off + Math.max(0, c - radius - 1)]
      sum += src[off + Math.min(size - 1, c + radius)]
      tmp[off + c] = sum / w
    }
  }
  for (let c = 0; c < size; c++) {
    let sum = 0
    for (let k = -radius; k <= radius; k++) sum += tmp[Math.max(0, Math.min(size - 1, k)) * size + c]
    out[c] = sum / w
    for (let r = 1; r < size; r++) {
      sum -= tmp[Math.max(0, r - radius - 1) * size + c]
      sum += tmp[Math.min(size - 1, r + radius) * size + c]
      out[r * size + c] = sum / w
    }
  }
  return out
}

const DEFAULT_PALETTE = [
  [0.10, 0.09, 0.08],
  [0.30, 0.22, 0.16],
  [0.50, 0.46, 0.40],
  [0.70, 0.70, 0.68],
  [0.92, 0.95, 0.98],
]

function buildTerrain(scene, raw, size, sceneH = 40, palette = DEFAULT_PALETTE) {
  const smooth = blurHeightmap(raw, size, 2)

  let minR = Infinity, maxR = -Infinity
  for (const v of smooth) { if (v < minR) minR = v; if (v > maxR) maxR = v }

  const scale = sceneH / Math.max(maxR - minR, 1)

  const geo = new THREE.PlaneGeometry(300, 300, size - 1, size - 1)
  geo.rotateX(-Math.PI / 2)

  const pos = geo.attributes.position
  let minH = Infinity, maxH = -Infinity
  for (let i = 0; i < smooth.length; i++) {
    const h = (smooth[i] - minR) * scale - sceneH / 2
    pos.setY(i, h)
    if (h < minH) minH = h
    if (h > maxH) maxH = h
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()

  const p = palette
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMinH: { value: minH },
      uMaxH: { value: maxH },
      uC0: { value: new THREE.Color(...p[0]) },
      uC1: { value: new THREE.Color(...p[1]) },
      uC2: { value: new THREE.Color(...p[2]) },
      uC3: { value: new THREE.Color(...p[3]) },
      uC4: { value: new THREE.Color(...p[4]) },
    },
    vertexShader: VERT, fragmentShader: FRAG,
  })

  const mesh = new THREE.Mesh(geo, mat)
  scene.add(mesh)

  function sampleHeight(sceneX, sceneZ) {
    const col = Math.round((sceneX / 300 + 0.5) * (size - 1))
    const row = Math.round((sceneZ / 300 + 0.5) * (size - 1))
    const idx = Math.max(0, Math.min(size * size - 1, row * size + col))
    return (smooth[idx] - minR) * scale - sceneH / 2
  }

  return { mesh, material: mat, sampleHeight }
}

// ─── Feature markers ──────────────────────────────────────────────────────────

function buildFeatureMarkers(scene, features) {
  return features.map(f => {
    const pos = f.scenePos

    const ringGeo = new THREE.RingGeometry(3.5, 5.5, 48)
    ringGeo.rotateX(-Math.PI / 2)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x1a7fc4, transparent: true, opacity: 0.22,
      side: THREE.DoubleSide, depthWrite: false,
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.position.copy(pos)
    scene.add(ring)

    const dotGeo = new THREE.CircleGeometry(1.2, 24)
    dotGeo.rotateX(-Math.PI / 2)
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0x1a7fc4, transparent: true, opacity: 0.35,
      side: THREE.DoubleSide, depthWrite: false,
    })
    const dot = new THREE.Mesh(dotGeo, dotMat)
    dot.position.copy(pos)
    scene.add(dot)

    const pulseGeo = new THREE.RingGeometry(3.5, 5.5, 48)
    pulseGeo.rotateX(-Math.PI / 2)
    const pulseMat = new THREE.MeshBasicMaterial({
      color: 0x40b8ff, transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false,
    })
    const pulse = new THREE.Mesh(pulseGeo, pulseMat)
    pulse.position.copy(pos)
    scene.add(pulse)

    return { ring, ringMat, dot, dotMat, pulse, pulseMat, active: false, phase: 0 }
  })
}

function updateMarkers(markers, dt) {
  markers.forEach(m => {
    if (m.active) {
      m.phase = (m.phase + dt * 1.2) % 1
      const s = 1 + m.phase * 2.2
      m.pulse.scale.set(s, 1, s)
      m.pulseMat.opacity = (1 - m.phase) * 0.75
      m.ringMat.opacity  = 0.85
      m.dotMat.opacity   = 0.9
    } else {
      m.phase = 0
      m.pulse.scale.set(1, 1, 1)
      m.pulseMat.opacity = 0
      m.ringMat.opacity  = 0.22
      m.dotMat.opacity   = 0.35
    }
  })
}

// ─── River ribbon ────────────────────────────────────────────────────────────
// Colorado River path through tiles (z=11, x=384-387, y=800-803)
// Tile bounds: lon -112.5 → -111.797, lat 35.99 → 36.596
// River enters Marble Canyon from NE (~36.47N), flows south then turns west
const COLORADO_RIVER = [
  { lat: 36.47,  lon: -111.83 },  // Nankoweap area — northern Marble Canyon entry
  { lat: 36.34,  lon: -111.86 },  // flowing south through Marble Canyon
  { lat: 36.22,  lon: -111.89 },  // approaching canyon elbow
  { lat: 36.12,  lon: -111.92 },  // near Little Colorado confluence — turning west
  { lat: 36.07,  lon: -111.98 },  // Desert View area, now flowing west
  { lat: 36.07,  lon: -112.08 },  // inner gorge heading west
  { lat: 36.10,  lon: -112.13 },  // Phantom Ranch
  { lat: 36.07,  lon: -112.19 },  // Bright Angel / Indian Garden
  { lat: 36.10,  lon: -112.29 },  // Hermit area
  { lat: 36.17,  lon: -112.40 },  // Bass camp
  { lat: 36.22,  lon: -112.48 },  // western extent of tiles
]

function buildRiverRibbon(scene, bounds, sampleHeight) {
  const pts = COLORADO_RIVER.map(({ lat, lon }) => {
    const p = latlonToScene(lat, lon, bounds)
    p.y = sampleHeight(p.x, p.z) + 0.8   // ride just above terrain surface
    return p
  })

  const curve   = new THREE.CatmullRomCurve3(pts)
  const tubeGeo = new THREE.TubeGeometry(curve, 120, 0.45, 7, false)
  const tubeMat = new THREE.MeshBasicMaterial({
    color: 0x1a6aff, transparent: true, opacity: 0.82,
  })
  scene.add(new THREE.Mesh(tubeGeo, tubeMat))

  // Subtle glow halo — wider, very translucent
  const haloGeo = new THREE.TubeGeometry(curve, 120, 1.2, 7, false)
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0x3090ff, transparent: true, opacity: 0.18, depthWrite: false,
  })
  scene.add(new THREE.Mesh(haloGeo, haloMat))
}

// ─── View factory ─────────────────────────────────────────────────────────────

export function createEarthView(regionKey) {
  let scene_, camCtrl_, composer_, terrain_, markers_, clock_

  return {
    async init(renderer) {
      clock_ = new THREE.Clock()

      scene_ = new THREE.Scene()
      scene_.background = new THREE.Color(0x020810)
      scene_.fog = new THREE.FogExp2(0x020810, 0.005)   // softer than Mars — more distant haze

      const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.5, 2000)
      camCtrl_ = new CameraController(camera, renderer.domElement)
      const region0 = REGIONS[regionKey]
      if (region0.camPos) {
        const [cx, cy, cz] = region0.camPos
        camCtrl_.camera.position.set(cx, cy, cz)
      }
      if (region0.camTarget) {
        const [tx, ty, tz] = region0.camTarget
        camCtrl_.controls.target.set(tx, ty, tz)
        camCtrl_.camera.lookAt(tx, ty, tz)
      }

      composer_ = new EffectComposer(renderer)
      composer_.addPass(new RenderPass(scene_, camera))
      composer_.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.4, 0.85))

      scene_.add(new THREE.AmbientLight(0x0d1a2e, 1.5))
      const sun = new THREE.DirectionalLight(0xfff4e0, 1.6)
      sun.position.set(140, 160, 70)
      scene_.add(sun)
      const fill = new THREE.DirectionalLight(0x1a2840, 0.35)
      fill.position.set(-100, 40, -80)
      scene_.add(fill)

      // Stars — fewer and cooler than Mars
      const starPos = new Float32Array(1800 * 3)
      for (let i = 0; i < 1800; i++) {
        const theta = Math.random() * Math.PI * 0.5
        const phi   = Math.random() * Math.PI * 2
        const r     = 460 + Math.random() * 40
        starPos[i * 3]     = r * Math.sin(theta) * Math.cos(phi)
        starPos[i * 3 + 1] = r * Math.cos(theta)
        starPos[i * 3 + 2] = r * Math.sin(theta) * Math.sin(phi)
      }
      const starGeo = new THREE.BufferGeometry()
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
      scene_.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x8ab0d0, size: 0.5, sizeAttenuation: true })))

      const region = REGIONS[regionKey]
      const { raw, size } = await loadHeightmap(region, setStatus)
      terrain_ = buildTerrain(scene_, raw, size, region.sceneH, region.palette)

      const bounds = gridBounds(region.z, region.baseX, region.baseY, region.grid)
      const featuresWithPos = region.features.map(f => {
        const pos = latlonToScene(f.lat, f.lon, bounds)
        pos.y = terrain_.sampleHeight(pos.x, pos.z) + 0.3
        return { ...f, scenePos: pos }
      })

      markers_ = buildFeatureMarkers(scene_, featuresWithPos)

      // River ribbon — Grand Canyon only
      if (regionKey === 'grandcanyon') {
        buildRiverRibbon(scene_, bounds, terrain_.sampleHeight)
      }

      initMarsHUD(region, featuresWithPos, 'EARTH SURFACE SURVEY')
      setStatus(`${region.label} · ACTIVE`)
      setTerrainLabel(`EARTH · TERRARIUM · Z${region.z}`)

      setFeatureClickCallback((feature, idx) => {
        if (feature.scenePos && camCtrl_) {
          camCtrl_.focusOn(feature.scenePos)
          setStatus(`TARGETING: ${feature.name.toUpperCase()}`)
          setTimeout(() => setStatus(`${region.label} · ACTIVE`), 3000)
        }
        markers_.forEach((m, i) => { m.active = (i === idx) })
      })
    },

    animate() {
      if (!composer_) return
      const dt = clock_.getDelta()
      terrain_.material.uniforms.uTime.value = clock_.elapsedTime
      if (markers_?.length) updateMarkers(markers_, dt)
      camCtrl_.update(dt)
      composer_.render()
      return { camera: camCtrl_.camera }
    },

    getClickTargets() { return [] },

    resize() {
      if (!camCtrl_ || !composer_) return
      camCtrl_.camera.aspect = window.innerWidth / window.innerHeight
      camCtrl_.camera.updateProjectionMatrix()
      composer_.setSize(window.innerWidth, window.innerHeight)
    },

    dispose() {
      setFeatureClickCallback(null)
      camCtrl_?.dispose()
      composer_?.dispose()
      scene_?.traverse((obj) => {
        obj.geometry?.dispose()
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats?.forEach(m => m?.dispose())
      })
      scene_ = camCtrl_ = composer_ = terrain_ = markers_ = null
    },
  }
}
