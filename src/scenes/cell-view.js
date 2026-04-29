import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { createComposer } from '../post.js'
import { createCameraMovement } from '../camera-movement.js'
import { createCellModel } from './cell-model.js'

/**
 * Human eukaryotic animal cell view.
 * Overview/interior toggle, CSS2D labels, camera fly-to, click-to-inspect.
 */

export function createCellView() {
  let scene_, camera_, controls_, renderer_
  let composer_, bloomPass_, cinematicPass_
  let labelRenderer_
  let camMove_
  let clock_
  let model_ = null
  let labels_ = []

  // Transition state
  let transProgress_ = 0
  let transTarget_ = 0

  // Camera fly-to animation state
  let flyAnim_ = null
  let rotationSpeed_ = 0.001 // default
  let savedRotationSpeed_ = 0.001
  let focusedKey_ = null

  return {
    init(renderer) {
      renderer_ = renderer
      clock_ = new THREE.Clock()

      scene_ = new THREE.Scene()
      scene_.background = new THREE.Color(0x061218)
      scene_.fog = new THREE.FogExp2(0x061218, 0.001)

      camera_ = new THREE.PerspectiveCamera(
        50, window.innerWidth / window.innerHeight, 0.5, 500
      )
      camera_.position.set(80, 50, 80)

      controls_ = new OrbitControls(camera_, renderer.domElement)
      controls_.enableDamping = true
      controls_.dampingFactor = 0.05
      controls_.target.set(0, 0, 0)
      controls_.minDistance = 10
      controls_.maxDistance = 200

      camMove_ = createCameraMovement(camera_, controls_)

      // ── Lighting — biological illumination ──
      scene_.add(new THREE.AmbientLight(0x708080, 4.0))

      // Multiple colored point lights inside the cell
      const lightConfigs = [
        { color: 0x40a0c0, intensity: 250, pos: [0, 20, 0] },      // top cyan
        { color: 0x30c080, intensity: 200, pos: [25, -10, 20] },    // green accent
        { color: 0xc06040, intensity: 160, pos: [-20, 5, -25] },    // warm red near mito
        { color: 0x8060c0, intensity: 130, pos: [15, -15, -20] },   // purple accent
        { color: 0x60a060, intensity: 130, pos: [-30, -5, 15] },    // soft green
        { color: 0xc0a040, intensity: 200, pos: [20, 10, 15] },     // golden near Golgi
      ]
      for (const lc of lightConfigs) {
        const light = new THREE.PointLight(lc.color, lc.intensity, 250)
        light.position.set(...lc.pos)
        scene_.add(light)
      }

      // Directional for overall shape
      const dir = new THREE.DirectionalLight(0x6090b0, 3.0)
      dir.position.set(50, 60, 40)
      scene_.add(dir)

      // Fill from below
      const fill = new THREE.DirectionalLight(0x507070, 1.8)
      fill.position.set(-30, -40, -20)
      scene_.add(fill)

      // ── Cell model ──
      model_ = createCellModel()
      scene_.add(model_.group)

      // ── CSS2D label renderer ──
      labelRenderer_ = new CSS2DRenderer()
      labelRenderer_.setSize(window.innerWidth, window.innerHeight)
      labelRenderer_.domElement.style.position = 'absolute'
      labelRenderer_.domElement.style.top = '0'
      labelRenderer_.domElement.style.left = '0'
      labelRenderer_.domElement.style.pointerEvents = 'none'
      document.getElementById('special-app')?.appendChild(labelRenderer_.domElement)

      // Create labels from model anchor positions — clickable
      if (model_.labelAnchors) {
        for (const [key, anchor] of Object.entries(model_.labelAnchors)) {
          const div = document.createElement('div')
          div.className = 'sp2-label'
          div.textContent = anchor.name
          div.dataset.featureKey = key
          if (key !== 'cellMembrane') {
            div.style.cursor = 'pointer'
            div.style.pointerEvents = 'auto'
            div.addEventListener('click', () => {
              this.focusFeature(key)
            })
          }
          const label = new CSS2DObject(div)
          label.position.copy(anchor.pos)
          model_.group.add(label)
          labels_.push({ obj: label, div, key })
        }
      }

      // Close detail panel → resume rotation
      const closeBtn = document.getElementById('sp2-close-detail')
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          document.getElementById('sp2-detail')?.classList.add('hidden')
          rotationSpeed_ = savedRotationSpeed_
          focusedKey_ = null
          // Update slider to match
          const slider = document.getElementById('sp2-rotation-speed')
          if (slider) slider.value = Math.round((rotationSpeed_ / 0.001) * 50)
        })
      }

      // ── Post-processing ──
      const post = createComposer(renderer, scene_, camera_)
      composer_ = post.composer
      bloomPass_ = post.bloomPass
      cinematicPass_ = post.cinematicPass

      bloomPass_.strength = 0.65
      bloomPass_.threshold = 0.5
      bloomPass_.radius = 0.5

      // Cool blue-green color grading for biological feel
      cinematicPass_.uniforms.liftR.value = 0.96
      cinematicPass_.uniforms.liftG.value = 1.02
      cinematicPass_.uniforms.liftB.value = 1.04
      cinematicPass_.uniforms.gainR.value = 0.98
      cinematicPass_.uniforms.gainG.value = 1.01
      cinematicPass_.uniforms.gainB.value = 1.02
      cinematicPass_.uniforms.vignetteIntensity.value = 0.2

      transProgress_ = 0
      transTarget_ = 0

      // Rotation speed slider
      const rotSlider = document.getElementById('sp2-rotation-speed')
      if (rotSlider) {
        rotSlider.addEventListener('input', (e) => {
          rotationSpeed_ = (e.target.value / 50) * 0.001 // 0 at left, 0.002 at right, 0.001 at center
        })
      }
    },

    setMode(mode) {
      transTarget_ = mode === 'interior' ? 1.0 : 0.0

      // Fly camera in/out to match mode
      if (camera_ && controls_) {
        const camDist = camera_.position.distanceTo(controls_.target)
        if (mode === 'interior' && camDist > 60) {
          // Zoom in toward center
          const dir = camera_.position.clone().sub(controls_.target).normalize()
          const camTarget = controls_.target.clone().add(dir.multiplyScalar(45))
          flyAnim_ = {
            startPos: camera_.position.clone(), camTarget,
            startTarget: controls_.target.clone(), lookTarget: controls_.target.clone(),
            elapsed: 0, duration: 1.5,
          }
        } else if (mode !== 'interior' && camDist < 80) {
          // Zoom out
          const dir = camera_.position.clone().sub(controls_.target).normalize()
          const camTarget = controls_.target.clone().add(dir.multiplyScalar(100))
          flyAnim_ = {
            startPos: camera_.position.clone(), camTarget,
            startTarget: controls_.target.clone(), lookTarget: new THREE.Vector3(0, 0, 0),
            elapsed: 0, duration: 1.5,
          }
        }
      }
    },

    flyTo(featureKey) {
      if (!model_?.labelAnchors?.[featureKey] || !camera_ || !controls_) return

      // Auto-switch to interior for organelles
      if (featureKey !== 'cellMembrane') {
        transTarget_ = 1.0
      }

      // Get world-space position (label is child of rotating group)
      const localPos = model_.labelAnchors[featureKey].pos.clone()
      const worldTarget = localPos.applyMatrix4(model_.group.matrixWorld)

      // Distance varies by feature size
      const closeDist = {
        mitochondria: 5, nucleolus: 6, lysosomes: 5, centrosome: 6, vesicles: 5,
      }
      const dist = closeDist[featureKey] || 12

      const dir = worldTarget.clone().normalize()
      const camTarget = worldTarget.clone().add(dir.multiplyScalar(dist)).add(new THREE.Vector3(0, 3, 0))

      // Temporarily allow very close zoom for small organelles
      if (dist < 10) controls_.minDistance = 2

      const startPos = camera_.position.clone()
      const startTarget = controls_.target.clone()
      const duration = 1.5
      flyAnim_ = { startPos, camTarget, startTarget, lookTarget: worldTarget, elapsed: 0, duration }
    },

    /** Click a label or organelle → fly to it, stop rotation, show info */
    focusFeature(key) {
      if (!model_?.features?.[key] || key === 'cellMembrane') return

      // Save rotation speed and stop
      if (rotationSpeed_ > 0) savedRotationSpeed_ = rotationSpeed_
      rotationSpeed_ = 0
      focusedKey_ = key

      // Update slider
      const slider = document.getElementById('sp2-rotation-speed')
      if (slider) slider.value = 0

      // Fly camera to the feature
      this.flyTo(key)

      // Show detail panel
      this.showFeatureDetail(model_.features[key])
    },

    animate() {
      if (!composer_) return {}
      const dt = clock_.getDelta()
      const elapsed = clock_.elapsedTime

      // ── Camera fly-to animation ──
      if (flyAnim_) {
        flyAnim_.elapsed += dt
        const t = Math.min(flyAnim_.elapsed / flyAnim_.duration, 1)
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

        camera_.position.lerpVectors(flyAnim_.startPos, flyAnim_.camTarget, e)
        controls_.target.lerpVectors(flyAnim_.startTarget, flyAnim_.lookTarget, e)

        if (t >= 1) flyAnim_ = null
      }

      // ── Auto-switch to exterior when zoomed out ──
      if (transTarget_ > 0 && !flyAnim_) {
        const camDist = camera_.position.distanceTo(controls_.target)
        if (camDist > 120) {
          transTarget_ = 0
          // Update mode toggle buttons
          document.querySelectorAll('#special-app .mode-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.mode === 'exterior'))
          // Clear focus state
          if (focusedKey_) {
            document.getElementById('sp2-detail')?.classList.add('hidden')
            if (savedRotationSpeed_ > 0) rotationSpeed_ = savedRotationSpeed_
            focusedKey_ = null
            const slider = document.getElementById('sp2-rotation-speed')
            if (slider) slider.value = Math.round((rotationSpeed_ / 0.001) * 50)
          }
        }
      }

      // ── Smooth transition ──
      const speed = 2.0
      if (transProgress_ < transTarget_) {
        transProgress_ = Math.min(transProgress_ + dt * speed, transTarget_)
      } else if (transProgress_ > transTarget_) {
        transProgress_ = Math.max(transProgress_ - dt * speed, transTarget_)
      }

      const t = transProgress_

      if (model_) {
        // Rotate entire cell
        model_.group.rotation.y += rotationSpeed_

        // Bob mitochondria gently
        if (model_.mitoGroup) {
          for (const child of model_.mitoGroup.children) {
            if (child.userData.bobOffset !== undefined) {
              const offset = child.userData.bobOffset
              child.position.y += Math.sin(elapsed * 0.5 + offset) * 0.005
              child.rotation.z += Math.sin(elapsed * 0.3 + offset) * 0.0003
            }
          }
        }

        // Bob vesicles
        if (model_.vesicles) {
          for (const child of model_.vesicles.children) {
            if (child.userData.bobOffset !== undefined) {
              child.position.y += Math.sin(elapsed * 0.7 + child.userData.bobOffset) * 0.003
            }
          }
        }

        // Membrane opacity based on mode
        const membraneMesh = model_.group.children[0]
        if (membraneMesh?.material) {
          membraneMesh.material.opacity = 0.15 - t * 0.10
        }

        // Camera constraints shift in interior mode
        controls_.minDistance = 10 + t * (-5)
        controls_.maxDistance = 200 - t * 130
      }

      // ── Label visibility — fade with distance, use world position ──
      const worldPos = new THREE.Vector3()
      for (const label of labels_) {
        label.obj.getWorldPosition(worldPos)
        const dist = camera_.position.distanceTo(worldPos)
        const distFade = 1.0 - Math.max(0, Math.min(1, (dist - 15) / 120))
        // Focused label stays bright
        const isFocused = focusedKey_ === label.key
        const opacity = isFocused ? 1.0 : Math.max(0.15, distFade)
        label.div.style.opacity = opacity.toFixed(2)
        label.div.style.display = opacity < 0.05 ? 'none' : ''
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

    showFeatureDetailByKey(key) {
      if (!model_?.features?.[key]) return
      this.showFeatureDetail(model_.features[key])
    },

    showFeatureDetail(feature) {
      if (!feature) return
      const content = document.getElementById('sp2-detail-content')
      if (!content) return

      let rows = ''
      const fields = ['dimensions']
      fields.forEach(f => {
        if (feature[f]) {
          rows += `<div style="display:flex;justify-content:space-between;padding:6px 16px;border-bottom:1px solid rgba(80,200,160,0.08);">
            <span style="color:#306050;font-size:9px;letter-spacing:2px;text-transform:uppercase">${f}</span>
            <span style="color:#50c8a0;font-size:11px;letter-spacing:0.5px">${feature[f]}</span>
          </div>`
        }
      })
      if (feature.description) {
        rows += `<div style="padding:12px 16px;color:#80b0a0;font-size:11px;line-height:1.6;letter-spacing:0.3px">${feature.description}</div>`
      }

      content.innerHTML = `
        <div style="padding:14px 16px 12px;border-bottom:1px solid rgba(80,200,160,0.3);margin-bottom:4px">
          <div style="color:#50c8a0;font-size:13px;letter-spacing:2px;margin-bottom:5px">${feature.name}</div>
          <div style="color:#306050;font-size:9px;letter-spacing:3px">${(feature.type || 'STRUCTURE').toUpperCase()}</div>
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
      // Remove label renderer DOM
      if (labelRenderer_?.domElement?.parentNode) {
        labelRenderer_.domElement.parentNode.removeChild(labelRenderer_.domElement)
      }
      // Remove label CSS2D objects
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

// ─── HUD helpers ─────────────────────────────────────────────────────────────

function updateGauges(camera, t) {
  const el = (id) => document.getElementById(id)
  const p = camera.position

  const elev = el('sp2-gauge-elevation')
  if (elev) elev.textContent = `${Math.round(p.distanceTo(new THREE.Vector3(0, 0, 0)))} μm`

  const dist = el('sp2-gauge-distance')
  if (dist) {
    const d = Math.round(p.distanceTo(new THREE.Vector3(0, 0, 0)))
    dist.textContent = `${d} μm`
  }

  const mode = el('sp2-gauge-mode')
  if (mode) mode.textContent = t > 0.5 ? 'INTERIOR' : 'OVERVIEW'
}
