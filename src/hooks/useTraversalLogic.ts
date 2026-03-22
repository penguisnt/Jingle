import { useCallback, useRef, useState } from 'react';
import { LOCAL_STORAGE } from '../constants/localStorage';
import { getNeighborIds, getRegionById, getSurfaceRegions } from '../utils/adjacency';

export type TraversalStatus = 'waiting' | 'playing' | 'lost' | 'won';

export interface TraversalGameState {
  status: TraversalStatus;
  lives: number;
  unlockedRegionIds: number[];
  frontierRegionIds: number[];
  targetRegionId: number | null;
  currentSongName: string;
  lastSongName: string;
  score: number;
  sharkRegionIds: number[]; // regions where shark food drops are sitting
  correctStreak: number; // counts correct guesses for shark spawn timing
}

const INITIAL_LIVES = 10;
const SHARK_INTERVAL = 5;

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function computeFrontier(unlockedIds: number[]): number[] {
  const unlockedSet = new Set(unlockedIds);
  const frontierSet = new Set<number>();

  for (const id of unlockedIds) {
    for (const neighborId of getNeighborIds(id)) {
      if (!unlockedSet.has(neighborId)) {
        // Only include neighbors that actually exist as regions with songs
        if (getRegionById(neighborId)) {
          frontierSet.add(neighborId);
        }
      }
    }
  }

  return Array.from(frontierSet);
}

function getStoredHighScore(): number {
  const stored = localStorage.getItem(LOCAL_STORAGE.traversalHighScore);
  return stored ? parseInt(stored, 10) || 0 : 0;
}

