import { Chess, SQUARES } from "chess.js";
import { Chessground } from "chessground";

import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
//import "chessground/assets/chessground.cburnett.css";

import { initEngine, getBestMove } from "./engine.js";

const game = new Chess();
initEngine();

const boardElement = document.getElementById("board");
const boardWrapElement = document.getElementById("board-wrap");
const statusElement = document.getElementById("status");
const botStatusTextElement = document.getElementById("botStatusText");
const evalFillElement = document.getElementById("eval-fill");
const evalScoreElement = document.getElementById("eval-score");

const historyElement = document.getElementById("history");
const newGameBtn = document.getElementById("newGame");
const undoBtn = document.getElementById("undo");
const hintBtn = document.getElementById("hint");
const hintTextElement = document.getElementById("hintText");

const confirmModal = document.getElementById("confirmModal");
const confirmNewGameBtn = document.getElementById("confirmNewGame");
const cancelNewGameBtn = document.getElementById("cancelNewGame");

const SOUND_BASE = `${import.meta.env.BASE_URL}sounds/`;

const sound = {
  move: new Audio(`${SOUND_BASE}Move.mp3`),
  capture: new Audio(`${SOUND_BASE}Capture.mp3`),
  check: new Audio(`${SOUND_BASE}Check.mp3`),
};

const userStatusDot = document.querySelector(".user-card .status-dot");
const botStatusDot = document.querySelector(".bot-card .status-dot");

const botNameElement = document.querySelector(".bot-card .player-name");

const settingsModal = document.getElementById("settingsModal");
const boardThemeSelect = document.getElementById("boardThemeSelect");
const closeSettingsBtn = document.getElementById("closeSettings");
const menuIcon = document.querySelector(".menu-icon");

function setStatus(dot, state) {
  if (!dot) return;
  dot.classList.remove("online", "thinking", "offline");
  dot.classList.add(state);
}

// DEFAULT STATUS (INI PATCH 1)
setStatus(userStatusDot, "online");
setStatus(botStatusDot, "online");

let audioUnlocked = false;

function unlockAudio() {
  if (audioUnlocked) return;

  Object.values(sound).forEach((s) => {
    s.volume = 0.65;
    s.preload = "auto";
    s.load();
  });

  audioUnlocked = true;
}

function playSound(type) {
  unlockAudio();

  const s = sound[type];
  if (!s) return;

  s.currentTime = 0;
  s.play().catch((err) => {
    console.warn("Sound blocked or missing:", type, s.src, err);
  });
}

window.addEventListener("pointerdown", unlockAudio, { once: true });

function playMoveSound(move) {
  if (game.inCheck()) {
    playSound("check");
  } else if (move?.captured) {
    playSound("capture");
  } else {
    playSound("move");
  }
}

let engineThinking = false;
let BOT_LEVEL = 3;
let lastMove = null;
let lastEval = { type: "cp", value: 0 };
let hintShape = null;
let cg;
let boardBoundsRefreshQueued = false;

function refreshBoardBounds() {
  if (!cg || boardBoundsRefreshQueued) return;

  boardBoundsRefreshQueued = true;
  requestAnimationFrame(() => {
    boardBoundsRefreshQueued = false;
    cg.state.dom.bounds.clear();
    cg.redrawAll();
  });
}

function watchBoardLayout() {
  if (!window.ResizeObserver) return;

  const observer = new ResizeObserver(refreshBoardBounds);
  [boardWrapElement, botCard, userCard].forEach((element) => {
    if (element) observer.observe(element);
  });
}

const levelSelect = document.getElementById("level");
const levelLabelElement = document.getElementById("levelLabel");
const evalChipElement = document.getElementById("eval-chip");

const botCapturedElement = document.getElementById("botCaptured");
const userCapturedElement = document.getElementById("userCaptured");

levelSelect.addEventListener("change", () => {
  BOT_LEVEL = parseInt(levelSelect.value);

  const selectedText = levelSelect.options[levelSelect.selectedIndex].text;

  if (levelLabelElement) {
    levelLabelElement.textContent = selectedText;
  }

  // ✅ UPDATE BOT NAME
  if (botNameElement) {
    botNameElement.textContent = `AI ${selectedText}`;
  }
});

