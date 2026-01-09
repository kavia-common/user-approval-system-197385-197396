import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

/**
 * Create an "empty" game state for local play.
 */
function createEmptyGameState() {
  return {
    board: Array(9).fill(null),
    nextPlayer: "X",
    status: "Next player: X",
    winner: null,
    isDraw: false,
    moves: 0,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Determine the winner for a given 3x3 board.
 * @param {Array<("X"|"O"|null)>} board
 * @returns {"X"|"O"|null}
 */
function calculateWinner(board) {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8], // rows
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8], // cols
    [0, 4, 8],
    [2, 4, 6], // diags
  ];

  for (const [a, b, c] of lines) {
    const v = board[a];
    if (v && v === board[b] && v === board[c]) return v;
  }
  return null;
}

/**
 * Create the derived status fields from the board + turn.
 */
function deriveStatus(board, nextPlayer) {
  const winner = calculateWinner(board);
  const moves = board.filter(Boolean).length;
  const isDraw = !winner && moves === 9;

  if (winner) {
    return {
      winner,
      isDraw: false,
      moves,
      status: `Winner: ${winner}`,
    };
  }

  if (isDraw) {
    return {
      winner: null,
      isDraw: true,
      moves,
      status: "Draw",
    };
  }

  return {
    winner: null,
    isDraw: false,
    moves,
    status: `Next player: ${nextPlayer}`,
  };
}

/**
 * Lightweight API client that *optionally* talks to a backend.
 * If the backend is missing/unavailable, all calls fail silently.
 */
function useOptionalGameApi() {
  const baseUrl = useMemo(() => {
    // Prefer explicit BACKEND_URL, fall back to API_BASE.
    const raw = process.env.REACT_APP_BACKEND_URL || process.env.REACT_APP_API_BASE || "";
    return raw.replace(/\/+$/, "");
  }, []);

  // If not set, we treat API as disabled.
  const enabled = Boolean(baseUrl);

  // PUBLIC_INTERFACE
  async function loadLatest() {
    /** Load latest game state from backend; returns null if unavailable. */
    if (!enabled) return null;

    try {
      const res = await fetch(`${baseUrl}/api/games/latest`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (_e) {
      return null;
    }
  }

  // PUBLIC_INTERFACE
  async function save(state) {
    /** Save current game state to backend; returns saved object or null if unavailable. */
    if (!enabled) return null;

    try {
      const res = await fetch(`${baseUrl}/api/games`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          board: state.board,
          next_player: state.nextPlayer,
          winner: state.winner,
          is_draw: state.isDraw,
          moves: state.moves,
        }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (_e) {
      return null;
    }
  }

  return { enabled, baseUrl, loadLatest, save };
}

// PUBLIC_INTERFACE
function App() {
  /** Tic Tac Toe main application component (UI + game logic). */
  const api = useOptionalGameApi();

  const [game, setGame] = useState(() => createEmptyGameState());
  const [apiStatus, setApiStatus] = useState(() => (api.enabled ? "Connecting…" : "Offline"));
  const saveDebounceRef = useRef(null);

  // Attempt to load latest game state from backend on mount (non-breaking).
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!api.enabled) return;

      const loaded = await api.loadLatest();
      if (cancelled) return;

      if (loaded && Array.isArray(loaded.board) && loaded.board.length === 9) {
        const nextPlayer = loaded.next_player === "O" ? "O" : "X";
        const derived = deriveStatus(loaded.board, nextPlayer);

        setGame({
          board: loaded.board,
          nextPlayer,
          status: derived.status,
          winner: loaded.winner ?? derived.winner,
          isDraw: Boolean(loaded.is_draw ?? derived.isDraw),
          moves: Number.isFinite(loaded.moves) ? loaded.moves : derived.moves,
          updatedAt: loaded.updated_at || new Date().toISOString(),
        });
        setApiStatus("Synced");
      } else {
        setApiStatus("Online (no saved game)");
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [api]);

  // Debounced save to backend whenever game changes (only if backend enabled).
  useEffect(() => {
    if (!api.enabled) return;

    if (saveDebounceRef.current) {
      clearTimeout(saveDebounceRef.current);
    }

    saveDebounceRef.current = setTimeout(async () => {
      setApiStatus("Saving…");
      const saved = await api.save(game);
      setApiStatus(saved ? "Synced" : "Offline");
    }, 450);

    return () => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    };
  }, [api, game]);

  const canPlay = !game.winner && !game.isDraw;

  // PUBLIC_INTERFACE
  function handleSquareClick(index) {
    /** Handle a click on a square; updates board and status if move is valid. */
    if (!canPlay) return;
    if (game.board[index]) return;

    const nextBoard = [...game.board];
    nextBoard[index] = game.nextPlayer;

    const nextPlayer = game.nextPlayer === "X" ? "O" : "X";
    const derived = deriveStatus(nextBoard, nextPlayer);

    setGame({
      board: nextBoard,
      nextPlayer,
      status: derived.status,
      winner: derived.winner,
      isDraw: derived.isDraw,
      moves: derived.moves,
      updatedAt: new Date().toISOString(),
    });
  }

  // PUBLIC_INTERFACE
  function handleReset() {
    /** Reset the game to a fresh board. */
    setGame(createEmptyGameState());
  }

  return (
    <div className="App">
      <main className="ttt-page">
        <section className="ttt-card" aria-label="Tic Tac Toe">
          <header className="ttt-header">
            <div className="ttt-title-wrap">
              <h1 className="ttt-title">Tic Tac Toe</h1>
              <p className="ttt-subtitle">Two-player game on the same device</p>
            </div>

            <div className="ttt-meta" aria-label="Connectivity status">
              <span className="ttt-status-pill" data-state={game.winner ? "winner" : game.isDraw ? "draw" : "playing"}>
                {game.status}
              </span>

              <span className="ttt-api-pill" data-enabled={api.enabled ? "true" : "false"} title={api.enabled ? api.baseUrl : "Backend not configured"}>
                {api.enabled ? `API: ${apiStatus}` : "API: Disabled"}
              </span>
            </div>
          </header>

          <div className="ttt-board" role="grid" aria-label="Game board">
            {game.board.map((value, idx) => (
              <button
                key={idx}
                type="button"
                className={`ttt-cell ${value ? "is-filled" : ""}`}
                role="gridcell"
                aria-label={`Cell ${idx + 1}${value ? `, ${value}` : ""}`}
                onClick={() => handleSquareClick(idx)}
                disabled={!canPlay || Boolean(value)}
              >
                <span className={`ttt-mark ${value === "X" ? "is-x" : value === "O" ? "is-o" : ""}`}>{value || ""}</span>
              </button>
            ))}
          </div>

          <footer className="ttt-footer">
            <button type="button" className="ttt-reset-btn" onClick={handleReset}>
              Reset game
            </button>

            <p className="ttt-help">
              {canPlay ? (
                <>
                  Playing as <strong>{game.nextPlayer}</strong>. Click an empty square to place your mark.
                </>
              ) : game.winner ? (
                <>
                  <strong>{game.winner}</strong> wins. Press <strong>Reset game</strong> to play again.
                </>
              ) : (
                <>
                  It&apos;s a draw. Press <strong>Reset game</strong> to try again.
                </>
              )}
            </p>
          </footer>
        </section>
      </main>
    </div>
  );
}

export default App;
