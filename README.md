# HasGames

A 4-player co-op, Limbo-style puzzle platformer that runs entirely in the browser.
One player hosts from their own browser; up to 3 friends join with a room code
(WebRTC peer-to-peer via [PeerJS](https://peerjs.com) 1.5.5).
Built on [Phaser](https://phaser.io) 4.2.1, loaded from a CDN — players install nothing.

## Run locally
ES modules need a web server (opening `index.html` as a file won't work):

    python3 -m http.server 8000
    # open http://localhost:8000

## Structure
- `js/main.js`               – lobby UI, networking setup, boots Phaser
- `js/net.js`                – host/guest networking (PeerJS wrapper)
- `js/background-ticker.js` + `js/tick-worker.js` – keep the host simulating while its tab is hidden
- `js/snapshot-buffer.js`     – guest-side interpolation of host snapshots (smooth movement)
- `js/config.js`             – shared gameplay constants
- `js/scenes/GameScene.js`   – gameplay: host runs Arcade Physics, guests render snapshots
- `js/world/Level.js`         – builds a level from data (visuals everywhere, physics on host)
- `js/levels/level1.js`       – level data: platforms, plates, gates, finish zone
- `js/objects/PlayerView.js` – player visuals (separate from the physics hitbox)
