export function drawRadar(ctx, radarCanvas, game) {
  const { player, enemies, boss, world } = game;
  const w = radarCanvas.width;
  const h = radarCanvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const range = 1500;

  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(150, 220, 255, 0.8)";
  ctx.lineWidth = 1.2;
  ctx.strokeRect(1, 1, w - 2, h - 2);

  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.42, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#78ff9a";
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();

  for (const enemy of enemies) {
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance > range) continue;

    // Scale world-space position into radar-space around the player.
    const px = cx + (dx / range) * (w * 0.44);
    const py = cy + (dy / range) * (h * 0.44);

    ctx.fillStyle = "#ff6262";
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  if (boss) {
    const dx = boss.x - player.x;
    const dy = boss.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= range) {
      const px = cx + (dx / range) * (w * 0.44);
      const py = cy + (dy / range) * (h * 0.44);
      ctx.fillStyle = "#ffb04d";
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 230, 170, 0.9)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  ctx.fillStyle = "rgba(180, 225, 255, 0.9)";
  ctx.font = "11px Arial";
  ctx.fillText(`World: ${Math.round(world.width)}x${Math.round(world.height)}`, 8, h - 8);
}
