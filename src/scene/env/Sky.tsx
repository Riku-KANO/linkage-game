import { useMemo } from 'react';
import { BackSide, Color, ShaderMaterial, Vector3 } from 'three';
import { SUN_DIRECTION } from '../layout';

/**
 * 夕暮れの空(大きな球の内側に描くグラデーション)。地平線は橙、天頂は藍、
 * 太陽の周りは明るく滲む(HDR の値を出してブルームで光らせる)。外部テクスチャは使わない。
 */
export const SKY_COLORS = {
  zenith: '#1f2550',
  upper: '#5a4c86',
  horizon: '#f29a5c',
  ground: '#4a2f28',
  sun: '#ffb46a',
} as const;

export function Sky() {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          zenith: { value: new Color(SKY_COLORS.zenith) },
          upper: { value: new Color(SKY_COLORS.upper) },
          horizon: { value: new Color(SKY_COLORS.horizon) },
          ground: { value: new Color(SKY_COLORS.ground) },
          sunColor: { value: new Color(SKY_COLORS.sun) },
          sunDir: { value: new Vector3(...SUN_DIRECTION) },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            vec4 p = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * p;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 zenith;
          uniform vec3 upper;
          uniform vec3 horizon;
          uniform vec3 ground;
          uniform vec3 sunColor;
          uniform vec3 sunDir;
          varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir);
            float h = d.y;
            vec3 col;
            if (h > 0.0) {
              col = mix(horizon, upper, smoothstep(0.0, 0.28, h));
              col = mix(col, zenith, smoothstep(0.25, 0.85, h));
            } else {
              col = mix(horizon * 0.7, ground, smoothstep(0.0, 0.12, -h));
            }
            float s = max(dot(d, normalize(sunDir)), 0.0);
            // 太陽の周りの滲み(地平線に近いほど広い)と円盤
            col += sunColor * (pow(s, 6.0) * 0.9 + pow(s, 48.0) * 1.6);
            col += sunColor * smoothstep(0.9993, 0.9997, s) * 9.0;
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      }),
    [],
  );
  return (
    <mesh material={material} renderOrder={-10} frustumCulled={false} raycast={() => null}>
      <sphereGeometry args={[400, 32, 16]} />
    </mesh>
  );
}
