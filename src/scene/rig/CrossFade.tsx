import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import {
  HalfFloatType,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
} from 'three';

/**
 * reduced-motion のクロスフェード:遷移の瞬間の画を 1 枚撮っておき、カメラを行き先へ移したうえで
 * その画を画面全体に重ねて 0.3 秒で消す。黒へのフェードではなく、前の画から次の画へ溶ける。
 * 重ねる板はシーンの中にあるので、トーンマッピングや後処理は他の物と同じにかかる。
 */
export interface CrossFadeController {
  /** 今のカメラで画を撮り、重ねる(不透明度 1) */
  capture(): void;
  setOpacity(o: number): void;
}

export const crossFade: CrossFadeController = {
  capture: () => {},
  setOpacity: () => {},
};

export function CrossFade() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const get = useThree((s) => s.get);
  const { rt, mesh, material } = useMemo(() => {
    const rt = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
    const material = new ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      fog: false,
      uniforms: { map: { value: rt.texture }, opacity: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform float opacity;
        varying vec2 vUv;
        void main() {
          gl_FragColor = vec4(texture2D(map, vUv).rgb, opacity);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    const mesh = new Mesh(new PlaneGeometry(2, 2), material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1_000_000;
    mesh.visible = false;
    mesh.raycast = () => {};
    return { rt, mesh, material };
  }, []);

  useEffect(() => {
    const size = new Vector2();
    crossFade.capture = () => {
      const camera = get().camera;
      gl.getDrawingBufferSize(size);
      rt.setSize(Math.max(1, size.x), Math.max(1, size.y));
      mesh.visible = false;
      const prev = gl.getRenderTarget();
      gl.setRenderTarget(rt);
      gl.clear();
      gl.render(scene, camera);
      gl.setRenderTarget(prev);
      material.uniforms.opacity!.value = 1;
      mesh.visible = true;
    };
    crossFade.setOpacity = (o) => {
      material.uniforms.opacity!.value = o;
      mesh.visible = o > 0.001;
    };
    return () => {
      crossFade.capture = () => {};
      crossFade.setOpacity = () => {};
      rt.dispose();
      material.dispose();
      mesh.geometry.dispose();
    };
  }, [gl, scene, get, rt, mesh, material]);

  return <primitive object={mesh} />;
}
