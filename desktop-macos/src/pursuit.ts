type Point = { x: number; y: number };
type Area = Point & { width: number; height: number };
const clamp = (v: number, low: number, high: number) =>
  Math.max(low, Math.min(v, Math.max(low, high)));

// Positions and velocities stay in macOS desktop points, independently of renderer zoom.
export class CursorPursuit {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  private side = 1;
  private initialized = false;

  step(
    cursor: Point,
    area: Area,
    size: { width: number; height: number },
    seconds: number,
  ) {
    const right = area.x + area.width - cursor.x,
      left = cursor.x - area.x;
    if (!this.initialized) this.side = right >= size.width + 30 ? 1 : -1;
    // Hysteresis prevents oscillating between sides when the pointer skims an edge.
    if (this.side === 1 && right < size.width + 12 && left > right + 60)
      this.side = -1;
    else if (this.side === -1 && left < size.width + 12 && right > left + 60)
      this.side = 1;
    const targetX = clamp(
        cursor.x + (this.side === 1 ? 30 : -size.width - 30),
        area.x,
        area.x + area.width - size.width,
      ),
      targetY = clamp(
        cursor.y + 28,
        area.y,
        area.y + area.height - size.height,
      );
    if (!this.initialized) {
      this.x = targetX;
      this.y = targetY;
      this.initialized = true;
    }
    // A damped spring with bounded acceleration and speed: lag, pursuit, then a soft stop.
    // Small integration steps keep the result stable across delayed host timer callbacks.
    const elapsed = clamp(seconds, 0, 0.05),
      count = Math.max(1, Math.ceil(elapsed * 120)),
      dt = elapsed / count;
    for (let i = 0; i < count; i++) {
      let ax = (targetX - this.x) * 55 - this.vx * 13,
        ay = (targetY - this.y) * 55 - this.vy * 13;
      const acceleration = Math.hypot(ax, ay);
      if (acceleration > 6500) {
        ax *= 6500 / acceleration;
        ay *= 6500 / acceleration;
      }
      this.vx += ax * dt;
      this.vy += ay * dt;
      const speed = Math.hypot(this.vx, this.vy);
      if (speed > 1800) {
        this.vx *= 1800 / speed;
        this.vy *= 1800 / speed;
      }
      const x = this.x + this.vx * dt,
        y = this.y + this.vy * dt;
      this.x = clamp(x, area.x, area.x + area.width - size.width);
      this.y = clamp(y, area.y, area.y + area.height - size.height);
      if (this.x !== x) this.vx = 0;
      if (this.y !== y) this.vy = 0;
    }
    if (
      Math.hypot(targetX - this.x, targetY - this.y) < 0.5 &&
      Math.hypot(this.vx, this.vy) < 3
    ) {
      this.x = targetX;
      this.y = targetY;
      this.vx = this.vy = 0;
    }
    return {
      x: Math.round(this.x),
      y: Math.round(this.y),
      lean: clamp(this.vx / 170, -7, 7),
      stride: Math.min(1, Math.hypot(this.vx, this.vy) / 650),
    };
  }
}
