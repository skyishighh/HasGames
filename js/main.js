// Entry point: lobby UI, then the host or guest game loop.
import { HostNet, GuestNet, MAX_PLAYERS } from './net.js';
import { World } from './world.js';
import { readInput } from './input.js';
import { render } from './render.js';

const $ = (id) => document.getElementById(id);
const ctx = $('canvas').getContext('2d');
const SNAPSHOT_HZ = 20;
const HOST_ID = 'host';

function setStatus(text) { $('status').textContent = text; }
function playerName() { return $('name').value.trim() || 'Player'; }

function showGame(code, players) {
  $('lobby').hidden = true;
  $('game').hidden = false;
  $('room-label').textContent = `Room: ${code}`;
  updatePlayerList(players);
}

function updatePlayerList(players) {
  $('player-list').textContent = `${players.length}/${MAX_PLAYERS} · ` + players.map((p) => p.name).join(', ');
}

// ---------- Host ----------
async function startHost() {
  setStatus('Creating room…');
  const world = new World();
  const net = new HostNet({
    onJoin: (id, name) => world.addPlayer(id, name),
    onLeave: (id) => world.removePlayer(id),
    onMessage: (id, msg) => { if (msg?.t === 'input') world.setInput(id, msg.input); },
  });
  const code = await net.start();
  world.addPlayer(HOST_ID, playerName());
  showGame(code, world.snapshot());

  let last = performance.now(), sinceSnapshot = 0;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05); // clamp: avoids huge jumps after tab switches
    last = now;
    world.setInput(HOST_ID, readInput());
    world.step(dt);

    const snap = world.snapshot();
    sinceSnapshot += dt;
    if (sinceSnapshot >= 1 / SNAPSHOT_HZ) {
      sinceSnapshot = 0;
      net.broadcast({ t: 'state', players: snap });
      updatePlayerList(snap);
    }
    render(ctx, snap, HOST_ID);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ---------- Guest ----------
async function startGuest() {
  const code = $('code').value.trim().toUpperCase();
  if (code.length !== 5) return setStatus('Enter the 5-letter room code.');
  setStatus('Joining…');

  let players = [], rejected = null;
  const net = new GuestNet({
    onMessage: (msg) => {
      if (msg?.t === 'state') players = msg.players;
      else if (msg?.t === 'reject') rejected = msg.reason;
    },
    onClose: () => { alert(rejected || 'Disconnected from host.'); location.reload(); },
  });
  const myId = await net.join(code, playerName());
  showGame(code, players);

  let lastSent = '';
  function frame() {
    const input = readInput();
    const key = JSON.stringify(input);
    if (key !== lastSent) { net.send({ t: 'input', input }); lastSent = key; } // only send changes
    render(ctx, players, myId);
    updatePlayerList(players);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function onError(err) {
  const msg = err?.type === 'peer-unavailable' ? 'Room not found.' : `Error: ${err?.message || err}`;
  setStatus(msg);
}

$('host-btn').onclick = () => startHost().catch(onError);
$('join-btn').onclick = () => startGuest().catch(onError);
