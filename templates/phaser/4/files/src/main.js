// Minimal Phaser 4 demo: a single scene with a sprite you move with the
// arrow keys, a title label, and an error banner hook. Proves the pipeline
// end to end on first run — no assets required. The canvas size and window
// title are substituted from the wizard's answers at scaffold time.
import { AUTO, Game, Scale } from "phaser";

class GameScene extends Phaser.Scene {
  constructor() {
    super("game");
  }

  create() {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, 24, "Arrow keys move the sprite", {
        fontFamily: "monospace",
        fontSize: "20px",
        color: "#ffffff",
      })
      .setOrigin(0.5, 0);

    // A colored square — no image asset needed.
    this.player = this.add.rectangle(width / 2, height / 2, 64, 64, 0x4da6ff);

    this.cursors = this.input.keyboard.createCursorKeys();
  }

  update() {
    const speed = 4;
    if (this.cursors.left.isDown) this.player.x -= speed;
    if (this.cursors.right.isDown) this.player.x += speed;
    if (this.cursors.up.isDown) this.player.y -= speed;
    if (this.cursors.down.isDown) this.player.y += speed;
  }
}

const config = {
  type: AUTO,
  // {{canvas_width}} / {{canvas_height}} substituted at scaffold time.
  width: Number("{{canvas_width}}"),
  height: Number("{{canvas_height}}"),
  parent: "game-container",
  backgroundColor: "#101018",
  scale: {
    mode: Scale.FIT,
    autoCenter: Scale.CENTER_BOTH,
  },
  scene: GameScene,
};

// Error banner hook: surface any uncaught error as a visible banner instead
// of failing silently in the console.
const banner = document.getElementById("error-banner");

function showError(message) {
  banner.textContent = `Error: ${message}`;
  banner.hidden = false;
}

window.addEventListener("error", (event) => showError(event.message));
window.addEventListener("unhandledrejection", (event) => {
  showError(event.reason instanceof Error ? event.reason.message : String(event.reason));
});

new Game(config);
