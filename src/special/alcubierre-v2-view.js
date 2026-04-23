import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { createComposer } from '../post.js'
import { createCameraMovement } from '../camera-movement.js'
import { createAlcubierreV2Model } from './alcubierre-v2-model.js'

/**
 * Alcubierre Warp Drive V2 — the spacetime conduit.
 *
 * Same ship as V1, but instead of a flat grid, a tube of revolution
 * threads through the ship: space-grid rings stream IN through the
 * front ring, compress through the hull, and flare OUT through the back.
 */

export function createAlcubierreV2View() {
  let scene_, camera_, controls_, renderer_
  let composer_, bloomPass_, cinematicPass_
  let labelRenderer_
  let camMove_
  let clock_
  let model_ = null
  let speedMultiplier_ = 1.0
  let simTime_ = 0
  let hudWired_ = false

  return {
    init(renderer) {
      renderer_ = renderer
      clock_ = new THREE.Clock()

      scene_ = new THREE.Scene()
      scene_.background = new THREE.Color(0x010206)

      camera_ = new THREE.PerspectiveCamera(
        48, window.innerWidth / window.innerHeight, 0.1, 500
      )
      // Three-quarter angle, slightly from "front" side so both the intake
      // funnel and the rear flare are in frame.
      camera_.position.set(11, 4.2, 10)

      controls_ = new OrbitControls(camera_, renderer.domElement)
      controls_.enableDamping = true
      controls_.dampingFactor = 0.05
      controls_.target.set(0, 0, 0)
      controls_.minDistance = 6
      controls_.maxDistance = 120

      camMove_ = createCameraMovement(camera_, controls_)

      // ── Lighting ──
      scene_.add(new THREE.AmbientLight(0x203040, 1.4))

      const key = new THREE.DirectionalLight(0x6080c0, 2.4)
      key.position.set(12, 18, 14)
      scene_.add(key)

      const rim = new THREE.DirectionalLight(0xff9040, 0.9)
      rim.position.set(-20, -4, -10)   // lights the rear "explosion" side
      scene_.add(rim)

      // ── Model ──
      model_ = createAlcubierreV2Model()
      scene_.add(model_.ribbon)       // behind the ship (additive anyway)
      scene_.add(model_.ship)
      scene_.add(model_.flow)
      scene_.add(model_.starfield)

      // Point-light inside the ship, rich cyan
      const shipLight = new THREE.PointLight(0x50a0ff, 45, 14)
      shipLight.position.set(0, 0, 0)
      scene_.add(shipLight)

      // Warm back-light so the exhaust direction reads as energetic
      const rearLight = new THREE.PointLight(0xffa060, 25, 18)
      rearLight.position.set(-4, 0, 0)
      scene_.add(rearLight)

      // HUD bindings — wired once (the HTML controls outlive each init/dispose
      // cycle, so re-registering listeners on every entry would stack them and
      // cause toggles to fire twice, net-cancelling). Handlers close over the
      // module-level `model_` so they always target the current instance.
      const slider       = document.getElementById('sp2-alcubierre-v2-speed')
      const label        = document.getElementById('sp2-alcubierre-v2-speed-label')
      const particlesBtn = document.getElementById('sp2-alcubierre-v2-particles')

      if (!hudWired_) {
        if (slider) {
          slider.addEventListener('input', () => {
            speedMultiplier_ = slider.value / 100
            if (label) label.textContent = speedMultiplier_.toFixed(1) + 'x'
          })
        }
        if (particlesBtn) {
          particlesBtn.addEventListener('click', () => {
            const on = !particlesBtn.classList.contains('active')
            particlesBtn.classList.toggle('active', on)
            particlesBtn.setAttribute('aria-pressed', on ? 'true' : 'false')
            if (model_) model_.flow.visible = on
          })
        }
        hudWired_ = true
      }

      // Sync the freshly-built model to the persistent HUD state.
      if (slider)       speedMultiplier_ = slider.value / 100
      if (particlesBtn) model_.flow.visible = particlesBtn.classList.contains('active')

      // ── CSS2D label renderer ──
      labelRenderer_ = new CSS2DRenderer()
      labelRenderer_.setSize(window.innerWidth, window.innerHeight)
      labelRenderer_.domElement.style.position      = 'absolute'
      labelRenderer_.domElement.style.top           = '0'
      labelRenderer_.domElement.style.left          = '0'
      labelRenderer_.domElement.style.pointerEvents = 'none'
      const appContainer = document.getElementById('spacetime-app') || document.getElementById('special-app')
      appContainer?.appendChild(labelRenderer_.domElement)

      // ── Post ──
      const post = createComposer(renderer, scene_, camera_)
      composer_      = post.composer
      bloomPass_     = post.bloomPass
      cinematicPass_ = post.cinematicPass

      // Moderate bloom: enough to give the grid a glow, not so much it nukes
      // the ship silhouette.
      bloomPass_.strength  = 0.55
      bloomPass_.threshold = 0.32
      bloomPass_.radius    = 0.75

      // Same warm/cool split as V1 but a touch more saturation
      cinematicPass_.uniforms.liftR.value = 0.96
      cinematicPass_.uniforms.liftG.value = 0.94
      cinematicPass_.uniforms.liftB.value = 1.06
      cinematicPass_.uniforms.gainR.value = 1.04
      cinematicPass_.uniforms.gainG.value = 0.97
      cinematicPass_.uniforms.gainB.value = 0.96
      cinematicPass_.uniforms.vignetteIntensity.value = 0.4
      cinematicPass_.uniforms.grainIntensity.value    = 0.03
    },

    animate() {
      if (!composer_) return {}
      const dt = clock_.getDelta()
      simTime_ += dt * speedMultiplier_

      model_.update(simTime_)

      if (camMove_) camMove_.update(dt)
      cinematicPass_.uniforms.time.value = performance.now() * 0.001
      controls_.update()
      composer_.render()
      if (labelRenderer_) labelRenderer_.render(scene_, camera_)

      return { camera: camera_ }
    },

    getClickTargets() { return [] },

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
      if (scene_) {
        scene_.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose()
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
            mats.forEach(m => { if (m && m.dispose) m.dispose() })
          }
        })
      }
      scene_ = camera_ = controls_ = composer_ = model_ = labelRenderer_ = null
    },
  }
}
