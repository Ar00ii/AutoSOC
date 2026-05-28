"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Line } from "@react-three/drei";
import * as THREE from "three";

function WireframeGlobe() {
  const ref = useRef<THREE.LineSegments>(null!);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.12;
  });
  const geom = useMemo(() => {
    const sphere = new THREE.SphereGeometry(1.6, 32, 22);
    return new THREE.WireframeGeometry(sphere);
  }, []);
  return (
    <lineSegments ref={ref} geometry={geom}>
      <lineBasicMaterial color="#000000" transparent opacity={0.35} />
    </lineSegments>
  );
}

function Latitudes() {
  const ref = useRef<THREE.Group>(null!);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.12;
  });
  const rings = useMemo(() => {
    const arr: { y: number; r: number }[] = [];
    for (let i = -5; i <= 5; i++) {
      const a = (i / 6) * (Math.PI / 2);
      arr.push({ y: Math.sin(a) * 1.6, r: Math.cos(a) * 1.6 });
    }
    return arr;
  }, []);
  return (
    <group ref={ref}>
      {rings.map((r, i) => (
        <mesh key={i} position={[0, r.y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r.r - 0.002, r.r + 0.002, 96]} />
          <meshBasicMaterial color="#000000" side={THREE.DoubleSide} transparent opacity={0.5} />
        </mesh>
      ))}
    </group>
  );
}

function ThreatArcs() {
  const group = useRef<THREE.Group>(null!);
  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y += dt * 0.12;
  });
  const arcs = useMemo(() => {
    const out: { points: THREE.Vector3[]; speed: number }[] = [];
    for (let i = 0; i < 18; i++) {
      const phi1 = Math.random() * Math.PI;
      const th1 = Math.random() * Math.PI * 2;
      const phi2 = Math.random() * Math.PI;
      const th2 = Math.random() * Math.PI * 2;
      const a = new THREE.Vector3(
        Math.sin(phi1) * Math.cos(th1) * 1.6,
        Math.cos(phi1) * 1.6,
        Math.sin(phi1) * Math.sin(th1) * 1.6,
      );
      const b = new THREE.Vector3(
        Math.sin(phi2) * Math.cos(th2) * 1.6,
        Math.cos(phi2) * 1.6,
        Math.sin(phi2) * Math.sin(th2) * 1.6,
      );
      const mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(2.3);
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      out.push({ points: curve.getPoints(40), speed: 0.4 + Math.random() * 0.6 });
    }
    return out;
  }, []);
  return (
    <group ref={group}>
      {arcs.map((a, i) => (
        <Line key={i} points={a.points} color="#000000" lineWidth={1} transparent opacity={0.55} />
      ))}
    </group>
  );
}

function ParticleField({ count = 800 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null!);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 3 + Math.random() * 4;
      const phi = Math.acos(2 * Math.random() - 1);
      const th = Math.random() * Math.PI * 2;
      arr[i * 3] = r * Math.sin(phi) * Math.cos(th);
      arr[i * 3 + 1] = r * Math.cos(phi);
      arr[i * 3 + 2] = r * Math.sin(phi) * Math.sin(th);
    }
    return arr;
  }, [count]);
  useFrame((_, dt) => {
    if (ref.current) {
      ref.current.rotation.y += dt * 0.03;
      ref.current.rotation.x += dt * 0.01;
    }
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#000000" size={0.018} sizeAttenuation transparent opacity={0.6} />
    </points>
  );
}

export default function Hero3D() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const fn = (e: MediaQueryListEvent) => setReduced(e.matches);
    m.addEventListener("change", fn);
    return () => m.removeEventListener("change", fn);
  }, []);

  return (
    <div className="absolute inset-0" aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, 5.2], fov: 50 }}
        dpr={[1, 2]}
        frameloop={reduced ? "demand" : "always"}
        gl={{ alpha: true, antialias: true }}
      >
        <ambientLight intensity={0.6} />
        <ParticleField />
        <WireframeGlobe />
        <Latitudes />
        <ThreatArcs />
        <OrbitControls enableZoom={false} enablePan={false} enableRotate autoRotate={false} />
      </Canvas>
    </div>
  );
}
