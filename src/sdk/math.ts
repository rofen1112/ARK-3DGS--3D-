import type { ArkVec3 } from './types';

export class MutableVec3 {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0
  ) {}

  set(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  add(value: MutableVec3) {
    this.x += value.x;
    this.y += value.y;
    this.z += value.z;
    return this;
  }

  multiplyScalar(value: number) {
    this.x *= value;
    this.y *= value;
    this.z *= value;
    return this;
  }

  clone() {
    return new MutableVec3(this.x, this.y, this.z);
  }

  toTuple(): ArkVec3 {
    return [this.x, this.y, this.z];
  }
}
