// Entry point: lobby UI, networking setup, then boots Phaser with the GameScene.
import { HostNet, GuestNet, MAX_PLAYERS } from './net.js';
import { WIDTH, HEIGHT } from './config.js';
import { GameScene } from './scenes/GameScene.js';
import { keepRunningWhenHidden } from './background-ticker.js';

const $ = (id) => document.getElementById(id);
const HOST_ID = 'host';
// Level to play: ?level=gym opens the Ability Gym (developer test room); default is the Awakening.
const LEVEL_KEY = new URLSearchParams(location.search).get('level') === 'gym' ? 'gym' : 'awakening';

function setStatus(text) { $('status').textContent = text; }
function playerName() { return $('name').value.trim() || 'Player'; }

function updatePlayerList(players) {
  $('player-list').textContent = `${players.length}/${MAX_PLAYERS} · ` + players.map((p) => p.name).join(', ');
}

/** Shows the game screen and starts Phaser. Resolves with the running GameScene. */
function bootGame(code, sceneData) {
  $('lobby').hidden = true;
  $('game').hidden = false;
  $('room-label').textContent = `Room: ${code}`;

  return new Promise((resolve) => {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game-container',
      width: WIDTH,
      height: HEIGHT,
      backgroundColor: '#000000',
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
      // fixedStep: false -> one physics step per rendered frame, so motion matches the
      // monitor's refresh rate (no 0/2-step stutter). Only the host simulates.
      physics: { default: 'arcade', arcade: { debug: false, fixedStep: false } },
      scene: [],
    });
    // The scene calls onReady at the end of create(); listening for its 'create'
    // event here would be too late, because scene.add() can create it synchronously.
    if (sceneData.role === 'host') keepRunningWhenHidden(game);
    game.events.once('ready', () => {
      game.scene.add('game', GameScene, true, { ...sceneData, onPlayers: updatePlayerList, onReady: resolve });
    });
  });
}

// ---------- Host ----------
async function startHost() {
  setStatus('Creating room…');
  let scene = null;
  const pending = []; // net events that arrive before the scene exists
  const run = (fn) => (scene ? fn(scene) : pending.push(fn));

  const net = new HostNet({
    onJoin: (id, name) => {
      net.send(id, { t: 'welcome', level: LEVEL_KEY });   // guests load the host's level
      run((s) => s.addPlayer(id, name));
    },
    onLeave: (id) => run((s) => s.removePlayer(id)),
    onMessage: (id, msg) => {
      if (msg?.t === 'input') run((s) => s.setInput(id, msg.input));
      else if (msg?.t === 'role' && typeof msg.role === 'string') run((s) => s.setRole(id, msg.role)); // dev: role switch
      else if (msg?.t === 'dev' && msg.action === 'spawn') run((s) => s.devSpawn(id));                 // dev: dummy
      else if (msg?.t === 'dev' && msg.action === 'cycle') run((s) => net.send(id, { t: 'control', id: s.devCycle(id) }));
    },
  });
  const code = await net.start();
  scene = await bootGame(code, { role: 'host', net, myId: HOST_ID, myName: playerName(), levelKey: LEVEL_KEY });
  pending.forEach((fn) => fn(scene));
}

// ---------- Guest ----------
async function startGuest() {
  const code = $('code').value.trim().toUpperCase();
  if (code.length !== 5) return setStatus('Enter the 5-letter room code.');
  setStatus('Joining…');

  let scene = null, rejected = null, gotWelcome;
  const welcome = new Promise((resolve) => { gotWelcome = resolve; });
  const net = new GuestNet({
    onMessage: (msg) => {
      if (msg?.t === 'welcome') gotWelcome(msg.level);
      else if (msg?.t === 'state') scene?.applySnapshot(msg); // snapshots before boot are simply skipped
      else if (msg?.t === 'control' && typeof msg.id === 'string') scene?.setLocalControl(msg.id);
      else if (msg?.t === 'reject') rejected = msg.reason;
    },
    onClose: () => { alert(rejected || 'Disconnected from host.'); location.reload(); },
  });
  const myId = await net.join(code, playerName());
  const levelKey = await welcome;
  scene = await bootGame(code, { role: 'guest', net, myId, myName: playerName(), levelKey });
}

function onError(err) {
  const msg = err?.type === 'peer-unavailable' ? 'Room not found.' : `Error: ${err?.message || err}`;
  setStatus(msg);
}

$('host-btn').onclick = () => startHost().catch(onError);
$('join-btn').onclick = () => startGuest().catch(onError);
