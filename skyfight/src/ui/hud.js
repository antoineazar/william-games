export function updateHud(game, elements) {
  const {
    levelValue,
    scoreValue,
    healthValue,
    statusLabel,
    effectBanner,
    effectBannerTitle,
    effectBannerSub,
    finalScoreValue,
    gameOverMessage,
    gameOverOverlay,
    levelCompleteOverlay,
    levelCompleteText,
    jetUnlockPanel,
    unlockedJetImage,
    unlockedJetName,
  } = elements;
  levelValue.textContent = String(game.level);
  scoreValue.textContent = String(game.score);
  healthValue.textContent = String(Math.max(0, Math.ceil(game.player.hp)));

  if (game.isOver) {
    statusLabel.textContent = "Mission failed";
    finalScoreValue.textContent = String(game.score);
    gameOverMessage.textContent = `Your ${game.getCurrentJetName()} was shot down.`;
    gameOverOverlay.classList.remove("hidden");
    levelCompleteOverlay.classList.add("hidden");
    effectBanner.classList.add("hidden");
    return;
  }

  gameOverOverlay.classList.add("hidden");
  if (game.levelComplete) {
    const phase = game.getLevelCompletePhase();
    if (phase !== "overlay") {
      levelCompleteOverlay.classList.add("hidden");
      effectBanner.classList.add("hidden");
      statusLabel.textContent = phase === "text" ? "Level complete!" : "Flyby salute...";
      return;
    }
    levelCompleteOverlay.classList.remove("hidden");
    levelCompleteText.textContent = game.getLevelCompleteText();
    const unlockedJet = game.getUnlockedJetInfo();
    if (unlockedJet) {
      jetUnlockPanel.classList.remove("hidden");
      unlockedJetName.textContent = unlockedJet.name;
      unlockedJetImage.src = unlockedJet.spritePath;
    } else {
      jetUnlockPanel.classList.add("hidden");
    }
    effectBanner.classList.add("hidden");
    statusLabel.textContent = "Boss defeated!";
    return;
  }
  levelCompleteOverlay.classList.add("hidden");
  jetUnlockPanel.classList.add("hidden");
  statusLabel.textContent = game.getStatusText();
  const banner = game.getEffectBanner();
  if (!banner) {
    effectBanner.classList.add("hidden");
  } else {
    effectBanner.classList.remove("hidden");
    effectBannerTitle.textContent = banner.title;
    const extras = banner.extras.length > 0 ? ` | + ${banner.extras.join(" + ")}` : "";
    effectBannerSub.textContent = `${banner.timeLeft.toFixed(1)}s${extras}`;
  }
}
