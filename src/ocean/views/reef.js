import * as THREE from 'three'
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { createNoise2D } from 'simplex-noise'
import { CameraController } from '../camera.js'
import { createBubbles, createMarineSnow } from '../particles.js'
import { initGeoHUD, setStatus, setFeatureClickCallback } from '../hud.js'

// ─── Reef shader (warm, bright, heavy caustics) ─────────────────────────────

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

  vec3 reefColor(float t) {
    vec3 c0 = vec3(0.12, 0.18, 0.22);   // deep sand / rock
    vec3 c1 = vec3(0.22, 0.30, 0.28);   // dark reef
    vec3 c2 = vec3(0.35, 0.48, 0.42);   // mid reef — green coral
    vec3 c3 = vec3(0.55, 0.65, 0.50);   // shallow — sandy green
    vec3 c4 = vec3(0.72, 0.78, 0.60);   // near-surface — bright sand

    if (t < 0.25) return mix(c0, c1, t * 4.0);
    if (t < 0.50) return mix(c1, c2, (t - 0.25) * 4.0);
    if (t < 0.75) return mix(c2, c3, (t - 0.50) * 4.0);
    return            mix(c3, c4, (t - 0.75) * 4.0);
  }

  void main() {
    float t     = clamp((vHeight - uMinH) / (uMaxH - uMinH), 0.0, 1.0);
    vec3  color = reefColor(t);

    // ── Strong sunlight (shallow water — light penetrates well)
    vec3  sunDir = normalize(vec3(0.4, 1.0, 0.3));
    float diff   = max(dot(normalize(vWorldNormal), sunDir), 0.0);
    color *= (0.25 + diff * 0.75);

    // ── Heavy caustics (the defining visual of shallow water)
    float c1 = sin(vWorldPos.x * 1.2 + uTime * 0.9) * sin(vWorldPos.z * 1.3 + uTime * 0.7);
    float c2 = sin(vWorldPos.x * 0.8 - uTime * 0.6) * sin(vWorldPos.z * 0.9 - uTime * 0.5);
    float caustics = max(c1, 0.0) * 0.12 + max(c2, 0.0) * 0.08;
    color += vec3(0.45, 0.65, 0.55) * caustics;

    // ── Subtle contour lines
    float range = uMaxH - uMinH;
    float cStep = range / 16.0;
    float c     = mod(vHeight - uMinH, cStep) / cStep;
    float line  = 1.0 - smoothstep(0.0, 0.06, min(c, 1.0 - c));
    color = mix(color, vec3(0.15, 0.50, 0.45) * 0.5, line * 0.4);

    // ── Gentle grid
    float gx   = 1.0 - smoothstep(0.0, 0.05, abs(fract(vWorldPos.x / 8.0) - 0.5) * 2.0);
    float gz   = 1.0 - smoothstep(0.0, 0.05, abs(fract(vWorldPos.z / 8.0) - 0.5) * 2.0);
    color += vec3(0.10, 0.30, 0.25) * max(gx, gz) * 0.08;

    // ── Sonar pulse (still present but gentler)
    float dist      = length(vWorldPos.xz);
    float pulsePos  = fract(uTime * 0.08) * 120.0;
    float pulseLine = exp(-abs(dist - pulsePos) * 1.0);
    color += vec3(0.15, 0.50, 0.45) * pulseLine * 0.10;

    // ── Light blue-green fog (warm water murk)
    float fog = smoothstep(70.0, 120.0, length(vWorldPos.xz));
    color = mix(color, vec3(0.06, 0.14, 0.16), fog);

    gl_FragColor = vec4(color, 1.0);
  }
