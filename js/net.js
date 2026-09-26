// Networking layer: wraps PeerJS so the rest of the game only deals with
// "send a message" / "a message arrived". The host's browser acts as the server.

const ID_PREFIX = 'hasgames-';   // namespaces our room codes on the public signaling server
export const MAX_PLAYERS = 4;

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid typos
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/**
 * Host: accepts up to MAX_PLAYERS - 1 guests.
 * Callbacks: onJoin(peerId, name), onLeave(peerId), onMessage(peerId, msg)
 */
export class HostNet {
  constructor({ onJoin, onLeave, onMessage }) {
    this.handlers = { onJoin, onLeave, onMessage };
    this.conns = new Map(); // peerId -> DataConnection
  }

  /** Resolves with the room code once registered with the signaling server. */
  start() {
    return new Promise((resolve, reject) => {
      const code = randomCode();
      this.peer = new Peer(ID_PREFIX + code);
      this.peer.on('open', () => resolve(code));
      this.peer.on('error', reject);
      this.peer.on('connection', (conn) => this.#accept(conn));
    });
  }

  #accept(conn) {
    conn.on('open', () => {
      if (this.conns.size >= MAX_PLAYERS - 1) {
        conn.send({ t: 'reject', reason: 'Room is full' });
        setTimeout(() => conn.close(), 200); // let the message flush first
        return;
      }
      this.conns.set(conn.peer, conn);
      const name = String(conn.metadata?.name || 'Player').slice(0, 12);
      this.handlers.onJoin(conn.peer, name);
    });
    conn.on('data', (msg) => {
      if (this.conns.has(conn.peer)) this.handlers.onMessage(conn.peer, msg);
    });
    conn.on('close', () => {
      if (this.conns.delete(conn.peer)) this.handlers.onLeave(conn.peer);
    });
  }

  send(peerId, msg) { this.conns.get(peerId)?.send(msg); }
  broadcast(msg) { for (const c of this.conns.values()) c.send(msg); }
}

/** Guest: one connection to the host. Callbacks: onMessage(msg), onClose() */
export class GuestNet {
  constructor({ onMessage, onClose }) {
    this.handlers = { onMessage, onClose };
  }

  join(code, name) {
    return new Promise((resolve, reject) => {
      this.peer = new Peer();
      this.peer.on('error', reject);
      this.peer.on('open', () => {
        this.conn = this.peer.connect(ID_PREFIX + code.toUpperCase(),
          { serialization: 'json', metadata: { name } });
        this.conn.on('open', () => resolve(this.peer.id));
        this.conn.on('data', (msg) => this.handlers.onMessage(msg));
        this.conn.on('close', () => this.handlers.onClose());
      });
    });
  }

  send(msg) { this.conn?.send(msg); }
}
