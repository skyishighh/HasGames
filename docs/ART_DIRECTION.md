# Art Direction — The Codex: Connected

This guide defines how every asset should look, so art made at different times, by people or by AI,
still looks like one game. **If an asset breaks a rule here, fix the asset, not the rule.** If a rule
is wrong, change it here first.

---

## 1. The one-sentence style

> **A foggy, monochrome, hand-painted world, where the only pure black is what you can touch and
> the only pure white is what is alive or magical.**

Everything below follows from that sentence.

---

## 2. Value scale (the most important rule)

The game has no color, so brightness ("value") is how players tell things apart. Each depth band
has its own brightness range, and bands never overlap.

| Band | What lives here | Brightness (0 = black, 255 = white) | Current in code |
|---|---|---|---|
| **Light** | Eyes, fragments, Weaver's beam and hands, nodes when lit | 230–255 | `#ffffff` |
| **Sky** | Sky and fog glow | 150–200 at the centre, 30–60 at the edges | `#9a9a94` → `#1c1c1a` |
| **Far** | Distant tree lines and ruins | 110–160 | not yet made |
| **Mid** | Nearer trees and roots | 55–95 | trees `#3a3a38`–`#1e1e1c` |
| **Play** | Ground, walls, crates, characters, enemies | **0–12** | `#050505` |
| **Near** (optional) | Blurred foreground grass and branches in front of the player | 0–8, blurred | not yet made |

**The rules:**
1. **Only the Play band is near-black.** If a background element is darker than about 40, players
   will try to stand on it.
2. **Only the Light band is near-white.** Anything glowing white should mean "interactive,
   magical, or alive".
3. **Further away means lighter and softer.** Fog eats contrast with distance.
4. The Near band may be as dark as the Play band, but only if it is blurred and sits at the screen
   edges. It must never cover the path.

---

## 3. Shape language

| Meaning | Shape | Examples |
|---|---|---|
| Safe, natural | Soft, irregular, organic edges | Ground, trees, roots, grass |
| Pushable / usable | Chunky, slightly crooked rectangles, visible planks or cracks | Crates, blocks, cracked walls |
| Machine / "Codex" | Straight lines, grids, teeth, perfect circles | Gates, crushers, vault, nodes |
| Danger | Spikes, jagged teeth, thin long limbs | Crushers, hazards, threats |
| The Hollow | **No hard edges at all.** A smeared, smoky void with two white eyes | Main threat |

**The digital-realm rule:** the natural world is organic, and Codex machinery is geometric. This
contrast is how the game shows "a forest that is secretly a computer" without any text.

---

## 4. Characters

**Proportions:** large heads, thin limbs, no faces except two white eyes. Heights match the hitboxes:

| Role | Height | Silhouette identity (must read at 32 px tall) |
|---|---|---|
| **Scout** | 32 px, smallest | Spiky hair tufts, thin legs, quick lean |
| **Warden** | 46 px, tallest | Broad shoulders, pointed hood, heavy boots |
| **Weaver** | 40 px | Hood plus a cloak that trails behind, two glowing hands |
| **Anchor** | 42 px, stocky | Wide stance, an anchor on the back |

**Test:** fill the character solid black at game size. You should still be able to name the role.
If you can't, the silhouette needs work, not the details.

**Animation principles:**
- Motion is driven by distance moved, so feet never slide.
- Poses are exaggerated. They read through fog at small size.

---

## 5. Light, fog, and texture

These are shared layers the code draws on top of everything. Art should not paint them in.

- **Fog:** a drifting soft layer. Background art may include its own fog, but only below the
  horizon.
- **Film grain and vignette:** added by the code. **Never paint grain into the assets**, because
  it doubles up and looks muddy.
- **Darkness:** added by the code in dark zones, with soft light holes. Art for dark zones should
  be painted at normal brightness; the darkness is applied on top.
- **Light sources:** pure white with a soft falloff. There are no coloured lights.

---

## 6. Colour decision (decided)

**Pure black and white, with no accent colour anywhere.** The "digital" Codex moments are shown
through shape (grids, perfect geometry, glitchy flicker) and pure-white light, never through colour.

---

## 7. Zone moods

| Zone | Mood | Key visual motifs | Background idea |
|---|---|---|---|
| **Scout – The Pit** | Claustrophobic, vertical | Rock shafts, hanging roots, a grate mesh | Tall cliff faces, shafts of light from above |
| **Warden – The Collapse** | Heavy, industrial | Broken beams, crushers, cracked stone | Half-buried machines, collapsed arches |
| **Anchor – The Cliff** | Exposed, windy | Bent trees, blowing grass, a drawbridge | Wide open sky, distant storm, trees leaning in the wind direction |
| **Weaver – The Dark Tunnel** | Blind, eerie | Phantom platforms, nodes | Mostly black; faint shapes only where light hits |
| **The Chasm / Vault** | Awe, reveal | A giant grid-lined vault on a chain | Deep fog, huge scale, the vault as the brightest dark shape |

---

## 8. Asset specifications

| Asset type | Format | Size | Transparent | Notes |
|---|---|---|---|---|
| Sky | PNG | 1536 × 1024 | No | Low contrast, no objects |
| Far / mid layers | PNG | 1536 × 1024 (wider is better) | Yes | Bottom edge can be cut off; no floor |
| Near layer (later) | PNG | 1536 × 512 | Yes | Grass or branches only along the bottom and edges |
| Character sprites (later) | PNG sprite sheet | Frames drawn at 4× game size (e.g. Scout 128 px tall) | Yes | Solid black, and see §4 |
| Props (later) | PNG | 4× game size | Yes | Must stay in the Play band, 0–12 |

**Naming:** `<level>_<layer>.png`, for example `awakening_far.png` or `pit_mid.png`, stored in
`assets/bg/`.

---

## 9. Workflow for AI-generated art

1. **Make one "style frame" first.** Generate a single full scene: a boy silhouette in a foggy
   forest. Iterate until it looks exactly like the game should.
2. **Save it as the reference.** Use it as `docs/reference/style_frame.png`, and attach it to every
   later GPT generation with the note: *"Match the style, values and brushwork of this reference
   exactly."*
3. **Generate layers separately** using the prompts in `docs/ART_PROMPTS.md`.
4. **Check each asset** against the checklist below before adding it.

### Acceptance checklist
- [ ] Grayscale only, no colour tint.
- [ ] Values sit inside its band (§2). Compare it to a screenshot of the game.
- [ ] No floor, no text, no characters in backgrounds.
- [ ] Real transparency where required.
- [ ] No painted grain or vignette.
- [ ] Matches the style frame side by side.
- [ ] In-game: platforms and characters are still instantly readable.
