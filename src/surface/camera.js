import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export class CameraController {
  constructor(camera, domElement) {
    this.camera = camera

    const c = new OrbitControls(camera, domElement)
    c.enableDamping     = true
    c.dampingFactor     = 0.045
    c.screenSpacePanning = false
    c.minDistance       = 12
    c.maxDistance       = 480
    c.maxPolarAngle     = Math.PI / 2.05
    c.minPolarAngle     = 0.08
    this.controls = c

    this.keys      = new Set()
    this._focusAnim = null

    this._kd = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return
      this.keys.add(e.key.toLowerCase())
    }
    this._ku = (e) => this.keys.delete(e.key.toLowerCase())
    window.addEventListener('keydown', this._kd)
    window.addEventListener('keyup',   this._ku)

    camera.position.set(0, 90, 110)
    camera.lookAt(0, 0, 0)
    c.target.set(0, 0, 0)
  }

  update(dt) {
    this._applyMovement(dt)
    this._stepFocusAnim(dt)
    this.controls.update()
  }

  // Smoothly pan the orbit target to a world position
  focusOn(worldPos, duration = 1.2) {
    this._focusAnim = {
      start:    this.controls.target.clone(),
      end:      worldPos.clone(),
      elapsed:  0,
      duration,
    }
  }

  _applyMovement(dt) {
    const { camera, controls, keys } = this
    if (keys.size === 0) return

    const dist  = camera.position.distanceTo(controls.target)
    const mult  = keys.has('shift') ? 3.5 : 1.0
    const speed = Math.max(dist * 0.85, 8) * dt * mult

    const fwd = new THREE.Vector3()
    camera.getWorldDirection(fwd)
    fwd.y = 0
    if (fwd.lengthSq() < 0.0001) fwd.set(0, 0, -1)
    fwd.normalize()

    const right = new THREE.Vector3()
    right.crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize()

    const move = new THREE.Vector3()
    if (keys.has('w') || keys.has('arrowup'))    move.addScaledVector(fwd,    speed)
    if (keys.has('s') || keys.has('arrowdown'))  move.addScaledVector(fwd,   -speed)
    if (keys.has('a') || keys.has('arrowleft'))  move.addScaledVector(right, -speed)
    if (keys.has('d') || keys.has('arrowright')) move.addScaledVector(right,  speed)
    if (keys.has('q'))                           move.y -= speed * 0.6
    if (keys.has('e'))                           move.y += speed * 0.6

    if (move.lengthSq() > 0) {
      camera.position.add(move)
      controls.target.add(move)
    }
  }

  _stepFocusAnim(dt) {
    const a = this._focusAnim
    if (!a) return
    a.elapsed += dt
    const t    = Math.min(a.elapsed / a.duration, 1.0)
    const ease = t * t * (3 - 2 * t)   // smoothstep
    this.controls.target.lerpVectors(a.start, a.end, ease)
    if (t >= 1.0) this._focusAnim = null
  }

  dispose() {
    this.controls.dispose()
    window.removeEventListener('keydown', this._kd)
    window.removeEventListener('keyup',   this._ku)
    this.keys.clear()
  }
}