const userCard = document.querySelector(".user-card");
const botCard = document.querySelector(".bot-card");

function setTurn(state) {
  userCard.classList.remove("active");
  botCard.classList.remove("active", "thinking");

  if (state === "user") {
    userCard.classList.add("active");
    document.body.classList.remove("ai-thinking");

    // user sedang giliran, bot tetap online/standby
    setStatus(userStatusDot, "online");
    setStatus(botStatusDot, "online");
  }

  if (state === "bot") {
    botCard.classList.add("thinking");
    document.body.classList.add("ai-thinking");

    // 🔥 tambahan animasi biar hidup
    botCard.classList.add("pulse");
    setTimeout(() => {
      botCard.classList.remove("pulse");
    }, 800);

    // bot sedang berpikir
    setStatus(botStatusDot, "thinking");
    setStatus(userStatusDot, "online");
  }

  if (state === "gameover") {
    userCard.classList.remove("active");
    botCard.classList.remove("thinking");
    document.body.classList.remove("ai-thinking");

    setStatus(userStatusDot, "offline");
    setStatus(botStatusDot, "offline");
  }
}

function getDests() {
  const dests = new Map();

  for (const square of SQUARES) {
    const moves = game.moves({ square, verbose: true });
    if (moves.length > 0) {
      dests.set(
        square,
        moves.map((m) => m.to),
      );
    }
  }

  return dests;
}

function updateStatus() {
  if (game.isCheckmate()) {
    statusElement.textContent = "Checkmate";
    setTurn("gameover");
    return;
  }

  if (game.isDraw()) {
    statusElement.textContent = "Draw";
    setTurn("gameover");
    return;
  }

  if (engineThinking) {
    const thinkingMessages = [
      "Oh gitu mainnya.",
      "Hmm... boleh juga 🤔",
      "Maen sat-set yok...",
      "Oke... gw ada ide...",
    ];

    const msg =
      thinkingMessages[Math.floor(Math.random() * thinkingMessages.length)];

    if (botStatusTextElement) botStatusTextElement.textContent = msg;
    statusElement.textContent = "Menunggu AI jalan...";
    return;
  }

  if (game.turn() === "w") {
    if (botStatusTextElement) {
      botStatusTextElement.textContent = "Gw nungguin bro";
    }

    statusElement.textContent = "Yuk... Giliran Kamu!";
    return;
  }

  if (botStatusTextElement) {
    botStatusTextElement.textContent = "Ini langkah terbaik gw...";
  }

  statusElement.textContent = "Menunggu AI jalan...";
}

function syncBoard() {
  const turnColor = game.turn() === "w" ? "white" : "black";

  cg.set({
    fen: game.fen(),
    turnColor,
    lastMove,
    check: game.inCheck(),
    drawable: {
      enabled: false,
      visible: true,
      eraseOnClick: false,
      shapes: hintShape ? [hintShape] : [],
    },
    movable: {
      free: false,
      color: engineThinking ? undefined : "white",
      dests: getDests(),
      showDests: true,
      events: {
        after: onMove,
      },
      rookCastle: true,
    },
  });

  updateStatus();
  updateHistory();
  updateEvalBar();
  updateCapturedPieces();
  refreshBoardBounds();
}

function onMove(orig, dest) {
  if (engineThinking || game.turn() !== "w") {
    syncBoard();
    return;
  }

  const move = game.move({
    from: orig,
    to: dest,
    promotion: "q",
  });

  if (!move) {
    syncBoard();
    return;
  }

  playMoveSound(move);

  lastMove = [move.from, move.to];
  hintShape = null;
  hintTextElement.textContent = "Hint: -";

  engineThinking = true;
  setStatus(botStatusDot, "thinking");
  setTurn("bot");
  syncBoard();

  setTimeout(makeComputerMove, 500);
}

function updateHistory() {
  if (!historyElement) return;

  const history = game.history({ verbose: true });

  let html = "";

  for (let i = 0; i < history.length; i += 2) {
    const moveNumber = i / 2 + 1;
    const white = history[i]?.san || "";
    const black = history[i + 1]?.san || "";

    html += `<div>${moveNumber}. ${white} ${black}</div>`;
  }

  historyElement.innerHTML = html;
}

