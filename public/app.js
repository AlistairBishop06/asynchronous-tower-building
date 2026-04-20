/* global Matter, io */

const {
  Engine,
  World,
  Bodies,
  Body,
  Composite,
  Constraint,
  Runner,
  Query
} = Matter;

const socket = io();

const canvas = document.getElementById("world");
const ctx = canvas.getContext("2d");
const scrollRoot = document.getElementById("scroll-root");
const countEl = document.getElementById("count");

const noteModal = document.getElementById("note-modal");
const noteInput = document.getElementById("note-input");
const noteView = document.getElementById("note-view");
const noteCancel = document.getElementById("note-cancel");
const noteSave = document.getElementById("note-save");
const noteDragButton = document.getElementById("note-drag");

let noteTargetBrick = null;
let noteMode = "edit"; // "edit" | "view"
let stickyNoteDragActive = false;
let stickyNotePointerId = null;
let stickyNoteGhost = null;

const engine = Engine.create();
engine.gravity.y = 1.15;

const runner = Runner.create();
Runner.run(runner, engine);

const worldWidth = () => window.innerWidth;
const groundHeight = 120;
const groundY = () => canvas.height - groundHeight / 2;
const initialWorldHeight = () => window.innerHeight + 600;
let worldHeight = initialWorldHeight();

let basketBounds = { x: 60, y: 0, width: 280, height: 200 };
let buildZone = { xMin: 0, xMax: 0 };
let dragConstraint = null;
let draggingBrick = null;
const placedBrickIds = new Set();
const sessionPlacedBrickIds = new Set();
const brickById = new Map();

const BRICK_WIDTH = 84;
const BRICK_HEIGHT = 24;
const SETTLE_SPEED = 0.18;
const SETTLE_ANGULAR_SPEED = 0.025;
const SETTLE_FRAMES_REQUIRED = 18;
const activeBrickFill = "#ffb25b";
const staticBrickFill = "#e07a2f";

let brickPattern = null;
let brickPatternActive = null;
let grassPattern = null;
let skyNoisePattern = null;
let cautionPattern = null;

function makeNoisePattern({ size = 160, alpha = 0.08, tint = "#ffffff" } = {}) {
  const offscreen = document.createElement("canvas");
  offscreen.width = size;
  offscreen.height = size;
  const offCtx = offscreen.getContext("2d");

  offCtx.clearRect(0, 0, size, size);
  offCtx.globalAlpha = alpha;
  offCtx.fillStyle = tint;
  for (let i = 0; i < size * 2; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() * 1.6 + 0.35;
    offCtx.beginPath();
    offCtx.arc(x, y, r, 0, Math.PI * 2);
    offCtx.fill();
  }
  offCtx.globalAlpha = 1;

  return ctx.createPattern(offscreen, "repeat");
}

