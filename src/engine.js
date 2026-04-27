let stockfish = null;

export function initEngine() {
  stockfish = new Worker("/stockfish/stockfish-18-asm.js");

  stockfish.onmessage = (event) => {
    console.log("[SF INIT]", String(event.data));
  };

  stockfish.onerror = (err) => {
    console.error("Stockfish worker error:", err);
  };

  stockfish.postMessage("uci");
  stockfish.postMessage("isready");
}

export function getBestMove(fen, depth = 8) {
  return new Promise((resolve) => {
    if (!stockfish) {
      resolve(null);
      return;
    }

    let lastScore = null;

    const timeout = setTimeout(() => {
      console.warn("Stockfish timeout");
      resolve(null);
    }, 15000);

    stockfish.onmessage = (event) => {
      const line = String(event.data);
      console.log("[SF]", line);

      const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
      if (scoreMatch) {
        lastScore = {
          type: scoreMatch[1],
          value: parseInt(scoreMatch[2], 10),
        };
      }

      if (line.startsWith("bestmove")) {
        clearTimeout(timeout);
        resolve({
          move: line.split(" ")[1],
          score: lastScore,
        });
      }
    };

    stockfish.postMessage("ucinewgame");
    stockfish.postMessage("position fen " + fen);
    stockfish.postMessage("go depth " + depth);
  });
}
