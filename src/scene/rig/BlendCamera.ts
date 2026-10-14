import { Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { blendedProjection } from './projection';
import type { CameraPose } from './pose';

const UP = new Vector3();
const DIR = new Vector3();
const M = new Matrix4();

/**
 * 透視⇄平行投影を連続に補間できるカメラ。three からは PerspectiveCamera に見える
 * (影・視錐台カリング・drei の Html は projectionMatrix をそのまま使うので正しく動く)。
 * R3F がリサイズ時に aspect を書き換えて updateProjectionMatrix を呼んでも補間は保たれる。
 */
export class BlendCamera extends PerspectiveCamera {
  /** 0 = 透視、1 = 平行 */
  orthoBlend = 0;
  /** 平行投影で透視と範囲を一致させる距離(注視点までの距離) */
  focusDistance = 5;

  override updateProjectionMatrix(): void {
    // PerspectiveCamera のコンストラクタからも呼ばれる(フィールド初期化前)
    if (typeof this.orthoBlend !== 'number') {
      super.updateProjectionMatrix();
      return;
    }
    blendedProjection(
      this.projectionMatrix,
      this.fov,
      this.aspect,
      this.near,
      this.far,
      this.focusDistance,
      this.orthoBlend,
    );
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }

  /** 姿勢を当てはめ、行列を更新する */
  applyPose(pose: CameraPose): void {
    const [px, py, pz] = pose.position;
    const [tx, ty, tz] = pose.target;
    this.position.set(px, py, pz);
    DIR.set(tx - px, ty - py, tz - pz);
    const dist = DIR.length();
    UP.set(pose.up[0], pose.up[1], pose.up[2]);
    // 視線と上方向がほぼ平行なら上方向を差し替える
    if (dist > 1e-9 && Math.abs(UP.normalize().dot(DIR.normalize())) > 0.9999) {
      UP.set(0, 0, -1);
    }
    M.lookAt(this.position, TMP_T.set(tx, ty, tz), UP);
    this.quaternion.setFromRotationMatrix(M);
    this.fov = pose.fov;
    this.orthoBlend = Math.min(1, Math.max(0, pose.ortho));
    this.focusDistance = Math.max(0.05, dist);
    this.updateMatrixWorld(true);
    this.updateProjectionMatrix();
  }
}

const TMP_T = new Vector3();

/** カメラの view-projection 行列(画面への写像)を out に入れる */
export function viewProjection(camera: PerspectiveCamera, out: Matrix4): Matrix4 {
  return out.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
}