async function makeComputerMove() {
  if (game.isGameOver()) {
    engineThinking = false;
    setStatus(botStatusDot, "online");
    setTurn("user");
    syncBoard();
    return;
  }

  let depth;
  let randomness;

  switch (BOT_LEVEL) {
    case 1:
      depth = 3;
      randomness = 0.6;
      break;
    case 2:
      depth = 6;
      randomness = 0.3;
      break;
    case 3:
      depth = 10;
      randomness = 0.1;
      break;
    case 4:
      depth = 14;
      randomness = 0;
      break;
    default:
      depth = 8;
      randomness = 0.2;
  }

  const engineResult = await getBestMove(game.fen(), depth);
  let bestMove = engineResult?.move || null;

  if (engineResult?.score) {
    lastEval = engineResult.score;
  }

  // 💡 inject "human mistake"
  // Use verbose move object, not SAN string like "c5".
  // This prevents invalid parsing as UCI from/to.
  if (Math.random() < randomness) {
    const moves = game.moves({ verbose: true });
    bestMove = moves[Math.floor(Math.random() * moves.length)];
  }

  if (bestMove) {
    let move = null;

    if (typeof bestMove === "string") {
      move = game.move({
        from: bestMove.substring(0, 2),
        to: bestMove.substring(2, 4),
        promotion: bestMove.length >= 5 ? bestMove.substring(4, 5) : "q",
      });
    } else {
      move = game.move(bestMove);
    }

    if (move) {
      lastMove = [move.from, move.to];
      playMoveSound(move);
      setTurn("bot");
    }
  }

  engineThinking = false;
  setStatus(botStatusDot, "online");
  setTurn("user");
  syncBoard();
}

function updateEvalBar() {
  if (!evalFillElement || !evalScoreElement) return;

  if (!lastEval) {
    evalFillElement.style.height = "50%";
    evalScoreElement.textContent = "0.0";
    return;
  }

  if (lastEval.type === "mate") {
    evalFillElement.style.height = lastEval.value > 0 ? "95%" : "5%";
    const mateText = `M${Math.abs(lastEval.value)}`;
    evalScoreElement.textContent = mateText;
    if (evalChipElement) evalChipElement.textContent = mateText;
    return;
  }

  const pawns = lastEval.value / 100;
  const clamped = Math.max(-5, Math.min(5, pawns));
  const whitePercent = 50 + clamped * 8;
  const inverted = 100 - whitePercent;

  evalFillElement.style.height = `${inverted}%`;
  evalScoreElement.textContent =
    pawns >= 0 ? `+${pawns.toFixed(1)}` : pawns.toFixed(1);
  if (evalChipElement) {
    evalChipElement.textContent =
      pawns >= 0 ? `+${pawns.toFixed(1)}` : pawns.toFixed(1);
  }
}

function updateCapturedPieces() {
  if (!botCapturedElement || !userCapturedElement) return;

  const history = game.history({ verbose: true });

  const capturedByWhite = []; // black pieces captured by You
  const capturedByBlack = []; // white pieces captured by Bot

  history.forEach((move) => {
    if (!move.captured) return;

    const piece = move.captured.toUpperCase(); // P,N,B,R,Q

    if (move.color === "w") {
      capturedByWhite.push(`b${piece}.png`);
    } else {
      capturedByBlack.push(`w${piece}.png`);
    }
  });

  const base = `${import.meta.env.BASE_URL}pieces/neo2/`;

  userCapturedElement.innerHTML = capturedByWhite
    .map((file) => `<img src="${base}${file}" alt="">`)
    .join("");

  botCapturedElement.innerHTML = capturedByBlack
    .map((file) => `<img src="${base}${file}" alt="">`)
    .join("");
}

// NEW GAME
function resetGame() {
  game.reset();
  lastMove = null;
  lastEval = { type: "cp", value: 0 };
  hintShape = null;
  hintTextElement.textContent = "Hint: -";

  if (botCapturedElement) botCapturedElement.innerHTML = "";
  if (userCapturedElement) userCapturedElement.innerHTML = "";

  engineThinking = false;
  setStatus(userStatusDot, "online");
  setStatus(botStatusDot, "online");
  setTurn("user");
  syncBoard();
}

