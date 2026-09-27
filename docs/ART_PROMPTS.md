# Painted background layers — how to make them

The game loads painted backgrounds from `assets/bg/`. If a file is missing, the game still runs
without it, so you can add the images one at a time.

## Step 0 — the style frame (make this first)

Read `docs/ART_DIRECTION.md` first. Then generate one reference image. Save it as
`docs/reference/style_frame.png` and attach it to every later generation.

> Hand-painted 2D side-scrolling game screenshot in the style of Limbo, fully monochrome grayscale.
> A small child silhouette, pure black with two tiny white glowing eyes, stands on a pure-black
> forest floor with tall grass on the left third of the frame. Behind: mid-gray tree trunks with
> hanging roots, then pale faded pines in thick fog, then a glowing pale sky. Far layers are light
> and soft, near layers are dark and sharp. Soft film-like atmosphere, no text, no colour.
> 1536 × 1024.

## The three layers (The Awakening)

| File | What it is | Generate at | Transparent? | Moves |
|---|---|---|---|---|
| `awakening_sky.png` | Sky and distant fog. Fills the whole screen. | 1536 × 1024 | No | Fixed to the screen |
| `awakening_far.png` | Faint, far-away tree line and ruins. | 1536 × 1024 | **Yes** | Slowly (20% of camera speed) |
| `awakening_mid.png` | Nearer, darker trees and roots. | 1536 × 1024 | **Yes** | Medium (45% of camera speed) |

**How the game fits them:**
- It scales each image to the layer's height and lines up the bottom edges.
- If the image isn't wide enough, the game repeats it and mirrors every second copy, so the joins
  always match.
- You don't need to make the images tile.
- Wider images (for example 1536 × 1024 or larger) repeat less often and look less repetitive.

## Shared style (paste at the start of every prompt)

> Hand-painted 2D side-scrolling game background layer in the style of Limbo and Planet of Lana,
> fully monochrome grayscale, no color. Soft misty atmosphere, a heavy fog gradient, and a subtle
> film grain. Flat silhouettes with soft edges, no outlines, no text, no characters, no creatures,
> no ground or floor in the foreground. Orthographic side view, horizon low in the frame.
> Eerie, quiet, lonely mood.

## Per-layer prompts

**Sky — `awakening_sky.png`** (no transparency)
> [shared style] A pale gray sky that fades lighter toward the center and darker toward the edges
> and the top. Faint drifting fog bands and a barely visible glow behind the mist. No trees, no
> objects. Very low contrast.

**Far — `awakening_far.png`** (transparent background)
> [shared style] Transparent background. A distant, faded tree line of tall thin pine silhouettes
> and a few broken stone arches, in light gray (about 55–65% brightness, like the far pines in the style frame), fading into fog near the
> bottom. Low contrast. The shapes fill the lower two thirds and the top is empty.

**Mid — `awakening_mid.png`** (transparent background)
> [shared style] Transparent background. Closer, darker tree trunks (about 35–45% brightness, like the mid trees in the style frame) with
> twisted branches, hanging roots and vines. More detail than the far layer, but still soft.
> The trunks reach the bottom edge. The top third is mostly empty with a few branches.

## Rules that keep the game readable

- **Keep backgrounds lighter than the play area.** The ground and characters are near-black
  (#0c0c0b). Anything that dark in the background makes platforms hard to see.
  - far: light gray
  - mid: medium gray
  - never pure black
- **No floor in the images.** The game draws the ground itself. A painted floor would look walkable.
- **Grayscale only.** Color would clash with the rest of the scene.
- **PNG with a real transparent background** for the far and mid layers. Check that the
  checkerboard in GPT's output is actual transparency, not a painted checkerboard.

## Adding them

1. Save the files with exactly the names above in `assets/bg/`.
2. Push them to the branch. The game picks them up with no code change.

To add a layer to another level, add a `backdrops` entry to that level file (see
`js/levels/awakening.js` and the comment in `js/art/Backdrops.js`).