function makeBrickPattern({ hueShift = 0, mortarAlpha = 0.18, scale = 1 } = {}) {
  const tileW = Math.round(120 * scale);
  const tileH = Math.round(64 * scale);
  const offscreen = document.createElement("canvas");
  offscreen.width = tileW;
  offscreen.height = tileH;
  const offCtx = offscreen.getContext("2d");

  // Base
  const base = offCtx.createLinearGradient(0, 0, tileW, tileH);
  base.addColorStop(0, `hsl(${26 + hueShift} 78% 58%)`);
  base.addColorStop(0.55, `hsl(${18 + hueShift} 84% 50%)`);
  base.addColorStop(1, `hsl(${12 + hueShift} 88% 45%)`);
  offCtx.fillStyle = base;
  offCtx.fillRect(0, 0, tileW, tileH);

  // Mortar lines
  offCtx.strokeStyle = `rgba(255, 255, 255, ${mortarAlpha})`;
  offCtx.lineWidth = Math.max(2, Math.round(2.2 * scale));
  const rowY = Math.round(tileH * 0.5);
  offCtx.beginPath();
  offCtx.moveTo(0, rowY);
  offCtx.lineTo(tileW, rowY);
  offCtx.stroke();

  const jointX = Math.round(tileW * 0.5);
  offCtx.beginPath();
  offCtx.moveTo(jointX, 0);
  offCtx.lineTo(jointX, rowY);
  offCtx.stroke();
  offCtx.beginPath();
  offCtx.moveTo(jointX * 0.5, rowY);
  offCtx.lineTo(jointX * 0.5, tileH);
  offCtx.stroke();

  // Speckles
  offCtx.globalAlpha = 0.24;
  offCtx.fillStyle = "rgba(40, 16, 6, 0.55)";
  for (let i = 0; i < 80 * scale; i += 1) {
    const x = Math.random() * tileW;
    const y = Math.random() * tileH;
    const w = Math.random() * 1.8 + 0.4;
    const h = Math.random() * 1.8 + 0.4;
    offCtx.fillRect(x, y, w, h);
  }
  offCtx.globalAlpha = 1;

  // Soft highlight
  const sheen = offCtx.createRadialGradient(
    tileW * 0.25,
    tileH * 0.25,
    tileW * 0.05,
    tileW * 0.25,
    tileH * 0.25,
    tileW * 0.85
  );
  sheen.addColorStop(0, "rgba(255,255,255,0.34)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  offCtx.fillStyle = sheen;
  offCtx.fillRect(0, 0, tileW, tileH);

  return ctx.createPattern(offscreen, "repeat");
}

function makeGrassPattern() {
  const size = 140;
  const offscreen = document.createElement("canvas");
  offscreen.width = size;
  offscreen.height = size;
  const offCtx = offscreen.getContext("2d");

  const base = offCtx.createLinearGradient(0, 0, 0, size);
  base.addColorStop(0, "#3ed259");
  base.addColorStop(0.45, "#2fb34b");
  base.addColorStop(1, "#1b7f35");
  offCtx.fillStyle = base;
  offCtx.fillRect(0, 0, size, size);

  for (let i = 0; i < 220; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const length = Math.random() * 14 + 6;
    const tilt = (Math.random() * 0.6 - 0.3) * (Math.PI / 6);

    offCtx.strokeStyle = `rgba(10, 45, 18, ${0.08 + Math.random() * 0.12})`;
    offCtx.lineWidth = 1;
    offCtx.beginPath();
    offCtx.moveTo(x, y);
    offCtx.lineTo(x + Math.sin(tilt) * length, y - Math.cos(tilt) * length);
    offCtx.stroke();
  }

  return ctx.createPattern(offscreen, "repeat");
}

function makeCautionPattern() {
  const w = 160;
  const h = 64;
  const offscreen = document.createElement("canvas");
  offscreen.width = w;
  offscreen.height = h;
  const offCtx = offscreen.getContext("2d");

  offCtx.fillStyle = "#ffd54a";
  offCtx.fillRect(0, 0, w, h);

  offCtx.globalAlpha = 0.92;
  offCtx.fillStyle = "#121212";
  const stripe = 20;
  for (let x = -w; x < w * 2; x += stripe) {
    offCtx.save();
    offCtx.translate(x, 0);
    offCtx.rotate((-22 * Math.PI) / 180);
    offCtx.fillRect(0, -h, stripe / 2, h * 3);
    offCtx.restore();
  }
  offCtx.globalAlpha = 1;

  // Subtle noise
  offCtx.globalAlpha = 0.16;
  offCtx.fillStyle = "rgba(255,255,255,0.9)";
  for (let i = 0; i < 260; i += 1) {
    offCtx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
  }
  offCtx.globalAlpha = 1;

  return ctx.createPattern(offscreen, "repeat");
}

function ensurePatterns() {
  if (!brickPattern) {
    brickPattern = makeBrickPattern({ hueShift: 0, mortarAlpha: 0.18, scale: 1 });
    brickPatternActive = makeBrickPattern({ hueShift: 8, mortarAlpha: 0.14, scale: 1 });
    grassPattern = makeGrassPattern();
    skyNoisePattern = makeNoisePattern({ size: 180, alpha: 0.07, tint: "#ffffff" });
    cautionPattern = makeCautionPattern();
  }
}

function recomputeZones() {
  basketBounds = {
    x: 50,
    y: groundY() - 170,
    width: 290,
    height: 150
  };

  buildZone = {
    xMin: worldWidth() * 0.57,
    xMax: worldWidth() - 70
  };
}

function setupCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = worldHeight;
  ensurePatterns();
  recomputeZones();
  ensureStaticSurfaces();
}

let groundBody = null;
let leftWall = null;
let rightWall = null;

function ensureStaticSurfaces() {
  if (groundBody) {
    World.remove(engine.world, [groundBody, leftWall, rightWall]);
  }

  groundBody = Bodies.rectangle(
    worldWidth() / 2,
    groundY(),
    worldWidth() + 200,
    groundHeight,
    { isStatic: true, friction: 0.9, restitution: 0 }
  );
  leftWall = Bodies.rectangle(-35, worldHeight / 2, 70, worldHeight * 2, {
    isStatic: true
  });
  rightWall = Bodies.rectangle(worldWidth() + 35, worldHeight / 2, 70, worldHeight * 2, {
    isStatic: true
  });

  World.add(engine.world, [groundBody, leftWall, rightWall]);
}

