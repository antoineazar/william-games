export class Missile {
  constructor({ x, y, angle, speed, friendly, homing = false }) {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.angle = angle;
    this.speed = speed;
    this.friendly = friendly;
    this.homing = homing;
    this.turnRate = 4.8;
    this.radius = 5;
    this.damage = friendly ? 40 : 25;
    this.life = 2.2;
    this.trail = [];
  }

  update(dt, target) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.trail.push({ x: this.x, y: this.y, life: 0.28 });
    if (this.trail.length > 10) this.trail.shift();

    if (this.homing && target) {
      const targetAngle = Math.atan2(target.y - this.y, target.x - this.x);
      const delta = normalizeAngle(targetAngle - this.angle);
      const maxTurn = this.turnRate * dt;
      this.angle += Math.sign(delta) * Math.min(Math.abs(delta), maxTurn);
    }

    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;
    this.life -= dt;

    for (const segment of this.trail) {
      segment.life -= dt;
    }
    this.trail = this.trail.filter((segment) => segment.life > 0);
  }

  isAlive(world) {
    return (
      this.life > 0 &&
      this.x >= 0 &&
      this.x <= world.width &&
      this.y >= 0 &&
      this.y <= world.height
    );
  }
}

function normalizeAngle(angle) {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
