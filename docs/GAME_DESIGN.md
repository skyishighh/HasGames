# The Codex: Connected — Game Design Document

> Living document. Records decisions made so far; update it whenever a decision changes.
> Sections marked **OPEN** are not decided yet.

---

## 1. Overview

| | |
|---|---|
| **Genre** | Story-driven 4-player co-op puzzle-platformer (2D side-scroller) with horror atmosphere |
| **Inspirations** | *It Takes Two*, *Split Fiction*, *Unravel Two* (co-op design) · *Limbo*, *Inside* (look, mood, wordless storytelling) · *Jumanji* (pulled inside a mysterious game) · *Uncharted* (scripted escape set pieces) |
| **Platform** | Browser (HTML5, Phaser 4). One player hosts from their browser; others join with a room code (WebRTC via PeerJS). |
| **Players** | **Exactly 4.** The game cannot start with fewer. |
| **Art** | Monochrome silhouettes, fog, film grain, cold light. Art generated with AI image tools using one fixed style prompt; physics hitboxes stay separate from art. |
| **Core theme** | Loneliness → connection. Four isolated strangers become real friends by surviving together. The players themselves are strangers connecting through an online game — the story mirrors them. |

### Storytelling rules
- **Gameplay has no narration, no dialogue, no on-screen text.** Everything is told through environment, animation, light, sound and action.
- **Scripted set pieces** make key moments feel alive (collapses, chases, reveals) while players stay in control.
- **Only the epilogue** is presented as illustrated **comic panels**.

---

## 2. The Four Roles

Roles are **assigned randomly by the game** when the host starts (fits the story: the game chose them).
Each role belongs to a character with their own real-world room in the prologue.

| Role | Ability | Silhouette | Real-world loneliness (prologue) |
|---|---|---|---|
| **Scout** | Agility: wall-jump, climb vertical mesh, squeeze through vents | Small, light, fast | Parents argue behind the door; turns up headphones to block it out |
| **Warden** | Strength: lift/smash rubble, push heavy blocks, hold falling objects | Big, broad | Birthday cupcake with one candle; school jacket with a torn sleeve |
| **Weaver** | Light: spark a beam from the hands, power dormant circuits, repel some threats | Slim, glowing hands | Unpacked moving boxes; drawings of old friends from another city |
| **Anchor** | Weight: drive an anchor into the ground to resist wind/force, lock plates, create tether points | Heavy, grounded | Microwave dinner for one; younger sibling asleep on the couch; parents work nights |

Every puzzle may assume all four abilities are present.

---

## 3. Story (Acts)

### Prologue — "Midnight" (playable, ~30–60 s, wordless)
- Each player starts alone in **their character's room**, dim and grey, lit only by a monitor.
- Small interactive details reveal their loneliness (see table above).
- **Hidden detail:** from the window, the night city shows **three other lit windows** — the other players. Pays off in the epilogue.
- At midnight an unlabelled icon appears on the screen. The player clicks it → blinding flash → shadow cords drag them into the Codex, turning them into silhouettes.

### Act I → II — Solo Awakening (tutorial, wordless)
Each player lands in a **separate starting zone** that teaches their ability through level design:
- **Scout:** a tall vertical shaft — learns to wall-jump and climb out of the pit.
- **Warden:** blocked by heavy iron rubble — learns to lift and smash.
- **Weaver:** a pitch-dark tunnel — learns to spark light to see the path.
- **Anchor:** a wind-swept ledge — learns to anchor down against the gusts.

After clearing their zone, each steps onto an elevated viewing platform and **sees the others in the background** — they are not alone.
The Hollow appear only as **glimpses** here (flickers, distant watching shapes).

### Act III — The 2+2 Meeting and Full Squad Assembly
- **First pair (Scout + Warden):** separated by a locked security gate. The Scout climbs high to hit a switch while the Warden catches a falling pillar. The gate opens.
- **Second pair (Weaver + Anchor):** a parallel path; light beams and weight-tethers clear a flooded bridge.
- **Full squad:** both pairs reach opposite sides of a fortified central vault, visible to each other through a transparent grid. Weaver powers a circuit, Anchor locks a floor plate, Scout scales a mesh wall, Warden forces the final seal → CLICK → all four stand together for the first time.
- First **Hollow chases** begin: they hunt whoever falls behind their partner.

### Act IV — Combos, Chaos and Set Pieces
- Levels are built around **ability combos** using all four powers.
- **Loop:** solve a complex zone puzzle → unlocking the gate triggers a **system trap** → a scripted, cinematic **escape sequence** where all four must use combos on the fly (pulling each other over gaps, timing moves in sync).
- Areas (each with its own threat, see §4): Server Halls, Collapsing Factory, Runaway Train, Flooded Archive.

### Act V — The Grand Orrery
- The heart of the Codex. The system triggers a final chaotic lockdown.
- A **master-combo puzzle under a ticking clock** overrides the core.
- The digital world shatters into a shower of **warm light** (first warmth in the game).

