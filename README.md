# 🧱 Tower of Bricks

A real-time collaborative physics-based brick stacking game. Players drag bricks from a basket and drop them into a shared build zone, constructing a tower together — live, across sessions.

---

## What It Does

- **Drag bricks** from a basket on the left using click-and-drag with a physics spring constraint
- **Drop them** into the build zone on the right — bricks settle with realistic gravity, collision, and rotation
- **Permanent placement** — bricks dropped in the zone become static and are saved to the database
- **Live sync** — all connected users see the same tower update in real time via WebSockets
- **Infinite upward growth** — the viewport scrolls as the tower climbs

---

## Tech Stack

| Layer | Technology |
|---|---|
| Physics | [Matter.js](https://brm.io/matter-js/) |
| Rendering | HTML5 Canvas |
| Frontend | Vanilla JavaScript |
| Backend | Node.js + Express |
| Real-time | Socket.io |
| Database | MongoDB (or PostgreSQL) |

---

## Project Structure

```
tower-of-bricks/
├── client/
│   ├── index.html
│   ├── game.js          # Canvas rendering + Matter.js physics
│   ├── input.js         # Drag, spring constraint, drop logic
│   ├── camera.js        # Vertical scroll / camera pan
│   └── socket.js        # WebSocket client, sync logic
├── server/
│   ├── index.js         # Express + Socket.io server
│   ├── db.js            # Database connection + queries
│   └── bricks.js        # Brick CRUD routes
├── shared/
│   └── constants.js     # Build zone bounds, brick dimensions
├── package.json
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js v18+
- MongoDB (local or Atlas) or PostgreSQL

### Installation

```bash
git clone https://github.com/your-username/tower-of-bricks.git
cd tower-of-bricks
npm install
```

### Configuration

Create a `.env` file in the root:

```env
PORT=3000
DATABASE_URL=mongodb://localhost:27017/tower-of-bricks
# or for PostgreSQL:
# DATABASE_URL=postgresql://user:password@localhost:5432/tower_of_bricks
```

### Run

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

Open `http://localhost:3000` in multiple browser tabs to test real-time collaboration.

---

## How It Works

### Physics

Matter.js drives all simulation. Bricks in flight are dynamic bodies with gravity, momentum, and collision. Once a brick settles in the build zone, it is converted to a **static body** — it participates in collisions but is no longer simulated, keeping performance stable as the tower grows.

### Drag Mechanics

A spring constraint connects the cursor to the grabbed brick. The constraint length and stiffness are tuned to give a natural pendulum/rope feel. On mouse-up:

- **Inside build zone** → brick becomes static, saved, broadcast to all clients
- **Outside build zone** → brick is removed from simulation

### Build Zone

The zone has fixed left/right bounds defined in `shared/constants.js`. Bricks released outside these bounds horizontally are discarded. The zone extends infinitely upward — the camera pans as needed.

### Real-Time Sync

On connection, the server sends the full brick list so new users load the current tower. Every new static placement emits a `brick:placed` event to all other sockets. Each brick record stores:

```json
{
  "id": "uuid",
  "x": 412.5,
  "y": 890.0,
  "angle": 0.04,
  "width": 60,
  "height": 24,
  "color": "#c0392b",
  "placedAt": "2026-04-19T14:32:00Z"
}
```

### Performance

- Only newly placed or actively dragged bricks run full physics
- All previously settled bricks are static — zero simulation cost
- Canvas rendering skips off-screen bricks using camera bounds culling

---

## Build Zone Boundaries

Defined in `shared/constants.js`:

```js
export const BUILD_ZONE = {
  left: 500,   // px from canvas left edge
  right: 900,  // px from canvas left edge
  groundY: 750 // px from canvas top (grass level)
};
```

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-change`
3. Commit your changes: `git commit -m 'Add my change'`
4. Push and open a pull request

---

## License

MIT
