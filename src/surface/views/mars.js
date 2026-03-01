import * as THREE from 'three'
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { isMobile } from '../../post.js'
import { CameraController } from '../camera.js'
import { initMarsHUD, setStatus, setTerrainLabel, setFeatureClickCallback } from '../hud.js'

// ─── Region definitions ──────────────────────────────────────────────────────
// Each region: MOLA tile config + geological features with real lat/lon

export const REGIONS = {
  valles: {
    label:    'VALLES MARINERIS',
    subtitle: 'WESTERN RIFT · MELAS & COPRATES CHASMA',
    z: 7, baseX: 38, baseY: 65, grid: 4, sceneH: 38,
    features: [
      { name: 'Melas Chasma',    type: 'Canyon',   lat: -10.2, lon: -71.0, depth: '9.1 km', width: '200 km' },
      { name: 'Candor Chasma',   type: 'Canyon',   lat:  -6.4, lon: -71.5, depth: '6.5 km', width: '813 km' },
      { name: 'Coprates Chasma', type: 'Canyon',   lat: -13.0, lon: -64.5, depth: '8.5 km', width: '100 km' },
      { name: 'Juventae Chasma', type: 'Canyon',   lat:  -3.8, lon: -63.2, depth: '5.0 km', width: '150 km' },
    ],
  },
  olympus: {
    label:    'OLYMPUS MONS',
    subtitle: 'SHIELD VOLCANO · THARSIS REGION',
    z: 7, baseX: 14, baseY: 55, grid: 4, sceneH: 44,
    features: [
      { name: 'Summit Caldera',  type: 'Caldera',   lat:  18.4, lon: -133.8, depth: '3.2 km', width:  '80 km' },
      { name: 'NW Escarpment',   type: 'Cliff',     lat:  20.2, lon: -138.0, depth: '8.0 km', width: '---'    },
      { name: 'SE Flank',        type: 'Slope',     lat:  15.5, lon: -131.5, depth: '---',    width: '---'    },
      { name: 'Outer Aureole',   type: 'Formation', lat:  17.2, lon: -140.0, depth: '---',    width: '600 km' },
    ],
  },
  hellas: {
    label:    'HELLAS BASIN',
    subtitle: 'IMPACT CRATER · SOUTHERN HEMISPHERE',
    z: 6, baseX: 17, baseY: 39, grid: 4, sceneH: 36,   // zoom 6 — basin is enormous
    features: [
      { name: 'Hellas Planitia', type: 'Basin',   lat: -43.0, lon: -69.0, depth: '8.2 km', width: '2300 km' },
      { name: 'Dao Vallis',      type: 'Channel', lat: -36.5, lon: -66.0, depth: '1.5 km', width:   '40 km' },
      { name: 'Southern Rim',    type: 'Rim',     lat: -51.0, lon: -71.0, depth: '---',    width: '---'     },
      { name: 'Eastern Rim',     type: 'Rim',     lat: -43.5, lon: -62.5, depth: '---',    width: '---'     },
    ],
  },
}

// ─── Coordinate utilities ────────────────────────────────────────────────────

function gridBounds(z, baseX, baseY, grid) {
  const n    = Math.pow(2, z)
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
  varying float vHeight;
  varying vec3  vWorldNormal;
  varying vec3  vWorldPos;

  vec3 terrainColor(float t) {
    vec3 c0 = vec3(0.10, 0.04, 0.03);
    vec3 c1 = vec3(0.25, 0.11, 0.07);
    vec3 c2 = vec3(0.48, 0.22, 0.09);
    vec3 c3 = vec3(0.68, 0.38, 0.15);
    vec3 c4 = vec3(0.84, 0.62, 0.35);
    if (t < 0.25) return mix(c0, c1, t * 4.0);
    if (t < 0.50) return mix(c1, c2, (t - 0.25) * 4.0);
    if (t < 0.75) return mix(c2, c3, (t - 0.50) * 4.0);
    return            mix(c3, c4, (t - 0.75) * 4.0);
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
    color = mix(color, vec3(0.75, 0.38, 0.08) * 0.6, line * 0.8);

    float gx   = 1.0 - smoothstep(0.0, 0.045, abs(fract(vWorldPos.x / 8.0) - 0.5) * 2.0);
    float gz   = 1.0 - smoothstep(0.0, 0.045, abs(fract(vWorldPos.z / 8.0) - 0.5) * 2.0);
    color += vec3(0.35, 0.14, 0.04) * max(gx, gz) * 0.14;

    float scanPos   = vWorldPos.x / 100.0;
    float scanPhase = fract(uTime * 0.10) * 2.0 - 1.0;
    color += vec3(0.65, 0.30, 0.05) * exp(-abs(scanPos - scanPhase) * 18.0) * 0.10;

    float fog = smoothstep(75.0, 120.0, length(vWorldPos.xz));
    color = mix(color, vec3(0.08, 0.03, 0.02), fog);

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
    img.src = `/mola/mola-gray/${z}/${x}/${y}.png`
  })
}