const avatarFiles = [
  "avatar1.svg",
  "avatar6.svg",
  "avatar9.svg",
  "avatar10.svg",
  "avatar11.svg",
  "avatar13.svg",
  "avatar15.svg",
];

function pickAvatar(fileName) {
  return `${import.meta.env.BASE_URL}avatar/${fileName}`;
}

const userAvatarImg = document.querySelector(".user-avatar img");
const botAvatarImg = document.querySelector(".bot-avatar img");

if (userAvatarImg) userAvatarImg.src = pickAvatar("avatar11.svg");
if (botAvatarImg) botAvatarImg.src = pickAvatar("avatar6.svg");

function openConfirmModal() {
  confirmModal?.classList.remove("hidden");
}

function closeConfirmModal() {
  confirmModal?.classList.add("hidden");
}

function applyBoardTheme(theme) {
  document.body.dataset.board = theme;
  localStorage.setItem("boardTheme", theme);
}

function loadBoardTheme() {
  const saved = localStorage.getItem("boardTheme") || "green";
  applyBoardTheme(saved);

  if (boardThemeSelect) {
    boardThemeSelect.value = saved;
  }
}

menuIcon?.addEventListener("click", () => {
  settingsModal?.classList.remove("hidden");
});

closeSettingsBtn?.addEventListener("click", () => {
  settingsModal?.classList.add("hidden");
});

settingsModal?.addEventListener("click", (e) => {
  if (e.target === settingsModal) {
    settingsModal.classList.add("hidden");
  }
});

boardThemeSelect?.addEventListener("change", () => {
  applyBoardTheme(boardThemeSelect.value);
});

// NEW GAME WITH CONFIRMATION
newGameBtn.addEventListener("click", openConfirmModal);

cancelNewGameBtn?.addEventListener("click", closeConfirmModal);

confirmNewGameBtn?.addEventListener("click", () => {
  closeConfirmModal();
  resetGame();
});

confirmModal?.addEventListener("click", (e) => {
  if (e.target === confirmModal) closeConfirmModal();
});

// UNDO
undoBtn.addEventListener("click", () => {
  game.undo(); // computer
  game.undo(); // player

  const history = game.history({ verbose: true });
  const last = history[history.length - 1];
  lastMove = last ? [last.from, last.to] : null;

  hintShape = null;
  hintTextElement.textContent = "Hint: -";
  engineThinking = false;
  setStatus(botStatusDot, "online");
  setTurn("user");
  syncBoard();
});

hintBtn.addEventListener("click", async () => {
  if (engineThinking || game.isGameOver()) return;

  if (game.turn() !== "w") {
    hintTextElement.textContent = "Hint: wait for your turn";
    return;
  }

  hintTextElement.textContent = "Hint: thinking...";

  const result = await getBestMove(game.fen(), 10);
  const move = result?.move;

  if (!move || move === "(none)") {
    hintTextElement.textContent = "Hint: no move";
    return;
  }

  const from = move.substring(0, 2);
  const to = move.substring(2, 4);

  hintShape = {
    orig: from,
    dest: to,
    brush: "green",
  };

  hintTextElement.textContent = `Best: ${from} → ${to}`;
  syncBoard();
});

//INIT BOARD
cg = Chessground(boardElement, {
  orientation: "white",
  fen: game.fen(),
  turnColor: "white",

  animation: { enabled: true, duration: 120 },

  // 🔥 TAMBAHKAN DI ROOT
  draggable: {
    enabled: true,
    showGhost: true,
  },

  // 🔥 OPTIONAL UX
  selectable: {
    enabled: true,
  },

  movable: {
    free: false,
    color: "white",
    dests: getDests(),
    showDests: true,

    events: {
      after: onMove,
    },
  },
});

// INIT DEFAULT LEVEL (biar konsisten saat load)
const defaultText = levelSelect.options[levelSelect.selectedIndex].text;

if (levelLabelElement) {
  levelLabelElement.textContent = defaultText;
}

if (botNameElement) {
  botNameElement.textContent = `AI ${defaultText}`;
}

loadBoardTheme();
watchBoardLayout();
syncBoard();