function setCount() {
  countEl.textContent = `Placed: ${placedBrickIds.size}`;
}

function openNoteEditor(brick) {
  noteTargetBrick = brick;
  noteMode = "edit";
  noteModal.classList.remove("is-hidden");
  noteModal.setAttribute("aria-hidden", "false");

  noteView.classList.add("is-hidden");
  noteInput.classList.remove("is-hidden");
  noteSave.classList.remove("is-hidden");
  noteSave.textContent = "Pin note";

  noteInput.value = (brick && brick.plugin && brick.plugin.note) || "";
  noteInput.focus();
  noteInput.setSelectionRange(noteInput.value.length, noteInput.value.length);
}

function openNoteViewer(noteText) {
  noteTargetBrick = null;
  noteMode = "view";
  noteModal.classList.remove("is-hidden");
  noteModal.setAttribute("aria-hidden", "false");

  noteInput.classList.add("is-hidden");
  noteView.classList.remove("is-hidden");
  noteSave.classList.add("is-hidden");
  noteCancel.textContent = "Close";

  noteView.textContent = noteText;
}

function closeNoteModal() {
  noteModal.classList.add("is-hidden");
  noteModal.setAttribute("aria-hidden", "true");
  noteTargetBrick = null;
  noteMode = "edit";
  noteCancel.textContent = "Close";
  noteSave.classList.remove("is-hidden");
  noteInput.classList.remove("is-hidden");
  noteView.classList.add("is-hidden");
}

function maxScrollTop() {
  return Math.max(0, canvas.height - scrollRoot.clientHeight);
}

function clampScrollTop(value) {
  return Math.min(Math.max(0, value), maxScrollTop());
}

function getMouseCanvasPoint(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    // Canvas already moves with the scroll container, so the local point is in world/canvas space.
    y: evt.clientY - rect.top
  };
}

function getClientCanvasPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  };
}

function getSessionPlacedStaticBodies() {
  const bodies = [];
  for (const id of sessionPlacedBrickIds) {
    const body = brickById.get(id);
    if (body && body.isStatic) {
      bodies.push(body);
    }
  }
  return bodies;
}

function findSessionPlacedBrickAtClientPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const insideCanvas =
    clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  if (!insideCanvas) {
    return null;
  }

  const bodies = getSessionPlacedStaticBodies();
  if (!bodies.length) {
    return null;
  }
  const pt = getClientCanvasPoint(clientX, clientY);
  return Query.point(bodies, pt)[0] || null;
}

function createActiveBrick() {
  const startX = basketBounds.x + basketBounds.width / 2 + (Math.random() * 18 - 9);
  const startY = basketBounds.y + basketBounds.height / 2;
  const brick = Bodies.rectangle(startX, startY, BRICK_WIDTH, BRICK_HEIGHT, {
    friction: 0.85,
    restitution: 0.05,
    density: 0.0026
  });
  brick.plugin.w = BRICK_WIDTH;
  brick.plugin.h = BRICK_HEIGHT;
  brick.plugin.note = undefined;
  World.add(engine.world, brick);
  return brick;
}

function beginDragging(brick, cursorPoint) {
  draggingBrick = brick;

  dragConstraint = Constraint.create({
    pointA: { x: cursorPoint.x, y: cursorPoint.y },
    bodyB: brick,
    pointB: { x: 0, y: 0 },
    length: 0,
    stiffness: 0.0025,
    damping: 0.13
  });
  World.add(engine.world, dragConstraint);
}

function endDragging() {
  if (!draggingBrick) {
    return;
  }

  const brick = draggingBrick;
  const w = brick.plugin.w || BRICK_WIDTH;
  const insideBuildZone =
    brick.position.x >= buildZone.xMin + w / 2 && brick.position.x <= buildZone.xMax - w / 2;

  if (insideBuildZone) {
    const id = brick.plugin.brickId || crypto.randomUUID();
    brick.plugin.brickId = id;
    brick.plugin.pendingPlacement = true;
    brick.plugin.settleFrames = 0;
    maybeExpandWorldForY(brick.position.y);
  } else {
    World.remove(engine.world, brick);
  }

  if (dragConstraint) {
    World.remove(engine.world, dragConstraint);
    dragConstraint = null;
  }
  draggingBrick = null;
}

