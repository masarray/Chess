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

const historyElement = document.getElementById("history");
const newGameBtn = document.getElementById("newGame");
const undoBtn = document.getElementById("undo");

let engineThinking = false;
let BOT_LEVEL = 2;
let cg;

const levelSelect = document.getElementById("level");

levelSelect.addEventListener("change", () => {
  BOT_LEVEL = parseInt(levelSelect.value);
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

  engineThinking = true;
  syncBoard();

  setTimeout(makeComputerMove, 500);
}

function updateHistory() {
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

  let bestMove = await getBestMove(game.fen(), depth);

  // 💡 inject "human mistake"
  // Use verbose move object, not SAN string like "c5".
  // This prevents invalid parsing as UCI from/to.
  if (Math.random() < randomness) {
    const moves = game.moves({ verbose: true });
    bestMove = moves[Math.floor(Math.random() * moves.length)];
  }

  if (bestMove) {
    if (typeof bestMove === "string") {
      game.move({
        from: bestMove.substring(0, 2),
        to: bestMove.substring(2, 4),
        promotion: bestMove.length >= 5 ? bestMove.substring(4, 5) : "q",
      });
    } else {
      game.move(bestMove);
    }
  }

  engineThinking = false;
  syncBoard();
}

// NEW GAME
newGameBtn.addEventListener("click", () => {
  game.reset();
  engineThinking = false;
  syncBoard();
});

// UNDO
undoBtn.addEventListener("click", () => {
  game.undo(); // computer
  game.undo(); // player
  engineThinking = false;
  syncBoard();
});

//INIT BOARD
cg = Chessground(boardElement, {
  orientation: "white",
  fen: game.fen(),
  turnColor: "white",
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
