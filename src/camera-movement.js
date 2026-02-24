import * as THREE from 'three';

/**
 * Keyboard-driven camera translation (WASD / arrows / Q-E).
 * Works alongside OrbitControls — translates both camera and orbit target
 * so panning feels natural at any zoom level.
 *
 * Usage:
 *   const mover = createCameraMovement(camera, controls);
 *   // in animate():  mover.update(dt)
 *   // in dispose():  mover.dispose()
 */
export function createCameraMovement(camera, controls) {
  const keys = new Set();

  const onKeyDown = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
    keys.add(e.key.toLowerCase());
  };
  const onKeyUp = (e) => keys.delete(e.key.toLowerCase());

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  const fwd   = new THREE.Vector3();
  const right = new THREE.Vector3();
  const move  = new THREE.Vector3();

  function update(dt) {
    if (keys.size === 0) return;

    const dist  = camera.position.distanceTo(controls.target);
    const mult  = keys.has('shift') ? 3.5 : 1.0;
    const speed = Math.max(dist * 0.85, 8) * dt * mult;

    camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 0.0001) fwd.set(0, 0, -1);
    fwd.normalize();

    right.crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();

    move.set(0, 0, 0);
    if (keys.has('w') || keys.has('arrowup'))    move.addScaledVector(fwd,    speed);
    if (keys.has('s') || keys.has('arrowdown'))  move.addScaledVector(fwd,   -speed);
    if (keys.has('a') || keys.has('arrowleft'))  move.addScaledVector(right, -speed);
    if (keys.has('d') || keys.has('arrowright')) move.addScaledVector(right,  speed);
    if (keys.has('q'))                           move.y -= speed * 0.6;
    if (keys.has('e'))                           move.y += speed * 0.6;

    if (move.lengthSq() > 0) {
      camera.position.add(move);
      controls.target.add(move);
    }
  }

  function dispose() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    keys.clear();
  }

  return { update, dispose };
}