function addPlacedBrick(brickData) {
  if (placedBrickIds.has(brickData.id)) {
    return;
  }
  const width = brickData.width || BRICK_WIDTH;
  const height = brickData.height || BRICK_HEIGHT;
  const brick = Bodies.rectangle(
    brickData.x,
    brickData.y,
    width,
    height,
    { isStatic: true, friction: 0.9 }
  );
  brick.plugin.brickId = brickData.id;
  brick.plugin.w = width;
  brick.plugin.h = height;
  brick.plugin.note = typeof brickData.note === "string" && brickData.note.trim() ? brickData.note : undefined;
  Body.setAngle(brick, brickData.angle || 0);
  World.add(engine.world, brick);
  brickById.set(brickData.id, brick);
  placedBrickIds.add(brickData.id);
  setCount();
  maybeExpandWorldForY(brickData.y);
}

function maybeExpandWorldForY(y) {
  const topHeadroom = 260;
  if (y > topHeadroom) {
    return;
  }

  const growth = Math.ceil((topHeadroom - y + 420) / 500) * 500;
  const previousHeight = worldHeight;
  worldHeight += growth;

  // Add space above existing scene so the ground stays the absolute bottom.
  const allBodies = Composite.allBodies(engine.world);
  allBodies.forEach((body) => {
    Body.setPosition(body, {
      x: body.position.x,
      y: body.position.y + growth
    });
  });

  if (dragConstraint) {
    dragConstraint.pointA.y += growth;
  }

  canvas.height = worldHeight;
  ensurePatterns();
  recomputeZones();
  ensureStaticSurfaces();
  scrollRoot.scrollTop = clampScrollTop(scrollRoot.scrollTop + (worldHeight - previousHeight));
}

