'use client';
// The rotating Earth behind the home page hero (Three.js), drawn from real NASA
// imagery: the Blue Marble day map, the night-lights map, an ocean-shine map, a
// relief (normal) map and a cloud layer (textures from the three.js examples,
// MIT; imagery NASA, public domain). A sun lights it, so there is a real day side
// with glinting oceans and drifting clouds, and a night side where the cities glow.
// It follows the site's day/night switch: in day mode the sun faces you and you
// see the sunlit Earth; in night mode the sun swings behind and the city lights
// come out. The change eases over about a second.
// Rotates slowly all the time and spins with the scroll wheel or trackpad (and a
// swipe on phones), then eases back to the slow spin. Pauses off screen and in
// hidden tabs, and keeps a much gentler spin for people who prefer reduced motion.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useTheme } from '@/lib/theme';

const BASE_SPEED = 0.05; // radians per second
const MAX_BOOST = 3; // extra radians per second at most while scrolling (either way)
const EASE = 2.4; // how quickly the boost fades (per second)
// Where the sun is, as seen from the camera, in each mode.
const SUN_DAY = new THREE.Vector3(-0.55, 0.3, 0.78).normalize();
const SUN_NIGHT = new THREE.Vector3(0.92, 0.28, -0.27).normalize();

const ATMOSPHERE_VERTEX = `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const ATMOSPHERE_FRAGMENT = `
  uniform vec3 sun;
  varying vec3 vNormal;
  void main() {
    float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.4);
    float lit = smoothstep(-0.35, 0.55, dot(vNormal, sun));
    vec3 tint = mix(vec3(0.25, 0.38, 0.75), vec3(0.4, 0.68, 1.0), lit);
    gl_FragColor = vec4(tint, 1.0) * intensity * (0.3 + 0.85 * lit);
  }`;

const EARTH_VERTEX = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vTangent;
  varying vec3 vBitangent;
  varying vec3 vView;
  void main() {
    vUv = uv;
    vec3 n = normalize(normal);
    // Tangent frame on the sphere (east and north), for the relief map.
    vec3 t = normalize(cross(vec3(0.0, 1.0, 0.0), n) + vec3(1e-5, 0.0, 0.0));
    vec3 b = normalize(cross(n, t));
    vNormal = normalize(normalMatrix * n);
    vTangent = normalize(normalMatrix * t);
    vBitangent = normalize(normalMatrix * b);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const EARTH_FRAGMENT = `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D specMap;
  uniform sampler2D normalMap;
  uniform sampler2D cloudMap;
  uniform vec3 sun;
  uniform float cloudShift;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vTangent;
  varying vec3 vBitangent;
  varying vec3 vView;
  void main() {
    vec3 nm = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
    vec3 n = normalize(vNormal + (vTangent * nm.x + vBitangent * nm.y) * 0.35);
    float ndl = dot(n, sun);
    float day = smoothstep(-0.08, 0.22, dot(vNormal, sun));

    vec3 dayCol = texture2D(dayMap, vUv).rgb;
    dayCol *= 0.12 + 0.85 * max(ndl, 0.0);
    // Sun glint on water (the specular map is white over the oceans).
    float water = texture2D(specMap, vUv).r;
    vec3 h = normalize(sun + vView);
    dayCol += vec3(1.0, 0.95, 0.85) * water * pow(max(dot(n, h), 0.0), 70.0) * 0.32 * day;

    // Night: warm city lights on a dark planet.
    vec3 lights = texture2D(nightMap, vUv).rgb;
    float lum = dot(lights, vec3(0.299, 0.587, 0.114));
    vec3 nightCol = vec3(0.004, 0.008, 0.02) + pow(max(lum - 0.03, 0.0), 1.1) * vec3(1.0, 0.76, 0.45) * 2.8;

    vec3 c = mix(nightCol, dayCol, day);

    // Clouds, lit by the sun, drifting a little faster than the ground.
    vec4 cl = texture2D(cloudMap, vec2(vUv.x + cloudShift, vUv.y));
    float cloud = cl.a * dot(cl.rgb, vec3(0.333));
    c = mix(c, vec3(0.95) * (0.05 + 0.85 * max(dot(vNormal, sun), 0.0)), cloud * 0.6);

    // Thin blue limb, brighter on the day side.
    float rim = pow(1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 3.0);
    c += vec3(0.35, 0.6, 1.0) * rim * (0.06 + 0.4 * day);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;

export function Earth({ className }: { className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const { resolved } = useTheme();
  // The scene reads this every frame and eases the sun towards it.
  const night = useRef(resolved === 'dark');
  useEffect(() => { night.current = resolved === 'dark'; }, [resolved]);

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

    const loader = new THREE.TextureLoader();
    const load = (url: string, color = true) => {
      const tx = loader.load(url);
      if (color) tx.colorSpace = THREE.SRGBColorSpace;
      tx.anisotropy = renderer.capabilities.getMaxAnisotropy();
      tx.minFilter = THREE.LinearMipmapLinearFilter;
      return tx;
    };
    const textures = [
      load('/textures/earth-day.jpg'), load('/textures/earth-night.jpg'),
      load('/textures/earth-specular.jpg', false), load('/textures/earth-normal.jpg', false), load('/textures/earth-clouds.png', false),
    ];
    const sunDir = (night.current ? SUN_NIGHT : SUN_DAY).clone();
    const earthUniforms = {
      dayMap: { value: textures[0] }, nightMap: { value: textures[1] }, specMap: { value: textures[2] },
      normalMap: { value: textures[3] }, cloudMap: { value: textures[4] },
      sun: { value: sunDir }, cloudShift: { value: 0 },
    };
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(2, 128, 128),
      new THREE.ShaderMaterial({ uniforms: earthUniforms, vertexShader: EARTH_VERTEX, fragmentShader: EARTH_FRAGMENT }),
    );
    earth.rotation.y = -3.2; // start with India in view
    globe.add(earth);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(2.32, 64, 64),
      new THREE.ShaderMaterial({
        uniforms: { sun: { value: sunDir } },
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
      new THREE.PointsMaterial({ color: 0xfff1dc, size: 0.09, transparent: true, opacity: 0.7, depthWrite: false }),
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
      earthUniforms.cloudShift.value = (earthUniforms.cloudShift.value + dt * 0.0015) % 1;
      // Day/night switch: swing the sun over about a second (at once with reduced motion).
      const target = night.current ? SUN_NIGHT : SUN_DAY;
      if (reduced) sunDir.copy(target);
      else sunDir.lerp(target, 1 - Math.exp(-3 * dt)).normalize();
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
      textures.forEach((tx) => tx.dispose());
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
