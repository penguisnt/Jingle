import { useCallback, useRef, useState } from 'react';
import { getNeighborIds, getRegionById, getSurfaceRegions } from '../utils/adjacency';

export type TraversalStatus = 'playing' | 'lost' | 'won';

export interface TraversalGameState {
  status: TraversalStatus;
  lives: number;
  unlockedRegionIds: number[];
  frontierRegionIds: number[];
  targetRegionId: number | null;
  currentSongName: string;
  score: number;
  sharkRegionId: number | null; // region where shark food drop is sitting
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

export default function useTraversalLogic() {
  const [gameState, setGameState] = useState<TraversalGameState>({
    status: 'playing',
    lives: INITIAL_LIVES,
    unlockedRegionIds: [],
    frontierRegionIds: [],
    targetRegionId: null,
    currentSongName: '',
    score: 0,
    sharkRegionId: null,
    correctStreak: 0,
  });

  // Track wrong guesses for this round — these regions show as disabled until next correct guess
  const [wrongGuessRegionIds, setWrongGuessRegionIds] = useState<Set<number>>(new Set());

  // Ref to track if game has been initialized
  const initializedRef = useRef(false);

  const initGame = useCallback(() => {
    const regions = getSurfaceRegions();
    // Pick a random starting region that has neighbors
    const regionsWithNeighbors = regions.filter((r) => r.neighborIds.length > 0);
    const startRegion = pickRandom(regionsWithNeighbors);

    const unlocked = [startRegion.id];
    const frontier = computeFrontier(unlocked);

    if (frontier.length === 0) {
      // Extremely unlikely but handle it
      setGameState({
        status: 'won',
        lives: INITIAL_LIVES,
        unlockedRegionIds: unlocked,
        frontierRegionIds: [],
        targetRegionId: null,
        currentSongName: startRegion.songName,
        score: 1,
        sharkRegionId: null,
        correctStreak: 0,
      });
      return startRegion.songName;
    }

    const targetId = pickRandom(frontier);
    const targetRegion = getRegionById(targetId)!;

    setGameState({
      status: 'playing',
      lives: INITIAL_LIVES,
      unlockedRegionIds: unlocked,
      frontierRegionIds: frontier,
      targetRegionId: targetId,
      currentSongName: targetRegion.songName,
      score: 1,
      sharkRegionId: null,
      correctStreak: 1,
    });

    initializedRef.current = true;
    return targetRegion.songName;
  }, []);

  const handleRegionClick = useCallback(
    (regionId: number): { correct: boolean; songName: string | null; gameOver: boolean; healed?: boolean } => {
      const state = gameState;

      if (state.status !== 'playing' || state.targetRegionId === null) {
        return { correct: false, songName: null, gameOver: false };
      }

      if (regionId === state.targetRegionId) {
        // Correct guess — clear wrong guesses for the round
        setWrongGuessRegionIds(new Set());

        // Check if shark was eaten (correct guess on the shark tile)
        const ateShark = state.sharkRegionId === regionId;
        const newLives = ateShark
          ? Math.min(state.lives + 1, INITIAL_LIVES)
          : state.lives;

        const newStreak = state.correctStreak + 1;
        const newUnlocked = [...state.unlockedRegionIds, regionId];
        const newFrontier = computeFrontier(newUnlocked);

        if (newFrontier.length === 0) {
          // Won - no more frontier
          setGameState({
            ...state,
            status: 'won',
            lives: newLives,
            unlockedRegionIds: newUnlocked,
            frontierRegionIds: [],
            targetRegionId: null,
            score: newUnlocked.length,
            sharkRegionId: null,
            correctStreak: newStreak,
          });
          return { correct: true, songName: null, gameOver: true, healed: ateShark };
        }

        const nextTargetId = pickRandom(newFrontier);
        const nextTarget = getRegionById(nextTargetId)!;

        // Spawn shark every SHARK_INTERVAL correct guesses
        let newSharkRegionId = ateShark ? null : state.sharkRegionId;
        if (newStreak % SHARK_INTERVAL === 0) {
          newSharkRegionId = pickRandom(newFrontier);
        }

        setGameState({
          ...state,
          lives: newLives,
          unlockedRegionIds: newUnlocked,
          frontierRegionIds: newFrontier,
          targetRegionId: nextTargetId,
          currentSongName: nextTarget.songName,
          score: newUnlocked.length,
          sharkRegionId: newSharkRegionId,
          correctStreak: newStreak,
        });

        return { correct: true, songName: nextTarget.songName, gameOver: false, healed: ateShark };
      } else {
        // Wrong guess — mark region as guessed this round
        setWrongGuessRegionIds((prev) => new Set(prev).add(regionId));

        const newLives = state.lives - 1;

        if (newLives <= 0) {
          setGameState({
            ...state,
            status: 'lost',
            lives: 0,
          });
          return { correct: false, songName: null, gameOver: true };
        }

        setGameState({
          ...state,
          lives: newLives,
        });
        return { correct: false, songName: null, gameOver: false };
      }
    },
    [gameState],
  );

  const resetGame = useCallback(() => {
    initializedRef.current = false;
    setWrongGuessRegionIds(new Set());
    return initGame();
  }, [initGame]);

  return {
    gameState,
    wrongGuessRegionIds,
    initGame,
    handleRegionClick,
    resetGame,
  };
}