function roundRectPath(x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawBrickBody(body, fill, pattern) {
  const w = body.plugin.w || BRICK_WIDTH;
  const h = body.plugin.h || BRICK_HEIGHT;
  const r = Math.max(3, Math.min(7, h * 0.35));

  ctx.save();
  ctx.translate(body.position.x, body.position.y);
  ctx.rotate(body.angle);

  roundRectPath(-w / 2, -h / 2, w, h, r);

  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fill();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = fill;
    ctx.fill();
  }

  // Bevel + sheen
  const bevel = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  bevel.addColorStop(0, "rgba(255, 255, 255, 0.46)");
  bevel.addColorStop(0.42, "rgba(255, 255, 255, 0)");
  bevel.addColorStop(1, "rgba(0, 0, 0, 0.18)");
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = bevel;
  ctx.fill();
  ctx.globalAlpha = 1;

  // Sticky note badge (if any)
  if (body.plugin.note) {
    const noteW = Math.min(28, w * 0.36);
    const noteH = Math.min(18, h * 0.9);
    const nx = -w / 2 + 6;
    const ny = -h / 2 + 4;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;

    const noteGrad = ctx.createLinearGradient(nx, ny, nx + noteW, ny + noteH);
    noteGrad.addColorStop(0, "#fff1a8");
    noteGrad.addColorStop(1, "#ffd77a");
    ctx.fillStyle = noteGrad;
    roundRectPath(nx, ny, noteW, noteH, 5);
    ctx.fill();

    // Folded corner
    ctx.shadowColor = "transparent";
    ctx.beginPath();
    ctx.moveTo(nx + noteW - 8, ny);
    ctx.lineTo(nx + noteW, ny);
    ctx.lineTo(nx + noteW, ny + 8);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fill();

    // Pin dot
    ctx.beginPath();
    ctx.arc(nx + 6.5, ny + 6.5, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 108, 204, 0.9)";
    ctx.fill();

    // Tiny scribble
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = "rgba(8, 34, 53, 0.55)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(nx + 9, ny + 11);
    ctx.lineTo(nx + noteW - 6, ny + 11);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  ctx.shadowColor = "rgba(0, 0, 0, 0.16)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.strokeStyle = "rgba(92, 43, 14, 0.78)";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();
}

function drawBrickHighlight(body) {
  const w = body.plugin.w || BRICK_WIDTH;
  const h = body.plugin.h || BRICK_HEIGHT;
  const r = Math.max(3, Math.min(7, h * 0.35)) + 3;

  ctx.save();
  ctx.translate(body.position.x, body.position.y);
  ctx.rotate(body.angle);

  ctx.shadowColor = "rgba(255, 205, 61, 0.55)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = "rgba(255, 241, 168, 0.95)";

  roundRectPath(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, r);
  ctx.stroke();

  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "rgba(255, 205, 61, 0.9)";
  ctx.fill();

  ctx.restore();
}

function drawStickyNoteEligibleHighlights() {
  if (!stickyNoteDragActive) {
    return;
  }
  const bodies = getSessionPlacedStaticBodies();
  for (const body of bodies) {
    drawBrickHighlight(body);
  }
}

function drawBackground() {
  const skyGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  skyGradient.addColorStop(0, "#5fc3ff");
  skyGradient.addColorStop(0.6, "#b6edff");
  skyGradient.addColorStop(1, "#e6fcff");
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Soft cloud bands
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  for (let i = 0; i < 8; i += 1) {
    const y = 90 + i * 190;
    ctx.beginPath();
    ctx.ellipse(canvas.width * 0.18, y, 160, 34, 0, 0, Math.PI * 2);
    ctx.ellipse(canvas.width * 0.44, y + 12, 210, 42, 0, 0, Math.PI * 2);
    ctx.ellipse(canvas.width * 0.72, y - 8, 190, 38, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Sky grain
  if (skyNoisePattern) {
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = skyNoisePattern;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  // Ground
  ctx.save();
  ctx.fillStyle = grassPattern || "#2fb34b";
  ctx.fillRect(0, canvas.height - groundHeight, canvas.width, groundHeight);

  // Ground shadow line
  const groundTop = canvas.height - groundHeight;
  const groundShade = ctx.createLinearGradient(0, groundTop, 0, groundTop + 34);
  groundShade.addColorStop(0, "rgba(0,0,0,0.25)");
  groundShade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = groundShade;
  ctx.fillRect(0, groundTop, canvas.width, 44);
  ctx.restore();
}

function drawZones() {
  const groundTop = canvas.height - groundHeight;

  // Basket
  ctx.save();
  const basketGradient = ctx.createLinearGradient(
    basketBounds.x,
    basketBounds.y,
    basketBounds.x + basketBounds.width,
    basketBounds.y + basketBounds.height
  );
  basketGradient.addColorStop(0, "#a36b3a");
  basketGradient.addColorStop(0.55, "#8a552a");
  basketGradient.addColorStop(1, "#5a361a");

  // Shadow + depth
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = basketGradient;
  ctx.fillRect(basketBounds.x, basketBounds.y, basketBounds.width, basketBounds.height);
  ctx.shadowColor = "transparent";

  // Inner lip
  const lipH = 16;
  const lipGrad = ctx.createLinearGradient(0, basketBounds.y, 0, basketBounds.y + lipH);
  lipGrad.addColorStop(0, "rgba(255,255,255,0.26)");
  lipGrad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = lipGrad;
  ctx.fillRect(basketBounds.x, basketBounds.y, basketBounds.width, lipH);

  // Planks
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = "rgba(25, 10, 3, 0.6)";
  ctx.lineWidth = 3;
  for (let x = basketBounds.x + 22; x < basketBounds.x + basketBounds.width; x += 46) {
    ctx.beginPath();
    ctx.moveTo(x, basketBounds.y + 10);
    ctx.lineTo(x, basketBounds.y + basketBounds.height - 10);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(44, 20, 7, 0.65)";
  ctx.lineWidth = 2.5;
  ctx.strokeRect(basketBounds.x, basketBounds.y, basketBounds.width, basketBounds.height);
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.font = "800 16px ui-rounded, Segoe UI, Arial";
  ctx.fillText("Brick Basket", basketBounds.x + 14, basketBounds.y + 28);

  // Little brick pile preview
  ctx.save();
  ctx.beginPath();
  ctx.rect(basketBounds.x + 10, basketBounds.y + 38, basketBounds.width - 20, basketBounds.height - 48);
  ctx.clip();
  for (let i = 0; i < 6; i += 1) {
    const bx = basketBounds.x + 64 + i * 34;
    const by = basketBounds.y + basketBounds.height - 28 - (i % 2) * 10;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(((-6 + i * 2) * Math.PI) / 180);
    roundRectPath(-22, -9, 44, 18, 5);
    ctx.fillStyle = brickPatternActive || activeBrickFill;
    ctx.fill();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = activeBrickFill;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(92, 43, 14, 0.65)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  ctx.restore();

  // Build zone
  const zoneGrad = ctx.createLinearGradient(buildZone.xMin, 0, buildZone.xMax, 0);
  zoneGrad.addColorStop(0, "rgba(255, 255, 255, 0.2)");
  zoneGrad.addColorStop(1, "rgba(255, 255, 255, 0.08)");
  ctx.fillStyle = zoneGrad;
  ctx.fillRect(buildZone.xMin, 0, buildZone.xMax - buildZone.xMin, canvas.height);
  ctx.strokeStyle = "rgba(21, 45, 66, 0.4)";
  ctx.setLineDash([8, 8]);
  ctx.lineWidth = 1.8;
  ctx.strokeRect(buildZone.xMin, 0, buildZone.xMax - buildZone.xMin, canvas.height);
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(15, 47, 74, 0.9)";
  ctx.font = "700 16px Inter, Segoe UI, Arial";
  ctx.fillText("Build Zone", buildZone.xMin + 12, 36);

  // Ground decorations: caution tape + signs around build zone.
  const postYTop = groundTop + 18;
  const postYBottom = groundTop + groundHeight - 12;
  const postW = 10;
  const postInset = 16;
  const leftPostX = buildZone.xMin + postInset;
  const rightPostX = buildZone.xMax - postInset;

  function drawPost(x) {
    ctx.save();
    const metal = ctx.createLinearGradient(x, postYTop, x, postYBottom);
    metal.addColorStop(0, "#c9d3dd");
    metal.addColorStop(0.45, "#7f8e9d");
    metal.addColorStop(1, "#44515e");
    ctx.fillStyle = metal;
    roundRectPath(x - postW / 2, postYTop, postW, postYBottom - postYTop, 4);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillRect(x - postW / 2 + 2, postYTop + 6, 2, postYBottom - postYTop - 12);
    ctx.restore();
  }

  drawPost(leftPostX);
  drawPost(rightPostX);

  // Tape line
  ctx.save();
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.strokeStyle = cautionPattern || "#ffd54a";
  ctx.beginPath();
  ctx.moveTo(leftPostX, groundTop + 44);
  ctx.lineTo(rightPostX, groundTop + 34);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.moveTo(leftPostX, groundTop + 49);
  ctx.lineTo(rightPostX, groundTop + 39);
  ctx.stroke();
  ctx.restore();

  function drawSign(x, label, sublabel) {
    ctx.save();
    const poleH = 62;
    ctx.fillStyle = "rgba(65, 52, 35, 0.75)";
    roundRectPath(x - 4, groundTop + 52, 8, poleH, 3);
    ctx.fill();

    const boardW = 160;
    const boardH = 52;
    const boardX = x - boardW / 2;
    const boardY = groundTop + 18;
    const boardGrad = ctx.createLinearGradient(boardX, boardY, boardX + boardW, boardY + boardH);
    boardGrad.addColorStop(0, "#fff7df");
    boardGrad.addColorStop(1, "#ffe2a6");
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = boardGrad;
    roundRectPath(boardX, boardY, boardW, boardH, 12);
    ctx.fill();
    ctx.shadowColor = "transparent";

    ctx.strokeStyle = "rgba(8, 34, 53, 0.22)";
    ctx.lineWidth = 2;
    roundRectPath(boardX, boardY, boardW, boardH, 12);
    ctx.stroke();

    ctx.fillStyle = "rgba(8, 34, 53, 0.92)";
    ctx.font = "900 14px ui-rounded, Segoe UI, Arial";
    ctx.fillText(label, boardX + 14, boardY + 22);
    ctx.globalAlpha = 0.82;
    ctx.font = "800 12px ui-rounded, Segoe UI, Arial";
    ctx.fillText(sublabel, boardX + 14, boardY + 40);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawSign(buildZone.xMin + 130, "CAUTION", "Build zone boundary");
  drawSign(buildZone.xMax - 150, "HARD HATS", "Tower work ahead");
}

function drawConstraintLine() {
  if (!dragConstraint || !draggingBrick) {
    return;
  }
  ctx.beginPath();
  ctx.moveTo(dragConstraint.pointA.x, dragConstraint.pointA.y);
  ctx.lineTo(draggingBrick.position.x, draggingBrick.position.y);
  const grad = ctx.createLinearGradient(
    dragConstraint.pointA.x,
    dragConstraint.pointA.y,
    draggingBrick.position.x,
    draggingBrick.position.y
  );
  grad.addColorStop(0, "rgba(255, 255, 255, 0.9)");
  grad.addColorStop(0.45, "rgba(255, 214, 92, 0.95)");
  grad.addColorStop(1, "rgba(255, 108, 204, 0.9)");
  ctx.strokeStyle = grad;
  ctx.lineWidth = 2.6;
  ctx.stroke();
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  drawBackground();
  drawZones();

  const bodies = Composite.allBodies(engine.world);
  for (const body of bodies) {
    if (body.isSensor || body === groundBody || body === leftWall || body === rightWall) {
      continue;
    }
    drawBrickBody(
      body,
      body.isStatic ? staticBrickFill : activeBrickFill,
      body.isStatic ? brickPattern : brickPatternActive
    );
  }
  drawConstraintLine();
  drawStickyNoteEligibleHighlights();

  requestAnimationFrame(render);
}

function ensureStickyNoteGhost() {
  if (stickyNoteGhost) {
    return stickyNoteGhost;
  }
  if (!noteDragButton) {
    return null;
  }

  stickyNoteGhost = noteDragButton.cloneNode(true);
  stickyNoteGhost.removeAttribute("id");
  stickyNoteGhost.classList.add("note-sticky-ghost");
  document.body.appendChild(stickyNoteGhost);
  return stickyNoteGhost;
}

function setStickyNoteGhostPos(clientX, clientY) {
  const ghost = ensureStickyNoteGhost();
  if (!ghost) {
    return;
  }
  ghost.style.left = `${clientX}px`;
  ghost.style.top = `${clientY}px`;
}

function clearStickyNoteGhost() {
  if (!stickyNoteGhost) {
    return;
  }
  stickyNoteGhost.remove();
  stickyNoteGhost = null;
}

function startStickyNoteDrag(evt) {
  if (!noteDragButton) {
    return;
  }
  if (!noteModal.classList.contains("is-hidden")) {
    return;
  }

  stickyNoteDragActive = true;
  stickyNotePointerId = evt.pointerId;
  document.body.classList.add("is-dragging-note");
  noteDragButton.setPointerCapture(evt.pointerId);
  setStickyNoteGhostPos(evt.clientX, evt.clientY);
}

function endStickyNoteDrag(evt) {
  if (!stickyNoteDragActive || evt.pointerId !== stickyNotePointerId) {
    return;
  }

  const hit = findSessionPlacedBrickAtClientPoint(evt.clientX, evt.clientY);

  stickyNoteDragActive = false;
  stickyNotePointerId = null;
  document.body.classList.remove("is-dragging-note");
  clearStickyNoteGhost();

  if (hit) {
    openNoteEditor(hit);
  }
}

function cancelStickyNoteDrag(evt) {
  if (!stickyNoteDragActive || evt.pointerId !== stickyNotePointerId) {
    return;
  }
  stickyNoteDragActive = false;
  stickyNotePointerId = null;
  document.body.classList.remove("is-dragging-note");
  clearStickyNoteGhost();
}

if (noteDragButton) {
  noteDragButton.addEventListener("pointerdown", (evt) => {
    evt.preventDefault();
    startStickyNoteDrag(evt);
  });
  noteDragButton.addEventListener("pointermove", (evt) => {
    if (!stickyNoteDragActive || evt.pointerId !== stickyNotePointerId) {
      return;
    }
    setStickyNoteGhostPos(evt.clientX, evt.clientY);
  });
  noteDragButton.addEventListener("pointerup", (evt) => {
    endStickyNoteDrag(evt);
  });
  noteDragButton.addEventListener("pointercancel", (evt) => {
    cancelStickyNoteDrag(evt);
  });
}

canvas.addEventListener("mousedown", (evt) => {
  if (!noteModal.classList.contains("is-hidden")) {
    return;
  }
  const pt = getMouseCanvasPoint(evt);

  if (
    pt.x >= basketBounds.x &&
    pt.x <= basketBounds.x + basketBounds.width &&
    pt.y >= basketBounds.y &&
    pt.y <= basketBounds.y + basketBounds.height
  ) {
    const brick = createActiveBrick();
    beginDragging(brick, pt);
  } else {
    const staticBodies = Composite.allBodies(engine.world).filter(
      (b) => b.isStatic && b !== groundBody && b !== leftWall && b !== rightWall
    );
    const staticHit = Query.point(staticBodies, pt)[0];
    if (staticHit && staticHit.plugin && staticHit.plugin.note) {
      openNoteViewer(staticHit.plugin.note);
      return;
    }

    const bodies = Composite.allBodies(engine.world).filter((b) => !b.isStatic);
    const hit = Query.point(bodies, pt)[0];
    if (hit) {
      beginDragging(hit, pt);
    }
  }
});

canvas.addEventListener("mousemove", (evt) => {
  const pt = getMouseCanvasPoint(evt);
  if (dragConstraint) {
    dragConstraint.pointA.x = pt.x;
    dragConstraint.pointA.y = pt.y;
    maybeExpandWorldForY(pt.y);
  }
});

window.addEventListener("mouseup", () => {
  endDragging();
});

window.addEventListener("resize", () => {
  const prevHeight = canvas.height;
  const nextMin = Math.max(window.innerHeight + 600, 1400);
  worldHeight = Math.max(prevHeight, nextMin);
  setupCanvas();
  scrollToGround();
});

noteCancel.addEventListener("click", () => {
  closeNoteModal();
});

noteSave.addEventListener("click", () => {
  if (noteMode !== "edit" || !noteTargetBrick) {
    closeNoteModal();
    return;
  }

  const text = String(noteInput.value || "").trim().slice(0, 220);
  noteTargetBrick.plugin.note = text || undefined;
  const id = noteTargetBrick.plugin && noteTargetBrick.plugin.brickId;
  if (id) {
    socket.emit("brick:note", { id, note: text || undefined });
  }
  closeNoteModal();
});

noteModal.addEventListener("click", (evt) => {
  const target = evt.target;
  if (target && target.dataset && target.dataset.close) {
    closeNoteModal();
  }
});

window.addEventListener("keydown", (evt) => {
  if (evt.key === "Escape" && !noteModal.classList.contains("is-hidden")) {
    evt.preventDefault();
    closeNoteModal();
    return;
  }
});

function scrollToGround() {
  scrollRoot.scrollTop = maxScrollTop();
}

scrollRoot.addEventListener("scroll", () => {
  const next = clampScrollTop(scrollRoot.scrollTop);
  if (scrollRoot.scrollTop !== next) scrollRoot.scrollTop = next;
});

// Prevent "elastic" / momentum overscroll past the ground (which can desync the DOM scroll position
// from the camera clamp and look glitchy).
const SCROLL_EPS = 1;
scrollRoot.addEventListener(
  "wheel",
  (evt) => {
    const max = maxScrollTop();
    const atBottom = scrollRoot.scrollTop >= max - SCROLL_EPS;
    if (evt.deltaY > 0 && atBottom) {
      scrollRoot.scrollTop = max;
      evt.preventDefault();
    }
  },
  { passive: false }
);

function finalizePlacedBrick(brick) {
  if (brick.isStatic || !brick.plugin.pendingPlacement) {
    return;
  }

  const w = brick.plugin.w || BRICK_WIDTH;
  const h = brick.plugin.h || BRICK_HEIGHT;
  const insideBuildZone =
    brick.position.x >= buildZone.xMin + w / 2 && brick.position.x <= buildZone.xMax - w / 2;

  // If it swung outside after you let go, don't lock it out of bounds.
  if (!insideBuildZone) {
    brick.plugin.pendingPlacement = false;
    World.remove(engine.world, brick);
    return;
  }

  Body.setStatic(brick, true);
  brick.plugin.pendingPlacement = false;

  const id = brick.plugin.brickId || crypto.randomUUID();
  brick.plugin.brickId = id;
  brickById.set(id, brick);
  sessionPlacedBrickIds.add(id);

  if (!placedBrickIds.has(id)) {
    placedBrickIds.add(id);
    setCount();
  }

  socket.emit("brick:place", {
    id,
    x: brick.position.x,
    y: brick.position.y,
    angle: brick.angle,
    width: w,
    height: h,
    note: typeof brick.plugin.note === "string" && brick.plugin.note.trim() ? brick.plugin.note : undefined
  });
}

Matter.Events.on(engine, "afterUpdate", () => {
  const bodies = Composite.allBodies(engine.world);
  for (const body of bodies) {
    if (body.isStatic || !body.plugin.pendingPlacement) {
      continue;
    }
    const speed = body.speed;
    const angularSpeed = Math.abs(body.angularVelocity);
    if (speed < SETTLE_SPEED && angularSpeed < SETTLE_ANGULAR_SPEED) {
      body.plugin.settleFrames = (body.plugin.settleFrames || 0) + 1;
      if (body.plugin.settleFrames >= SETTLE_FRAMES_REQUIRED) {
        finalizePlacedBrick(body);
      }
    } else {
      body.plugin.settleFrames = 0;
    }
  }
});

socket.on("tower:init", (bricks) => {
  bricks.forEach(addPlacedBrick);
  scrollToGround();
});

socket.on("brick:placed", (brick) => {
  addPlacedBrick(brick);
});

socket.on("brick:noted", (payload) => {
  if (!payload || typeof payload.id !== "string") {
    return;
  }
  const body = brickById.get(payload.id);
  if (!body || !body.plugin) {
    return;
  }
  const raw = typeof payload.note === "string" ? payload.note : "";
  const text = raw.trim().slice(0, 220);
  body.plugin.note = text || undefined;
});

worldHeight = initialWorldHeight();
setupCanvas();
setCount();
scrollToGround();
render();