async function loadHeightmap(region, onStatus) {
  const { z, baseX, baseY, grid } = region
  const TILE  = 256
  const total = TILE * grid

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = total
  const ctx = canvas.getContext('2d')

  onStatus('FETCHING MOLA ELEVATION TILES...')

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
  for (let i = 0; i < raw.length; i++) raw[i] = data[i * 4]

  return { raw, size: total }
}

// ─── Terrain mesh ─────────────────────────────────────────────────────────────

// Box blur (separable, clamped edges) — removes spike pixels without shrinking range
function blurHeightmap(src, size, radius) {
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  const w   = 2 * radius + 1

  // Horizontal pass
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
  // Vertical pass
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

function buildTerrain(scene, raw, size, sceneH = 36) {
  // Blur to remove spike pixels; keeps the natural data range intact
  const smooth = blurHeightmap(raw, size, 2)

  let minR = 255, maxR = 0
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

  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uMinH: { value: minH }, uMaxH: { value: maxH } },
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
      color: 0xc8440a, transparent: true, opacity: 0.22,
      side: THREE.DoubleSide, depthWrite: false,
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.position.copy(pos)
    scene.add(ring)

    const dotGeo = new THREE.CircleGeometry(1.2, 24)
    dotGeo.rotateX(-Math.PI / 2)
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xc8440a, transparent: true, opacity: 0.35,
      side: THREE.DoubleSide, depthWrite: false,
    })
    const dot = new THREE.Mesh(dotGeo, dotMat)
    dot.position.copy(pos)
    scene.add(dot)

    const pulseGeo = new THREE.RingGeometry(3.5, 5.5, 48)
    pulseGeo.rotateX(-Math.PI / 2)
    const pulseMat = new THREE.MeshBasicMaterial({
      color: 0xff7040, transparent: true, opacity: 0,
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

// ─── View factory ─────────────────────────────────────────────────────────────

export function createMarsView(regionKey) {
  let scene_, camCtrl_, composer_, terrain_, markers_, clock_

  return {
    async init(renderer) {
      clock_ = new THREE.Clock()

      scene_ = new THREE.Scene()
      scene_.background = new THREE.Color(0x0a0403)
      scene_.fog = new THREE.FogExp2(0x0a0403, 0.008)

      const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.5, 2000)
      camCtrl_ = new CameraController(camera, renderer.domElement)

      if (isMobile) {
        composer_ = { render() { renderer.render(scene_, camera) }, setSize() {}, dispose() {} }
      } else {
        composer_ = new EffectComposer(renderer)
        composer_.addPass(new RenderPass(scene_, camera))
        composer_.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.5, 0.82))
      }

      scene_.add(new THREE.AmbientLight(0x1a0d08, 1.4))
      const sun = new THREE.DirectionalLight(0xffcc88, 1.5)
      sun.position.set(140, 160, 70)
      scene_.add(sun)
      const fill = new THREE.DirectionalLight(0x301008, 0.3)
      fill.position.set(-100, 40, -80)
      scene_.add(fill)

      // Stars — visible through thin Martian atmosphere
      const starPos = new Float32Array(2800 * 3)
      for (let i = 0; i < 2800; i++) {
        const theta = Math.random() * Math.PI * 0.5
        const phi   = Math.random() * Math.PI * 2
        const r     = 460 + Math.random() * 40
        starPos[i * 3]     = r * Math.sin(theta) * Math.cos(phi)
        starPos[i * 3 + 1] = r * Math.cos(theta)
        starPos[i * 3 + 2] = r * Math.sin(theta) * Math.sin(phi)
      }
      const starGeo = new THREE.BufferGeometry()
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
      scene_.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xb0a898, size: 0.5, sizeAttenuation: true })))

      // Load heightmap
      const region = REGIONS[regionKey]
      const { raw, size } = await loadHeightmap(region, setStatus)
      terrain_ = buildTerrain(scene_, raw, size, region.sceneH)

      // Compute scene positions for geological features (Y from terrain height)
      const bounds = gridBounds(region.z, region.baseX, region.baseY, region.grid)
      const featuresWithPos = region.features.map(f => {
        const pos = latlonToScene(f.lat, f.lon, bounds)
        pos.y = terrain_.sampleHeight(pos.x, pos.z) + 0.3
        return { ...f, scenePos: pos }
      })

      // Feature markers
      markers_ = buildFeatureMarkers(scene_, featuresWithPos)

      // HUD
      initMarsHUD(region, featuresWithPos)
      setStatus(`${region.label} · ACTIVE`)
      setTerrainLabel(`MARS · MOLA · Z${region.z}`)

      // Wire feature clicks → camera focus + marker activation
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
