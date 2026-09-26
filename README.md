# HasGames

A 4-player co-op, Limbo-style puzzle platformer that runs entirely in the browser.
One player hosts from their own browser; up to 3 friends join with a room code
(WebRTC peer-to-peer via [PeerJS](https://peerjs.com) 1.5.5).
Built on [Phaser](https://phaser.io) 4.2.1, loaded from a CDN — players install nothing.

See [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md) for the story, roles, threats and design decisions.

## Run locally
ES modules need a web server (opening `index.html` as a file won't work):

    python3 -m http.server 8000
    # open http://localhost:8000

## Controls
Move A/D (jog) · Sprint Shift · Jump W/Space · Crouch S · Interact E · Abilities J / K.

Developer only (test build):
- **1–4** switch the controlled character's role (Scout, Warden, Weaver, Anchor)
- **0** spawns a dummy teammate next to you (up to 3)
- **Tab** switches which character you control (yours or a dummy), so two-player abilities can be tested alone

## Structure
- `js/main.js`                  – lobby UI, networking setup, boots Phaser
- `js/net.js`                   – host/guest networking (PeerJS wrapper)
- `js/config.js`                – shared engine/network constants
- `js/roles.js`                 – role stats (speed, jump, size) and input shape
- `js/player/PlayerSim.js`      – host-side player simulation: movement + all role abilities
- `js/player/input.js`          – keyboard → input state
- `js/scenes/GameScene.js`      – host runs physics, level rules and snapshots; guests render them
- `js/world/Level.js`           – builds a level from data (visuals everywhere, physics on host)
- `js/levels/awakening.js`      – Act II Solo Awakening (default level)
- `js/levels/gym.js`            – Ability Gym: one test station per ability (open with `?level=gym`)
- `js/world/Atmosphere.js`      – darkness + light, fog, grain, vignette
- `js/world/Scripted.js`        – Hollow glimpses, camera reveal, scripted triggers
- `js/objects/PlayerView.js`    – role silhouettes (separate from physics hitboxes)
- `js/snapshot-buffer.js`       – guest-side interpolation of players and movable objects
- `js/background-ticker.js` + `js/tick-worker.js` – keep the host simulating while its tab is hidden
