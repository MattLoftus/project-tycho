import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { createComposer } from '../post.js'
import { createCameraMovement } from '../camera-movement.js'
import { createPompeiiModel } from './pompeii-model.js'

/**
 * Pompeii City Block view.
 * "79 AD" / "RUINS" mode toggle with crossfade, CSS2D labels, camera fly-to, click-to-inspect.
 */

export function createPompeiiView() {
  let scene_, camera_, controls_, renderer_
  let composer_, bloomPass_, cinematicPass_
  let labelRenderer_
  let camMove_
  let clock_
  let model_ = null
  let labels_ = []

  // Transition state: 0 = reconstructed (79 AD), 1 = ruins
  let transProgress_ = 0
  let transTarget_ = 0

  // Camera fly-to animation state
  let flyAnim_ = null

  // Track materials for opacity crossfade
  let reconMaterials_ = []
  let ruinMaterials_ = []

  function collectMaterials(group) {
    const mats = []
    group.traverse(obj => {
      if (obj.material) {
        const m = Array.isArray(obj.material) ? obj.material : [obj.material]
        m.forEach(mat => {
          if (!mats.includes(mat)) {
            mat.transparent = true
            mats.push(mat)
          }
        })
      }
    })
    return mats
  }

  return {
    init(renderer) {
      renderer_ = renderer
      clock_ = new THREE.Clock()

      scene_ = new THREE.Scene()
      scene_.fog = new THREE.FogExp2(0x90a8c0, 0.0015)

      // ── Mediterranean sky dome ──
      const skyGeo = new THREE.SphereGeometry(900, 32, 16)
      const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {},
        vertexShader: `
          varying vec3 vWorldPos;
          void main() {
            vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          precision mediump float;
          varying vec3 vWorldPos;
          void main() {
            float h = normalize(vWorldPos).y;
            vec3 groundCol = vec3(0.45, 0.42, 0.38);
            vec3 hazeCol = vec3(0.75, 0.70, 0.60);
            vec3 midCol = vec3(0.50, 0.62, 0.82);
            vec3 zenithCol = vec3(0.25, 0.40, 0.75);

            vec3 col;
            if (h < 0.0) {
              col = groundCol;
            } else if (h < 0.06) {
              col = mix(hazeCol, midCol, h / 0.06);
            } else if (h < 0.35) {
              col = mix(midCol, zenithCol, (h - 0.06) / 0.29);
            } else {
              col = zenithCol;
            }

            // Warm sun glow
            float sunAngle = atan(vWorldPos.z, vWorldPos.x);
            float sunTarget = -0.8;
            float sunDist = abs(sunAngle - sunTarget);
            float sunGlow = exp(-sunDist * 2.5) * smoothstep(-0.02, 0.12, h) * smoothstep(0.4, 0.0, h);
            col += vec3(0.5, 0.35, 0.15) * sunGlow;

            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
      scene_.add(new THREE.Mesh(skyGeo, skyMat))

      camera_ = new THREE.PerspectiveCamera(
        50, window.innerWidth / window.innerHeight, 0.3, 2000
      )
      // Elevated looking down at the block at an angle
      camera_.position.set(35, 30, 40)

      controls_ = new OrbitControls(camera_, renderer.domElement)
      controls_.enableDamping = true
      controls_.dampingFactor = 0.05
      controls_.target.set(0, 1, -5)
      controls_.minDistance = 5
      controls_.maxDistance = 200
      controls_.maxPolarAngle = Math.PI / 2.05

      camMove_ = createCameraMovement(camera_, controls_)

      // ── Lighting — warm Mediterranean noon ──
      scene_.add(new THREE.AmbientLight(0x605848, 1.8))

      const sun = new THREE.DirectionalLight(0xfff0d0, 2.5)
      sun.position.set(80, 150, -60)
      scene_.add(sun)

      const fill = new THREE.DirectionalLight(0x6080b0, 0.5)
      fill.position.set(-60, 40, 60)
      scene_.add(fill)

      const rim = new THREE.DirectionalLight(0xa08040, 0.3)
      rim.position.set(-30, 60, -100)
      scene_.add(rim)

      // ── Ground plane — volcanic soil/stone ──
      const groundGeo = new THREE.PlaneGeometry(800, 800, 128, 128)
      groundGeo.rotateX(-Math.PI / 2)
      const gPos = groundGeo.attributes.position
      for (let i = 0; i < gPos.count; i++) {
        const x = gPos.getX(i), z = gPos.getZ(i)
        const dist = Math.sqrt(x * x + z * z)
        const mask = Math.min(1, Math.max(0, (dist - 40) / 100))
        const h = mask * (
          Math.sin(x * 0.01 + z * 0.008) * 1.5 +
          Math.sin(x * 0.03 - z * 0.02) * 0.6
        )
        gPos.setY(i, h)
      }
      groundGeo.computeVertexNormals()

      const groundMat = new THREE.ShaderMaterial({
        uniforms: {
          uSunDir: { value: new THREE.Vector3(0.4, 0.75, -0.3).normalize() },
        },
        vertexShader: `
          varying vec3 vWorldPos;
          varying vec3 vNormal;
          void main() {
            vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          precision mediump float;
          uniform vec3 uSunDir;
          varying vec3 vWorldPos;
          varying vec3 vNormal;

          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                       mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
          }
          float fbm(vec2 p) {
            float v = 0.0, a = 0.5;
            for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.1; a *= 0.48; }
            return v;
          }

          void main() {
            vec2 wp = vWorldPos.xz;
            float grain = fbm(wp * 1.2);
            float coarse = fbm(wp * 0.05);

            vec3 baseDark = vec3(0.38, 0.34, 0.30);
            vec3 baseMid  = vec3(0.48, 0.43, 0.38);
            vec3 baseLight = vec3(0.55, 0.50, 0.42);

            vec3 col = mix(baseMid, baseLight, grain * 0.5);
            col = mix(col, baseDark, coarse * 0.2);

            float ndotl = max(dot(vNormal, uSunDir), 0.0);
            col *= 0.4 + ndotl * 0.6;

            float dist = length(vWorldPos.xz);
            float haze = smoothstep(150.0, 500.0, dist);
            col = mix(col, vec3(0.50, 0.48, 0.44), haze);

            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
      const ground = new THREE.Mesh(groundGeo, groundMat)
      ground.position.y = -0.1
      scene_.add(ground)

      // ── Vesuvius in background ──
      const vesRadius = 80
      const vesHeight = 120
      const vesGeo = new THREE.ConeGeometry(vesRadius, vesHeight, 32, 1)
      const vesMat = new THREE.MeshStandardMaterial({
        color: 0x5a5040, roughness: 0.9, metalness: 0.0,
        emissive: 0x3a3028, emissiveIntensity: 0.2,
      })
      const vesuvius = new THREE.Mesh(vesGeo, vesMat)
      vesuvius.position.set(-100, vesHeight / 2 - 10, -350)
      scene_.add(vesuvius)

      // Snow cap
      const snowGeo = new THREE.ConeGeometry(vesRadius * 0.25, vesHeight * 0.15, 32, 1)
      const snowMat = new THREE.MeshStandardMaterial({
        color: 0xf0f0f0, roughness: 0.8, metalness: 0.0,
        emissive: 0xe0e0e0, emissiveIntensity: 0.3,
      })
      const snow = new THREE.Mesh(snowGeo, snowMat)
      snow.position.set(-100, vesHeight - 10 - vesHeight * 0.075, -350)
      scene_.add(snow)

      // ── Pompeii model ──
      model_ = createPompeiiModel()
      scene_.add(model_.reconstructed)
      scene_.add(model_.ruins)

      // Add click targets to scene
      for (const ct of model_.clickTargets) {
        scene_.add(ct)
      }

      // Collect materials for crossfade
      reconMaterials_ = collectMaterials(model_.reconstructed)
      ruinMaterials_ = collectMaterials(model_.ruins)

      // Set initial state: reconstructed visible, ruins hidden
      model_.reconstructed.visible = true
      model_.ruins.visible = false
      for (const mat of reconMaterials_) mat.opacity = 1.0
      for (const mat of ruinMaterials_) mat.opacity = 0.0

      // ── CSS2D label renderer ──
      labelRenderer_ = new CSS2DRenderer()
      labelRenderer_.setSize(window.innerWidth, window.innerHeight)
      labelRenderer_.domElement.style.position = 'absolute'
      labelRenderer_.domElement.style.top = '0'
      labelRenderer_.domElement.style.left = '0'
      labelRenderer_.domElement.style.pointerEvents = 'none'
      document.getElementById('special-app')?.appendChild(labelRenderer_.domElement)

      // Create labels from model anchor positions
      if (model_.labelAnchors) {
        for (const [key, anchor] of Object.entries(model_.labelAnchors)) {
          const div = document.createElement('div')
          div.className = 'sp2-label'
          div.textContent = anchor.name
          div.dataset.featureKey = key
          const label = new CSS2DObject(div)
          label.position.copy(anchor.pos)
          scene_.add(label)
          labels_.push({ obj: label, div, key })
        }
      }

      // ── Post-processing ──
      const post = createComposer(renderer, scene_, camera_)
      composer_ = post.composer
      bloomPass_ = post.bloomPass
      cinematicPass_ = post.cinematicPass

      bloomPass_.strength = 0.2
      bloomPass_.threshold = 0.88
      bloomPass_.radius = 0.3

      // Warm Mediterranean color grading
      cinematicPass_.uniforms.liftR.value = 1.02
      cinematicPass_.uniforms.liftG.value = 1.0
      cinematicPass_.uniforms.liftB.value = 0.97
      cinematicPass_.uniforms.gainR.value = 1.01
      cinematicPass_.uniforms.gainG.value = 1.0
      cinematicPass_.uniforms.gainB.value = 0.98
      cinematicPass_.uniforms.vignetteIntensity.value = 0.25

      transProgress_ = 0
      transTarget_ = 0
    },

    setMode(mode) {
      // "79 AD" = reconstructed (0), "RUINS" = ruins (1)
      transTarget_ = (mode === 'ruins' || mode === 'interior') ? 1.0 : 0.0
    },

    flyTo(featureKey) {
      if (!model_?.labelAnchors?.[featureKey] || !camera_ || !controls_) return

      const target = model_.labelAnchors[featureKey].pos.clone()
      // Camera position: offset from target
      const offset = new THREE.Vector3(12, 8, 12)
      const camTarget = target.clone().add(offset)

      // Animate over 1.5 seconds
      const startPos = camera_.position.clone()
      const startTarget = controls_.target.clone()
      const duration = 1.5
      flyAnim_ = { startPos, camTarget, startTarget, lookTarget: target, elapsed: 0, duration }
    },

    animate() {
      if (!composer_) return {}
      const dt = clock_.getDelta()

      // ── Camera fly-to animation ──
      if (flyAnim_) {
        flyAnim_.elapsed += dt
        const t = Math.min(flyAnim_.elapsed / flyAnim_.duration, 1)
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

        camera_.position.lerpVectors(flyAnim_.startPos, flyAnim_.camTarget, e)
        controls_.target.lerpVectors(flyAnim_.startTarget, flyAnim_.lookTarget, e)

        if (t >= 1) flyAnim_ = null
      }

      // ── Smooth crossfade transition ──
      const speed = 1.5
      if (transProgress_ < transTarget_) {
        transProgress_ = Math.min(transProgress_ + dt * speed, transTarget_)
      } else if (transProgress_ > transTarget_) {
        transProgress_ = Math.max(transProgress_ - dt * speed, transTarget_)
      }

      const t = transProgress_

      if (model_) {
        // Simple visibility toggle (opacity crossfade breaks material rendering)
        model_.reconstructed.visible = t < 0.5
        model_.ruins.visible = t >= 0.5
      }

      // ── Label visibility ──
      for (const label of labels_) {
        const dist = camera_.position.distanceTo(label.obj.position)
        const distFade = 1.0 - Math.max(0, Math.min(1, (dist - 10) / 80))
        const opacity = distFade
        label.div.style.opacity = opacity.toFixed(2)
        label.div.style.display = opacity < 0.02 ? 'none' : ''
      }

      if (camMove_) camMove_.update(dt)
      cinematicPass_.uniforms.time.value = performance.now() * 0.001
      controls_.update()
      composer_.render()
      if (labelRenderer_) labelRenderer_.render(scene_, camera_)

      updateGauges(camera_, t)

      return { camera: camera_ }
    },

    getClickTargets() {
      return model_?.clickTargets ?? []
    },

    focusFeature(key) {
      if (!model_?.features?.[key]) return
      this.setMode('ruins')
      this.flyTo(key)
      this.showFeatureDetailByKey(key)
    },

    showFeatureDetailByKey(key) {
      if (!model_?.features?.[key]) return
      this.showFeatureDetail(model_.features[key])
    },

    showFeatureDetail(feature) {
      if (!feature) return
      const content = document.getElementById('sp2-detail-content')
      if (!content) return

      let rows = ''
      const fields = ['dimensions', 'material']
      fields.forEach(f => {
        if (feature[f]) {
          rows += `<div style="display:flex;justify-content:space-between;padding:6px 16px;border-bottom:1px solid rgba(180,120,60,0.08);">
            <span style="color:#6a4020;font-size:9px;letter-spacing:2px;text-transform:uppercase">${f}</span>
            <span style="color:#c07040;font-size:11px;letter-spacing:0.5px">${feature[f]}</span>
          </div>`
        }
      })
      if (feature.description) {
        rows += `<div style="padding:12px 16px;color:#906040;font-size:11px;line-height:1.6;letter-spacing:0.3px">${feature.description}</div>`
      }

      content.innerHTML = `
        <div style="padding:14px 16px 12px;border-bottom:1px solid rgba(180,120,60,0.3);margin-bottom:4px">
          <div style="color:#c07040;font-size:13px;letter-spacing:2px;margin-bottom:5px">${feature.name}</div>
          <div style="color:#6a4020;font-size:9px;letter-spacing:3px">${(feature.type || 'STRUCTURE').toUpperCase()}</div>
        </div>
        ${rows}`

      document.getElementById('sp2-detail')?.classList.remove('hidden')
    },

    resize() {
      if (!camera_ || !composer_) return
      camera_.aspect = window.innerWidth / window.innerHeight
      camera_.updateProjectionMatrix()
      composer_.setSize(window.innerWidth, window.innerHeight)
      if (labelRenderer_) labelRenderer_.setSize(window.innerWidth, window.innerHeight)
    },

    dispose() {
      camMove_?.dispose()
      controls_?.dispose()
      composer_?.dispose()
      if (labelRenderer_?.domElement?.parentNode) {
        labelRenderer_.domElement.parentNode.removeChild(labelRenderer_.domElement)
      }
      for (const label of labels_) {
        label.obj.removeFromParent()
      }
      labels_ = []
      reconMaterials_ = []
      ruinMaterials_ = []
      if (scene_) {
        scene_.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose()
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
            mats.forEach(m => {
              if (m && m.dispose) m.dispose()
            })
          }
        })
        if (scene_.background && scene_.background.dispose) scene_.background.dispose()
      }
      scene_ = camera_ = controls_ = composer_ = model_ = labelRenderer_ = null
      flyAnim_ = null
    },
  }
}

// ─── HUD helpers ─────────────────────────────────────────────────────────────

function updateGauges(camera, t) {
  const el = (id) => document.getElementById(id)

  const elev = el('sp2-gauge-elevation')
  if (elev) elev.textContent = `${Math.round(camera.position.y)} m`

  const dist = el('sp2-gauge-distance')
  if (dist) {
    const d = Math.round(camera.position.distanceTo(new THREE.Vector3(0, 1, -5)))
    dist.textContent = `${d} m`
  }

  const mode = el('sp2-gauge-mode')
  if (mode) mode.textContent = t > 0.5 ? 'RUINS' : '79 AD'
}
