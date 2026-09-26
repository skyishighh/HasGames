# HasGames

A 4-player co-op, Limbo-style puzzle platformer that runs entirely in the browser.
One player hosts from their own browser; up to 3 friends join with a room code
(WebRTC peer-to-peer via [PeerJS](https://peerjs.com) 1.5.5).

## Run locally
ES modules need a web server (opening `index.html` as a file won't work):

    python3 -m http.server 8000
    # open http://localhost:8000

## Structure
- `js/net.js`    – host/guest networking (PeerJS wrapper)
- `js/world.js`  – game simulation (runs on the host only)
- `js/input.js`  – keyboard input
- `js/render.js` – canvas drawing
- `js/main.js`   – lobby UI and game loops
