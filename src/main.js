import { Chess, SQUARES } from "chess.js";
import { Chessground } from "chessground";

import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
import "chessground/assets/chessground.cburnett.css";

import { initEngine, getBestMove } from "./engine.js";

const game = new Chess();
initEngine();

const boardElement = document.getElementById("board");
const statusElement = document.getElementById("status");
const evalFillElement = document.getElementById("eval-fill");
const evalScoreElement = document.getElementById("eval-score");

const historyElement = document.getElementById("history");
const newGameBtn = document.getElementById("newGame");
const undoBtn = document.getElementById("undo");
const hintBtn = document.getElementById("hint");
const hintTextElement = document.getElementById("hintText");

let engineThinking = false;
let BOT_LEVEL = 2;
let lastMove = null;
let lastEval = { type: "cp", value: 0 };
let hintShape = null;
let cg;

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
});

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
  } else if (game.isDraw()) {
    statusElement.textContent = "Draw";
  } else if (engineThinking) {
    statusElement.textContent = "Computer thinking...";
  } else {
    statusElement.textContent =
      game.turn() === "w" ? "White to move" : "Black to move";
  }
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
      events: {
        after: onMove,
      },
    },
  });

  updateStatus();
  updateHistory();
  updateEvalBar();
  updateCapturedPieces();
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
  lastMove = [move.from, move.to];
  hintShape = null;
  hintTextElement.textContent = "Hint: -";

  engineThinking = true;
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
    if (typeof bestMove === "string") {
      const move = game.move({
        from: bestMove.substring(0, 2),
        to: bestMove.substring(2, 4),
        promotion: bestMove.length >= 5 ? bestMove.substring(4, 5) : "q",
      });

      if (move) lastMove = [move.from, move.to];
    } else {
      const move = game.move(bestMove);
      if (move) lastMove = [move.from, move.to];
    }
  }

  engineThinking = false;
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

  evalFillElement.style.height = `${whitePercent}%`;
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
      capturedByWhite.push(`b${piece}.svg`);
    } else {
      capturedByBlack.push(`w${piece}.svg`);
    }
  });

  const base = `${import.meta.env.BASE_URL}pieces/mpchess/`;

  userCapturedElement.innerHTML = capturedByWhite
    .map((file) => `<img src="${base}${file}" alt="">`)
    .join("");

  botCapturedElement.innerHTML = capturedByBlack
    .map((file) => `<img src="${base}${file}" alt="">`)
    .join("");
}

// NEW GAME
newGameBtn.addEventListener("click", () => {
  game.reset();
  lastMove = null;
  lastEval = { type: "cp", value: 0 };
  hintShape = null;
  hintTextElement.textContent = "Hint: -";
  engineThinking = false;
  syncBoard();
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

  animation: { enabled: true, duration: 200 },

  movable: {
    free: false,
    color: "white",
    dests: getDests(),
    events: {
      after: onMove,
    },
  },
});

syncBoard();