export default function useTraversalLogic() {
  const [gameState, setGameState] = useState<TraversalGameState>({
    status: 'waiting',
    lives: INITIAL_LIVES,
    unlockedRegionIds: [],
    frontierRegionIds: [],
    targetRegionId: null,
    currentSongName: '',
    lastSongName: '',
    score: 0,
    sharkRegionIds: [],
    correctStreak: 0,
  });

  // Track wrong guesses for this round — these regions show as disabled until next correct guess
  const [wrongGuessRegionIds, setWrongGuessRegionIds] = useState<Set<number>>(new Set());

  // Track eliminated (flagged) regions — visual aid only
  const [eliminatedRegionIds, setEliminatedRegionIds] = useState<Set<number>>(new Set());

  // High score
  const [highScore, setHighScore] = useState<number>(getStoredHighScore);

  // Ref to track if game has been initialized
  const initializedRef = useRef(false);

  const updateHighScore = useCallback((score: number) => {
    const current = getStoredHighScore();
    if (score > current) {
      localStorage.setItem(LOCAL_STORAGE.traversalHighScore, String(score));
      setHighScore(score);
      return true;
    }
    return false;
  }, []);

  const toggleEliminatedRegion = useCallback((regionId: number) => {
    setEliminatedRegionIds((prev) => {
      const next = new Set(prev);
      if (next.has(regionId)) {
        next.delete(regionId);
      } else {
        next.add(regionId);
      }
      return next;
    });
  }, []);

  const initGame = useCallback((startRegionId?: number) => {
    const regions = getSurfaceRegions();
    // Pick a random starting region that has neighbors, or use the specified one
    const regionsWithNeighbors = regions.filter((r) => r.neighborIds.length > 0);
    const startRegion = startRegionId
      ? (getRegionById(startRegionId) ?? pickRandom(regionsWithNeighbors))
      : pickRandom(regionsWithNeighbors);

    const unlocked = [startRegion.id];
    const frontier = computeFrontier(unlocked);

    if (frontier.length === 0) {
      // Extremely unlikely but handle it
      const song = pickRandom(startRegion.songNames);
      setGameState({
        status: 'won',
        lives: INITIAL_LIVES,
        unlockedRegionIds: unlocked,
        frontierRegionIds: [],
        targetRegionId: null,
        currentSongName: song,
        lastSongName: '',
        score: 1,
        sharkRegionIds: [],
        correctStreak: 0,
      });
      updateHighScore(1);
      return song;
    }

    const targetId = pickRandom(frontier);
    const targetRegion = getRegionById(targetId)!;
    const targetSong = pickRandom(targetRegion.songNames);

    setGameState({
      status: 'playing',
      lives: INITIAL_LIVES,
      unlockedRegionIds: unlocked,
      frontierRegionIds: frontier,
      targetRegionId: targetId,
      currentSongName: targetSong,
      lastSongName: '',
      score: 1,
      sharkRegionIds: [],
      correctStreak: 1,
    });

    initializedRef.current = true;
    return targetSong;
  }, [updateHighScore]);

  const handleRegionClick = useCallback(
    (regionId: number): { correct: boolean; songName: string | null; gameOver: boolean; healed?: boolean; newHighScore?: boolean } => {
      const state = gameState;

      if (state.status !== 'playing' || state.targetRegionId === null) {
        return { correct: false, songName: null, gameOver: false };
      }

      if (regionId === state.targetRegionId) {
        // Correct guess — clear wrong guesses and eliminations for the round
        setWrongGuessRegionIds(new Set());
        setEliminatedRegionIds(new Set());

        // Check if shark was eaten (correct guess on a shark tile)
        const ateShark = state.sharkRegionIds.includes(regionId);
        const newLives = ateShark
          ? Math.min(state.lives + 1, INITIAL_LIVES)
          : state.lives;

        const newStreak = state.correctStreak + 1;
        const newUnlocked = [...state.unlockedRegionIds, regionId];
        const newFrontier = computeFrontier(newUnlocked);

        // Remove eaten shark and any sharks no longer on the frontier
        const frontierSet = new Set(newFrontier);
        let newSharkRegionIds = state.sharkRegionIds
          .filter((id) => id !== regionId && frontierSet.has(id));

        if (newFrontier.length === 0) {
          // Won - no more frontier
          const finalScore = newUnlocked.length;
          const isNewHigh = updateHighScore(finalScore);
          setGameState({
            ...state,
            status: 'won',
            lives: newLives,
            unlockedRegionIds: newUnlocked,
            frontierRegionIds: [],
            targetRegionId: null,
            lastSongName: state.currentSongName,
            score: finalScore,
            sharkRegionIds: [],
            correctStreak: newStreak,
          });
          return { correct: true, songName: null, gameOver: true, healed: ateShark, newHighScore: isNewHigh };
        }

        const nextTargetId = pickRandom(newFrontier);
        const nextTarget = getRegionById(nextTargetId)!;
        const nextSong = pickRandom(nextTarget.songNames);

        // Spawn a new shark every SHARK_INTERVAL correct guesses
        if (newStreak % SHARK_INTERVAL === 0) {
          // Pick a frontier tile that doesn't already have a shark
          const available = newFrontier.filter((id) => !newSharkRegionIds.includes(id));
          if (available.length > 0) {
            newSharkRegionIds = [...newSharkRegionIds, pickRandom(available)];
          }
        }

        setGameState({
          ...state,
          lives: newLives,
          unlockedRegionIds: newUnlocked,
          frontierRegionIds: newFrontier,
          targetRegionId: nextTargetId,
          currentSongName: nextSong,
          lastSongName: state.currentSongName,
          score: newUnlocked.length,
          sharkRegionIds: newSharkRegionIds,
          correctStreak: newStreak,
        });

        return { correct: true, songName: nextSong, gameOver: false, healed: ateShark };
      } else {
        // Wrong guess — mark region as guessed this round
        setWrongGuessRegionIds((prev) => new Set(prev).add(regionId));

        const newLives = state.lives - 1;

        if (newLives <= 0) {
          const finalScore = state.score;
          const isNewHigh = updateHighScore(finalScore);
          setGameState({
            ...state,
            status: 'lost',
            lives: 0,
          });
          return { correct: false, songName: null, gameOver: true, newHighScore: isNewHigh };
        }

        setGameState({
          ...state,
          lives: newLives,
        });
        return { correct: false, songName: null, gameOver: false };
      }
    },
    [gameState, updateHighScore],
  );

  const resetGame = useCallback(() => {
    initializedRef.current = false;
    setWrongGuessRegionIds(new Set());
    setEliminatedRegionIds(new Set());
    return initGame();
  }, [initGame]);

  return {
    gameState,
    wrongGuessRegionIds,
    eliminatedRegionIds,
    highScore,
    initGame,
    handleRegionClick,
    toggleEliminatedRegion,
    resetGame,
  };
}
