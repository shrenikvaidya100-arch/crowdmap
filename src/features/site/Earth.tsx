'use client';
// The rotating Earth behind the home page hero (Three.js).
// Night-lights texture (NASA, public domain): the bright parts are where people are.
// Rotates slowly all the time and spins with the scroll wheel or trackpad (and a
// swipe on phones): down spins it forward, up spins it back, then it eases back
// to the slow spin. The home page doesn't scroll, so this reads wheel and touch
// moves directly rather than the page's scroll position. Pauses off screen and in hidden tabs, and
// keeps a much gentler spin for people who prefer reduced motion.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const BASE_SPEED = 0.05; // radians per second
const MAX_BOOST = 3; // extra radians per second at most while scrolling (either way)
const EASE = 2.4; // how quickly the boost fades (per second)

const ATMOSPHERE_VERTEX = `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const ATMOSPHERE_FRAGMENT = `
  varying vec3 vNormal;
  void main() {
    float intensity = pow(0.74 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.6);
    gl_FragColor = vec4(0.25, 0.6, 1.0, 1.0) * intensity * 1.15;
  }`;

// Earth surface: the night lights brightened, a faint blue for the land and sea,
// and a glow towards the edge so the globe reads clearly against the black page.
const EARTH_VERTEX = `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const EARTH_FRAGMENT = `
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vec3 c = texture2D(map, vUv).rgb;
    c = pow(c, vec3(0.85)) * 2.1;
    float rim = pow(1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 3.0);
    c += vec3(0.008, 0.018, 0.04) + vec3(0.12, 0.38, 0.95) * rim * 0.35;
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;

export function Earth({ className }: { className?: string }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      return; // No WebGL: the page still works, just without the globe.
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // The drawing buffer is scaled by the pixel ratio; the element itself fills its box.
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, 7.2);

    const globe = new THREE.Group();
    globe.rotation.z = 0.41; // Earth's axial tilt
    scene.add(globe);

    const texture = new THREE.TextureLoader().load('/textures/earth-night.jpg');
    texture.colorSpace = THREE.SRGBColorSpace;
    // Sharpest filtering the device allows, so the city lights stay crisp at an angle.
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(2, 128, 128),
      new THREE.ShaderMaterial({ uniforms: { map: { value: texture } }, vertexShader: EARTH_VERTEX, fragmentShader: EARTH_FRAGMENT }),
    );
    earth.rotation.y = -1.2; // start with South Asia in view
    globe.add(earth);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(2.32, 64, 64),
      new THREE.ShaderMaterial({
        vertexShader: ATMOSPHERE_VERTEX,
        fragmentShader: ATMOSPHERE_FRAGMENT,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
      }),
    );
    scene.add(atmosphere);

    // Faint, fixed stars.
    const starCount = 900;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 30 + Math.random() * 20;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = -Math.abs(r * Math.cos(phi));
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({ color: 0x9fbfff, size: 0.1, transparent: true, opacity: 0.75, depthWrite: false }),
    );
    scene.add(stars);

    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Keep the globe a sensible size on narrow screens.
      camera.position.z = w < 640 ? 9.5 : 7.2;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // Scroll spin: each wheel or swipe step adds speed in its direction, which fades back smoothly.
    let boost = 0;
    const push = (dy: number) => {
      if (reduced) return;
      boost = Math.max(-MAX_BOOST, Math.min(MAX_BOOST, boost + dy * 0.006));
    };
    const onWheel = (e: WheelEvent) => push(e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY);
    let touchY: number | null = null;
    const onTouchStart = (e: TouchEvent) => { touchY = e.touches[0]?.clientY ?? null; };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY;
      if (y == null || touchY == null) return;
      push((touchY - y) * 1.5);
      touchY = y;
    };
    let lastY = window.scrollY;
    const onScroll = () => { const y = window.scrollY; push(y - lastY); lastY = y; };
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });

    let visible = true;
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0 });
    io.observe(el);

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!visible || document.hidden) return;
      boost *= Math.exp(-EASE * dt);
      earth.rotation.y += ((reduced ? BASE_SPEED * 0.4 : BASE_SPEED) + boost) * dt;
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      ro.disconnect();
      io.disconnect();
      texture.dispose();
      earth.geometry.dispose();
      (earth.material as THREE.Material).dispose();
      atmosphere.geometry.dispose();
      (atmosphere.material as THREE.Material).dispose();
      starGeometry.dispose();
      (stars.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={box} className={className} />;
}
