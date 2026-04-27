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

    const timeout = setTimeout(() => {
      console.warn("Stockfish timeout");
      resolve(null);
    }, 15000);

    stockfish.onmessage = (event) => {
      const line = String(event.data);
      console.log("[SF]", line);

      if (line.startsWith("bestmove")) {
        clearTimeout(timeout);
        resolve(line.split(" ")[1]);
      }
    };

    stockfish.postMessage("ucinewgame");
    stockfish.postMessage("position fen " + fen);
    stockfish.postMessage("go depth " + depth);
  });
}
