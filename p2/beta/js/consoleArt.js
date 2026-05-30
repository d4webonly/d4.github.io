const CONSOLE_ART_PATH = "assets/console_art.txt";
const CONSOLE_ART_STYLE = "font-family: monospace; white-space: pre; line-height: 1; color: #29C363;";

export async function showConsoleArt() {
  try {
    const response = await fetch(CONSOLE_ART_PATH, { cache: "no-store" });

    if (!response.ok) {
      return;
    }

    const art = await response.text();

    if (!art.trim()) {
      return;
    }

    console.log(`%c${art}`, CONSOLE_ART_STYLE);
  } catch {
    // Keep this decorative console output from affecting the game.
  }
}
