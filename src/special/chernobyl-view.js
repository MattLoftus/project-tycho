import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { createComposer } from '../post.js'
import { createCameraMovement } from '../camera-movement.js'
import { createChernobylModel } from './chernobyl-model.js'

/**
 * Chernobyl Reactor 4 view.
 * "APRIL 25" / "APRIL 26" mode toggle, CSS2D labels, camera fly-to, click-to-inspect.
 */

export function createChernobylView() {
  let scene_, camera_, controls_, renderer_
  let composer_, bloomPass_, cinematicPass_
  let labelRenderer_
  let camMove_
  let clock_
  let model_ = null
  let labels_ = []

  // Transition state: 0 = intact (April 25), 1 = destroyed (April 26)
  let transProgress_ = 0
  let transTarget_ = 0

  // Camera fly-to animation state
  let flyAnim_ = null

  // Theme color
  const THEME = 0xc04020

  return {
    init(renderer) {
      renderer_ = renderer
      clock_ = new THREE.Clock()

      scene_ = new THREE.Scene()
      scene_.fog = new THREE.FogExp2(0x555560, 0.0008)

      // ── Overcast sky dome ──
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
            vec3 groundCol = vec3(0.30, 0.32, 0.28);
            vec3 hazeCol = vec3(0.45, 0.46, 0.48);
            vec3 midCol = vec3(0.52, 0.53, 0.55);
            vec3 overcastCol = vec3(0.58, 0.58, 0.60);

            vec3 col;
            if (h < 0.0) {
              col = groundCol;
            } else if (h < 0.05) {
              col = mix(hazeCol, midCol, h / 0.05);
            } else if (h < 0.3) {
              col = mix(midCol, overcastCol, (h - 0.05) / 0.25);
            } else {
              col = overcastCol;
            }

            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
      scene_.add(new THREE.Mesh(skyGeo, skyMat))

      camera_ = new THREE.PerspectiveCamera(
        50, window.innerWidth / window.innerHeight, 0.5, 2000
      )
      // Start from southeast — close enough to see the building
      camera_.position.set(130, 65, 100)

      controls_ = new OrbitControls(camera_, renderer.domElement)
      controls_.enableDamping = true
      controls_.dampingFactor = 0.05
      controls_.target.set(0, 20, 0)
      controls_.minDistance = 15
      controls_.maxDistance = 600
      controls_.maxPolarAngle = Math.PI / 2.05

      camMove_ = createCameraMovement(camera_, controls_)

      // ── Lighting — cool, flat, overcast ──
      scene_.add(new THREE.AmbientLight(0x909098, 3.0))

      const sun = new THREE.DirectionalLight(0xd0c8b0, 2.5)
      sun.position.set(80, 150, -60)
      scene_.add(sun)

      const fill = new THREE.DirectionalLight(0x8090a0, 1.2)
      fill.position.set(-80, 40, 80)
      scene_.add(fill)

      const back = new THREE.DirectionalLight(0x707880, 0.8)
      back.position.set(0, 60, -100)
      scene_.add(back)

      // ── Ground — concrete/asphalt ──
      const groundGeo = new THREE.PlaneGeometry(1500, 1500, 128, 128)
      groundGeo.rotateX(-Math.PI / 2)
      const gPos = groundGeo.attributes.position
      for (let i = 0; i < gPos.count; i++) {
        const x = gPos.getX(i), z = gPos.getZ(i)
        const dist = Math.sqrt(x * x + z * z)
        const mask = Math.min(1, Math.max(0, (dist - 150) / 300))
        const h = mask * (
          Math.sin(x * 0.005 + z * 0.004) * 1.5 +
          Math.sin(x * 0.015 - z * 0.012) * 0.5
        )
        gPos.setY(i, h)
      }
      groundGeo.computeVertexNormals()

      const groundMat = new THREE.ShaderMaterial({
        uniforms: {},
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
            for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
            return v;
          }

          void main() {
            vec2 wp = vWorldPos.xz;
            float grain = fbm(wp * 0.5);
            float patchVal = fbm(wp * 0.08);

            // Gray concrete/asphalt near buildings, grassy further out
            float dist = length(wp);
            float grassMix = smoothstep(100.0, 250.0, dist);

            vec3 concreteCol = vec3(0.42, 0.42, 0.40);
            vec3 concreteLight = vec3(0.50, 0.49, 0.47);
            vec3 grassCol = vec3(0.32, 0.38, 0.28);
            vec3 grassDark = vec3(0.25, 0.30, 0.22);

            vec3 nearCol = mix(concreteCol, concreteLight, grain * 0.5 + patchVal * 0.3);
            vec3 farCol = mix(grassCol, grassDark, grain * 0.4);
            vec3 col = mix(nearCol, farCol, grassMix);

            // Simple diffuse
            vec3 lightDir = normalize(vec3(0.3, 0.7, -0.2));
            float ndotl = max(dot(vNormal, lightDir), 0.0);
            col *= 0.45 + ndotl * 0.55;

            // Distance haze
            float haze = smoothstep(300.0, 800.0, dist);
            col = mix(col, vec3(0.45, 0.46, 0.48), haze);

            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
      const ground = new THREE.Mesh(groundGeo, groundMat)
      ground.position.y = -0.1
      scene_.add(ground)

      // ── Pine trees in distance ──
      _buildTrees(scene_)

      // ── Chernobyl model ──
      model_ = createChernobylModel()
      scene_.add(model_.intact)
      scene_.add(model_.destroyed)

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

      // Subtle bloom for intact, stronger for destroyed (set dynamically)
      bloomPass_.strength = 0.2
      bloomPass_.threshold = 0.7
      bloomPass_.radius = 0.5

      // Cool, desaturated color grading
      cinematicPass_.uniforms.liftR.value = 0.97
      cinematicPass_.uniforms.liftG.value = 0.98
      cinematicPass_.uniforms.liftB.value = 1.03
      cinematicPass_.uniforms.gainR.value = 1.0
      cinematicPass_.uniforms.gainG.value = 1.0
      cinematicPass_.uniforms.gainB.value = 1.0
      cinematicPass_.uniforms.vignetteIntensity.value = 0.4

      transProgress_ = 0
      transTarget_ = 0
    },

    setMode(mode) {
      // "APRIL 25" = intact, "APRIL 26" = destroyed
      transTarget_ = (mode === 'destroyed' || mode === 'APRIL 26' || mode === 'interior') ? 1.0 : 0.0
    },

    flyTo(featureKey) {
      if (!model_?.labelAnchors?.[featureKey] || !camera_ || !controls_) return

      const target = model_.labelAnchors[featureKey].pos.clone()
      const offset = new THREE.Vector3(30, 20, 30)
      const camTarget = target.clone().add(offset)

      const startPos = camera_.position.clone()
      const startTarget = controls_.target.clone()
      const duration = 1.5
      flyAnim_ = { startPos, camTarget, startTarget, lookTarget: target, elapsed: 0, duration }
    },

    focusFeature(key) {
      this.flyTo(key)
      this.showFeatureDetailByKey(key)
    },

    showFeatureDetail(feature) {
      if (!feature) return
      const content = document.getElementById('sp2-detail-content')
      if (!content) return

      let rows = ''
      const fields = ['dimensions', 'material']
      fields.forEach(f => {
        if (feature[f]) {
          rows += `<div style="display:flex;justify-content:space-between;padding:6px 16px;border-bottom:1px solid rgba(192,64,32,0.08);">
            <span style="color:#804030;font-size:9px;letter-spacing:2px;text-transform:uppercase">${f}</span>
            <span style="color:#c04020;font-size:11px;letter-spacing:0.5px">${feature[f]}</span>
          </div>`
        }
      })
      if (feature.description) {
        rows += `<div style="padding:12px 16px;color:#a06050;font-size:11px;line-height:1.6;letter-spacing:0.3px">${feature.description}</div>`
      }

      content.innerHTML = `
        <div style="padding:14px 16px 12px;border-bottom:1px solid rgba(192,64,32,0.3);margin-bottom:4px">
          <div style="color:#c04020;font-size:13px;letter-spacing:2px;margin-bottom:5px">${feature.name}</div>
          <div style="color:#804030;font-size:9px;letter-spacing:3px">${(feature.type || 'STRUCTURE').toUpperCase()}</div>
        </div>
        ${rows}`

      document.getElementById('sp2-detail')?.classList.remove('hidden')
    },

    showFeatureDetailByKey(key) {
      if (!model_?.features?.[key]) return
      this.showFeatureDetail(model_.features[key])
    },

    getClickTargets() {
      return model_?.clickTargets ?? []
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

      // ── Smooth transition between intact and destroyed ──
      const speed = 1.5
      if (transProgress_ < transTarget_) {
        transProgress_ = Math.min(transProgress_ + dt * speed, transTarget_)
      } else if (transProgress_ > transTarget_) {
        transProgress_ = Math.max(transProgress_ - dt * speed, transTarget_)
      }

      const t = transProgress_

      if (model_) {
        // Simple visibility toggle (no opacity crossfade — it breaks material rendering)
        model_.intact.visible = t < 0.5
        model_.destroyed.visible = t >= 0.5

        // Pulsing reactor glow in destroyed mode
        if (t > 0.3) {
          const glowT = (t - 0.3) / 0.7
          const time = performance.now() * 0.001
          const pulse = 0.7 + Math.sin(time * 1.5) * 0.3
          model_.destroyed.traverse(child => {
            if (child.userData?.isGlow && child.material) {
              child.material.emissiveIntensity = pulse * glowT * 1.5
            }
          })
        }

        // Bloom strength — stronger in destroyed mode for fire glow
        bloomPass_.strength = 0.2 + t * 0.6
        bloomPass_.threshold = 0.7 - t * 0.2
        bloomPass_.radius = 0.5 + t * 0.3

        // Cinematic parameters — shift warmer and more dramatic in destroyed mode
        cinematicPass_.uniforms.liftR.value = 0.97 + t * 0.06   // 0.97 → 1.03 (warmer shadows)
        cinematicPass_.uniforms.liftG.value = 0.98 - t * 0.02   // 0.98 → 0.96
        cinematicPass_.uniforms.liftB.value = 1.03 - t * 0.08   // 1.03 → 0.95 (less blue)
        cinematicPass_.uniforms.gainR.value = 1.0 + t * 0.05    // 1.0 → 1.05 (warmer highlights)
        cinematicPass_.uniforms.gainG.value = 1.0 - t * 0.02    // 1.0 → 0.98
        cinematicPass_.uniforms.gainB.value = 1.0 - t * 0.04    // 1.0 → 0.96
        cinematicPass_.uniforms.vignetteIntensity.value = 0.4 + t * 0.25  // 0.4 → 0.65

        // Animate smoke (drift upward)
        model_.destroyed.traverse(child => {
          if (child.userData?.smokeY !== undefined) {
            const time = performance.now() * 0.001
            child.position.y = child.userData.smokeY + Math.sin(time * child.userData.smokeSpeed + child.id) * 3
          }
        })
      }

      // ── Label visibility ──
      for (const label of labels_) {
        const dist = camera_.position.distanceTo(label.obj.position)
        const distFade = 1.0 - Math.max(0, Math.min(1, (dist - 30) / 250))
        const opacity = distFade
        label.div.style.opacity = opacity.toFixed(2)
        label.div.style.display = opacity < 0.02 ? 'none' : ''
      }

      if (camMove_) camMove_.update(dt)
      cinematicPass_.uniforms.time.value = performance.now() * 0.001
      controls_.update()
      composer_.render()
      if (labelRenderer_) labelRenderer_.render(scene_, camera_)

      _updateGauges(camera_, t)

      return { camera: camera_ }
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

function seededRandom(seed) {
  let s = seed
  return function () {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

// ─── Pine trees (simple cone + cylinder) ────────────────────────────────────

function _buildTrees(scene) {
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x6a5030, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide,
    emissive: 0x5a4020, emissiveIntensity: 0.3,
  })
  const foliageMat = new THREE.MeshStandardMaterial({
    color: 0x3a6a38, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide,
    emissive: 0x305828, emissiveIntensity: 0.35,
  })

  // Dense forest surrounding the exclusion zone
  const treePositions = []
  const rand = seededRandom(777)
  for (let i = 0; i < 120; i++) {
    const angle = rand() * Math.PI * 2
    const dist = 100 + rand() * 350
    const x = Math.cos(angle) * dist
    const z = Math.sin(angle) * dist
    // Keep trees away from the building complex (+X side has turbine hall)
    if (Math.abs(x) < 60 && Math.abs(z) < 50) continue
    if (x > 50 && x < 130 && Math.abs(z) < 80) continue // turbine hall zone
    treePositions.push([x, 0, z])
  }

  for (const [x, y, z] of treePositions) {
    const tree = new THREE.Group()

    // Trunk
    const trunkH = 6 + Math.random() * 4
    const trunkGeo = new THREE.CylinderGeometry(0.4, 0.6, trunkH, 6)
    const trunk = new THREE.Mesh(trunkGeo, trunkMat)
    trunk.position.y = trunkH / 2
    tree.add(trunk)

    // Foliage — 2-3 stacked cones
    const layers = 2 + Math.floor(Math.random() * 2)
    for (let i = 0; i < layers; i++) {
      const coneH = 5 + Math.random() * 3
      const coneR = 3.5 - i * 0.8
      const coneGeo = new THREE.ConeGeometry(coneR, coneH, 6)
      const cone = new THREE.Mesh(coneGeo, foliageMat)
      cone.position.y = trunkH + i * (coneH * 0.5) + coneH / 2 - 1
      tree.add(cone)
    }

    tree.position.set(x, y, z)
    // Slight random scale variation
    const s = 0.8 + Math.random() * 0.6
    tree.scale.set(s, s, s)
    scene.add(tree)
  }
}

// ─── HUD helpers ────────────────────────────────────────────────────────────

function _updateGauges(camera, t) {
  const el = (id) => document.getElementById(id)
  const p = camera.position

  const elev = el('sp2-gauge-elevation')
  if (elev) elev.textContent = `${Math.round(p.y)} m`

  const dist = el('sp2-gauge-distance')
  if (dist) {
    const d = Math.round(p.distanceTo(new THREE.Vector3(0, 20, 0)))
    dist.textContent = `${d} m`
  }

  const mode = el('sp2-gauge-mode')
  if (mode) mode.textContent = t > 0.5 ? 'APRIL 26' : 'APRIL 25'
}