`

// ─── Reef region data ───────────────────────────────────────────────────────

const REEF_REGION = {
  label:    'CORAL REEF',
  subtitle: 'SHALLOW WATER REEF SYSTEM · PROCEDURAL',
  features: [
    { name: 'Staghorn Coral Colony',    type: 'creature', lat: 0, lon: 0, depth: '-12 m',  species: 'Acropora cervicornis' },
    { name: 'Brain Coral Formation',    type: 'creature', lat: 0, lon: 0, depth: '-8 m',   species: 'Diploria labyrinthiformis' },
    { name: 'Sea Fan Garden',           type: 'creature', lat: 0, lon: 0, depth: '-18 m',  species: 'Gorgonia ventalina' },
    { name: 'Sand Channel',             type: 'trench',   lat: 0, lon: 0, depth: '-22 m',  width: '15 m' },
  ],
}

const FEATURE_POSITIONS = [
  [-30, 20], [35, -15], [-10, 45], [25, -40],
]

// ─── View factory ───────────────────────────────────────────────────────────

export function createReefView() {
  let scene_, camCtrl_, composer_, material_, markers_, bubbles_, snow_, clock_

  return {
    async init(renderer) {
      clock_ = new THREE.Clock()

      scene_ = new THREE.Scene()
      scene_.background = new THREE.Color(0x061418)
      scene_.fog = new THREE.FogExp2(0x061418, 0.009)

      const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.5, 2000)
      camCtrl_ = new CameraController(camera, renderer.domElement)
      camCtrl_.camera.position.set(0, 40, 80)

      composer_ = new EffectComposer(renderer)
      composer_.addPass(new RenderPass(scene_, camera))
      composer_.addPass(new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.6, 0.4, 0.85
      ))

      // Bright warm lighting — shallow water
      scene_.add(new THREE.AmbientLight(0x183828, 2.0))
      const sun = new THREE.DirectionalLight(0xfff8e0, 1.4)
      sun.position.set(60, 180, 40)
      scene_.add(sun)
      const fill = new THREE.DirectionalLight(0x1a3830, 0.5)
      fill.position.set(-60, 40, -50)
      scene_.add(fill)

      // Generate reef terrain procedurally
      const SIZE = 160, SEG = 280
      const noise2D = createNoise2D()

      function fbm(x, z) {
        const wx = x + 3.0 * noise2D(x * 0.005, z * 0.005)
        const wz = z + 3.0 * noise2D(x * 0.005 + 5.2, z * 0.005 + 1.3)
        let v = 0, amp = 1, freq = 0.008, total = 0
        for (let i = 0; i < 6; i++) {
          v += noise2D(wx * freq, wz * freq) * amp
          total += amp
          amp *= 0.55
          freq *= 2.0
        }
        // Shallow reef: small height range, centered around a shallow depth
        return (v / total) * 8.0 - 4.0
      }

      const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG)
      geo.rotateX(-Math.PI / 2)
      const pos = geo.attributes.position
      let minH = Infinity, maxH = -Infinity
      for (let i = 0; i < pos.count; i++) {
        const h = fbm(pos.getX(i), pos.getZ(i))
        pos.setY(i, h)
        if (h < minH) minH = h
        if (h > maxH) maxH = h
      }
      pos.needsUpdate = true
      geo.computeVertexNormals()

      material_ = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uMinH: { value: minH },
          uMaxH: { value: maxH },
        },
        vertexShader: VERT, fragmentShader: FRAG,
      })

      scene_.add(new THREE.Mesh(geo, material_))

      // Features with scene positions
      const featuresWithPos = REEF_REGION.features.map((f, i) => {
        const [fx, fz] = FEATURE_POSITIONS[i]
        const y = fbm(fx, fz) + 0.3
        return { ...f, scenePos: new THREE.Vector3(fx, y, fz) }
      })

      // Feature markers
      markers_ = featuresWithPos.map(f => {
        const fPos = f.scenePos
        const TYPE_COLORS = { creature: 0x40ff80, trench: 0x2080ff }
        const col = TYPE_COLORS[f.type] || 0x40ff80

        const ringGeo = new THREE.RingGeometry(2.5, 4.0, 48)
        ringGeo.rotateX(-Math.PI / 2)
        const ringMat = new THREE.MeshBasicMaterial({
          color: col, transparent: true, opacity: 0.25,
          side: THREE.DoubleSide, depthWrite: false,
        })
        const ring = new THREE.Mesh(ringGeo, ringMat)
        ring.position.copy(fPos)
        scene_.add(ring)

        const dotGeo = new THREE.CircleGeometry(0.9, 24)
        dotGeo.rotateX(-Math.PI / 2)
        const dotMat = new THREE.MeshBasicMaterial({
          color: col, transparent: true, opacity: 0.40,
          side: THREE.DoubleSide, depthWrite: false,
        })
        const dot = new THREE.Mesh(dotGeo, dotMat)
        dot.position.copy(fPos)
        scene_.add(dot)

        const pulseGeo = new THREE.RingGeometry(2.5, 4.0, 48)
        pulseGeo.rotateX(-Math.PI / 2)
        const pulseMat = new THREE.MeshBasicMaterial({
          color: col, transparent: true, opacity: 0,
          side: THREE.DoubleSide, depthWrite: false,
        })
        const pulse = new THREE.Mesh(pulseGeo, pulseMat)
        pulse.position.copy(fPos)
        scene_.add(pulse)

        return { ring, ringMat, dot, dotMat, pulse, pulseMat, active: false, phase: 0 }
      })

      // Bubbles + light marine snow
      bubbles_ = createBubbles(scene_, 300, 120)
      snow_ = createMarineSnow(scene_, 1200, 140)

      initGeoHUD(REEF_REGION, featuresWithPos, 'SHALLOW WATER SURVEY')
      setStatus('CORAL REEF · ACTIVE')

      setFeatureClickCallback((feature, idx) => {
        if (feature.scenePos && camCtrl_) {
          camCtrl_.focusOn(feature.scenePos)
          setStatus(`TARGETING: ${feature.name.toUpperCase()}`)
          setTimeout(() => setStatus('CORAL REEF · ACTIVE'), 3000)
        }
        markers_.forEach((m, i) => { m.active = (i === idx) })
      })
    },

    animate() {
      if (!composer_) return
      const dt = clock_.getDelta()
      const t  = clock_.elapsedTime

      material_.uniforms.uTime.value = t

      // Update markers
      markers_?.forEach(m => {
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
          m.ringMat.opacity  = 0.25
          m.dotMat.opacity   = 0.40
        }
      })

      bubbles_?.update(dt, camCtrl_.camera.position)
      snow_?.update(dt, camCtrl_.camera.position)
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
      bubbles_?.dispose()
      snow_?.dispose()
      camCtrl_?.dispose()
      composer_?.dispose()
      scene_?.traverse((obj) => {
        obj.geometry?.dispose()
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats?.forEach(m => m?.dispose())
      })
      scene_ = camCtrl_ = composer_ = material_ = markers_ = bubbles_ = snow_ = null
    },
  }
}