### Epilogue — "Connected" (comic panels)
- The four crash back onto the floors of their rooms, gasping. Monitors dark.
- The game left behind a multiplayer lobby log; they discover they live in the **same city** and share their in-game usernames. They message each other.
- Final panel: the four teens meeting at a local café, laughing — the game gave them the friends they needed.
- The window detail from the prologue pays off: the four lit windows were each other.
- Minimal text (chat messages / speech bubbles) is acceptable **in the comic only**.

---

## 4. Threats

### Design rules for every threat
1. **One simple rule** players understand by watching — no text.
2. **A clear warning sign** (sound or visual) before it strikes, so deaths feel fair.
3. **Requires teamwork** to escape or overcome.

### Main threat — The Hollow (present throughout)
- Former players who were pulled into the Codex and **never connected with anyone**; the game absorbed them.
- Look: twisted, flickering silhouettes with a **cold screen-glow where the face should be**, dragging shadow cords.
- **Rule: they hunt whoever is alone.** Groups make them hesitate and pull back → staying together is survival.
- Escalation: glimpses (solo) → chases (pairs) → swarms released by traps (full squad).

### Area threats (Act IV)

| Area | Threat | Behavior | Team counter |
|---|---|---|---|
| Server Halls (stealth) | **The Watchers** — giant camera-eyes on mechanical stalks | Sweeping searchlights; being seen triggers an alarm and a Hollow swarm | Stay in shadow; Warden holds cover, Anchor jams the rotating stalks |
| Collapsing Factory (escape) | **The Eaters** — glitching insect swarms | Devour floors and platforms behind the players | Keep moving; Weaver's light drives them back briefly |
| Runaway Train (chase) | **The Tracers** — fast, dog-like hunters | Track sound (running, loud landings) | Scout lures them away; others move quietly; Anchor slam stuns |
| Flooded Archive (rising danger) | **The Overflow** — black "data water" with shapes beneath | Rises in waves; pulls anything in it under | Climb together; Warden lifts shelves into stairs; Anchor creates tether points |
| Throughout Act IV | **The Collector** — giant slow figure in the far background | Reaches into the level to grab a player; drives big set pieces | Watch for its shadow; hide under solid cover; lone players are its target |

### Final threat — The Codex Core (Act V)
A huge eye-like machine woven from thousands of Hollow cords, controlling the Grand Orrery.

**Scope guard:** 5 area threats + the Hollow + the Core is the planned maximum. If more are proposed, cut or merge instead of adding.

---

## 5. Technical Implications (from design decisions)

| Decision | What the systems need |
|---|---|
| Exactly 4 players | Lobby shows 1/4…4/4; **Start** enabled only at 4/4 |
| Random roles | Host assigns roles at start and broadcasts them |
| 4-player dependency | **Disconnect handling:** pause the game and let the player rejoin into the same role |
| Solo → pairs → squad | Separate starting zones; per-player camera (already built) |
| Wordless storytelling | Strong visual readability: glowing interactables, camera hints toward goals, sound cues |
| Scripted set pieces | Host-authoritative **trigger/sequence system**, events broadcast so all screens stay in sync |
| Anchor tethers, pulling players over gaps | Likely needs rope/joint physics → evaluate Phaser's **Matter.js** (Arcade has no joints) |
| Threat AI | Runs on the host only; guests receive state (same model as players) |
| Testing with 4 players | Automated tests with 4 simulated players; a **developer-only** mode for one person to control several characters |
| AI-generated art | Asset pipeline: fixed style prompt, transparent PNGs, parallax layers, cut-out (part-based) character animation |

---

## 6. Decision Log

| Decision | Choice |
|---|---|
| Platform | Browser, no install; Phaser 4.2.1 + PeerJS 1.5.5 |
| Hosting model | Player-hosted (WebRTC peer-to-peer, host is authoritative) |
| Story | *The Codex: Connected* (replaces earlier drafts: *Unsaid*, *The Tethered Dark*, *Last Turn*) |
| Player count | Exactly 4, required to start |
| Role assignment | Random, by the game |
| Narrative delivery | Wordless gameplay + scripted set pieces; comic-panel epilogue |
| Prologue | Playable, wordless, per-character rooms |
| Main threat | The Hollow (hunt isolated players) |
| Area threats | Watchers, Eaters, Tracers, Overflow, Collector; final: Codex Core |

## 7. OPEN Questions
- Death and checkpoint rules (what happens when one player dies? whole team respawns?).
- Communication tools inside the game (voice chat, pings, emotes?) — gameplay is wordless, but players still need to coordinate.
- Exact list and order of Act IV areas; set piece per area.
- Weaver/Anchor abilities in detail (ranges, cooldowns, controls).
- Character art style prompt and the AI art pipeline.
- Final game title.
