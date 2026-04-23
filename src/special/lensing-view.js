import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { createCameraMovement } from '../camera-movement.js'
import { createLensingModel, LensingShader } from './lensing-model.js'

/**
 * Gravitational Lensing view.
 *
 * Renders a dense starfield + galaxy band, then applies a screen-space
 * lensing shader that bends light around the projected lens position.
 * The lensing pass runs BETWEEN the render pass and bloom, so the
 * distorted stars get the bloom glow naturally.
 */

export function createLensingView() {
  let scene_, camera_, controls_, renderer_
  let composer_, lensingPass_, bloomPass_
  let camMove_
  let clock_
  let model_ = null

  // Reusable vectors for screen projection
  const _v = new THREE.Vector3()

  return {
    init(renderer) {
      renderer_ = renderer
      clock_ = new THREE.Clock()

      scene_ = new THREE.Scene()
      scene_.background = new THREE.Color(0x010204)

      camera_ = new THREE.PerspectiveCamera(
        55, window.innerWidth / window.innerHeight, 0.1, 500
      )
      camera_.position.set(0, 0, 30)

      controls_ = new OrbitControls(camera_, renderer.domElement)
      controls_.enableDamping = true
      controls_.dampingFactor = 0.05
      controls_.target.set(0, 0, 0)
      controls_.minDistance = 5
      controls_.maxDistance = 100

      camMove_ = createCameraMovement(camera_, controls_)

      // Subtle lighting for the lens sphere
      scene_.add(new THREE.AmbientLight(0x202030, 1.0))

      // ── Model ──
      // No opaque lens sphere in the scene — it would sit at origin and
      // render as a black disc, which the Schwarzschild displacement then
      // smears into a thick dark annulus around the Einstein radius.
      // The shader's own tiny central shadow marks the lens position.
      model_ = createLensingModel()
      scene_.add(model_.starfield)
      scene_.add(model_.galaxy)

      // ── Post-processing: render → lensing → bloom ──
      // Custom composer so lensing runs before bloom
      composer_ = new EffectComposer(renderer)
      composer_.addPass(new RenderPass(scene_, camera_))

      // Lensing distortion pass
      lensingPass_ = new ShaderPass(LensingShader)
      lensingPass_.uniforms.aspectRatio.value = window.innerWidth / window.innerHeight
      composer_.addPass(lensingPass_)

      // Bloom on distorted image (subtle — don't wash out galaxy colors)
      bloomPass_ = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.3, 0.5, 0.9   // strength, radius, threshold
      )
      composer_.addPass(bloomPass_)

      // Strength slider — 1.0x = true Schwarzschild deflection (Einstein ring
      // forms at r = θ_E). Higher values exaggerate for illustration.
      const slider = document.getElementById('sp2-lensing-strength')
      const label = document.getElementById('sp2-lensing-strength-label')
      if (slider) {
        const apply = () => {
          const val = slider.value / 100
          lensingPass_.uniforms.lensStrength.value = val
          if (label) label.textContent = val.toFixed(1) + 'x'
        }
        slider.addEventListener('input', apply)
        apply()
      }
    },

    animate() {
      if (!composer_) return {}
      const dt = clock_.getDelta()
      const elapsed = clock_.elapsedTime

      model_.update(elapsed)

      // Project lens position (origin) to screen space for the shader
      _v.set(0, 0, 0)
      _v.project(camera_)
      lensingPass_.uniforms.lensCenter.value.set(
        (_v.x + 1) * 0.5,
        (_v.y + 1) * 0.5
      )

      // Scale lensing radius by distance — closer = bigger lens on screen
      const dist = camera_.position.length()
      lensingPass_.uniforms.lensRadius.value = Math.min(0.4, 3.0 / dist)

      if (camMove_) camMove_.update(dt)
      controls_.update()
      composer_.render()

      return { camera: camera_ }
    },

    getClickTargets() {
      return []
    },

    resize() {
      if (!camera_ || !composer_) return
      camera_.aspect = window.innerWidth / window.innerHeight
      camera_.updateProjectionMatrix()
      composer_.setSize(window.innerWidth, window.innerHeight)
      lensingPass_.uniforms.aspectRatio.value = window.innerWidth / window.innerHeight
    },

    dispose() {
      camMove_?.dispose()
      controls_?.dispose()
      composer_?.dispose()
      if (scene_) {
        scene_.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose()
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
            mats.forEach(m => { if (m && m.dispose) m.dispose() })
          }
        })
      }
      scene_ = camera_ = controls_ = composer_ = model_ = null
    },
  }
}
