import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Cinematic post-processing: vignette + color grading + film grain
const CinematicShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignetteIntensity: { value: 0.4 },
    grainIntensity: { value: 0.06 },
    // Color grading — cool shadows, warm highlights (Ridley Scott look)
    liftR: { value: 0.92 },
    liftG: { value: 0.95 },
    liftB: { value: 1.08 },
    gainR: { value: 1.05 },
    gainG: { value: 1.0 },
    gainB: { value: 0.92 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float vignetteIntensity;
    uniform float grainIntensity;
    uniform float liftR, liftG, liftB;
    uniform float gainR, gainG, gainB;
    varying vec2 vUv;

    // Film grain noise
    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // Color grading — lift/gain
      color.r = color.r * gainR + (1.0 - color.r) * (liftR - 1.0) * 0.5;
      color.g = color.g * gainG + (1.0 - color.g) * (liftG - 1.0) * 0.5;
      color.b = color.b * gainB + (1.0 - color.b) * (liftB - 1.0) * 0.5;

      // Slight contrast boost
      color.rgb = (color.rgb - 0.5) * 1.15 + 0.5;

      // Vignette
      vec2 center = vUv - 0.5;
      float dist = length(center);
      float vignette = 1.0 - smoothstep(0.3, 0.85, dist) * vignetteIntensity;
      color.rgb *= vignette;

      // Film grain
      float grain = rand(vUv + fract(time)) * grainIntensity;
      color.rgb += grain - grainIntensity * 0.5;

      gl_FragColor = color;
    }
  `,
};

export function createComposer(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  // Bloom — bright objects glow
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.8,   // strength
    0.4,   // radius
    0.85,  // threshold
  );
  composer.addPass(bloomPass);

  // Cinematic pass
  const cinematicPass = new ShaderPass(CinematicShader);
  composer.addPass(cinematicPass);

  return { composer, bloomPass, cinematicPass };
}
