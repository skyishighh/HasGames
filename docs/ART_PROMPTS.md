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

---

# Per-zone backgrounds (The Awakening)

Each zone has its own sky, far and mid layer. The game cross-fades between zones as the camera
moves. The central chasm keeps the forest set above (`awakening_*.png`). Any zone image that is
missing uses the forest image instead, so zones can be added one at a time.

**Same rules as above:**
- 1536 × 1024, grayscale.
- Sky is not transparent; far and mid **are** transparent.
- No floor, no characters, no text.
- Far is about 55–65% brightness, mid about 35–45%, never black.

Attach `docs/reference/style_frame.png` every time and start with:
*"Using the attached image as the exact style reference (same brushwork, fog and grayscale values):"*

| Zone | Files |
|---|---|
| Scout – The Pit | `pit_sky.png`, `pit_far.png`, `pit_mid.png` |
| Warden – The Collapse | `collapse_sky.png`, `collapse_far.png`, `collapse_mid.png` |
| Anchor – The Cliff | `cliff_sky.png`, `cliff_far.png`, `cliff_mid.png` |
| Weaver – The Dark Tunnel | `tunnel_sky.png`, `tunnel_far.png`, `tunnel_mid.png` |

## Scout — The Pit (claustrophobic, vertical, deep underground)
- **Sky:** Looking up from deep inside a narrow rocky pit. A small pale opening of sky far above,
  with soft light shafts falling down through drifting dust and fog. Dark rock framing the edges,
  medium gray, not black. No objects.
- **Far (transparent):** Distant tall rock walls and stone pillars rising out of fog, light gray,
  with vertical cracks and a few thin hanging roots. The top of the image is empty.
- **Mid (transparent):** Closer jagged rock columns with long hanging roots, vines and a broken
  rusty pipe sticking out of the rock, medium gray. The shapes reach the bottom edge.

## Warden — The Collapse (heavy, industrial, crushing)
- **Sky:** A dim, dusty interior of a huge collapsed underground hall. Faint light leaking through
  cracks in a far ceiling. Low contrast, darker than the forest sky, never black.
- **Far (transparent):** Silhouettes of giant broken gears, fallen iron beams and half-buried
  machines, fading into dust. Light gray, soft edges.
- **Mid (transparent):** Closer bent iron girders, dangling chains, cracked concrete slabs and
  thick cables, medium gray. They reach the bottom edge.

## Anchor — The Cliff (exposed, windy, vast)
- **Sky:** A wide, stormy open sky seen from a high cliff. Streaked clouds blown hard to the LEFT,
  a pale gap of light, rain haze in the distance. Low contrast.
- **Far (transparent):** Far-off mountain ridges and a distant stormy sea horizon, very light gray
  in haze. Only the lower half of the image.
- **Mid (transparent):** Wind-bent bare trees and long grass all leaning hard to the LEFT, with
  torn leaves flying left. Medium gray. They reach the bottom edge.

## Weaver — The Dark Tunnel (blind, eerie)
The game covers this zone in darkness and lights only around the Weaver, so these images appear
only in small lit circles. Keep them simple and a bit brighter than feels natural.
- **Sky:** The inside of a vast dark cave. Soft gray fog, very low contrast, with a faint glow
  in the centre. No objects.
- **Far (transparent):** Distant cave pillars and stalactites, light gray, faint and foggy.
- **Mid (transparent):** Closer strange stone formations and pale thin hanging roots, like
  nerves, medium gray. Slightly unsettling. They reach the bottom edge.
