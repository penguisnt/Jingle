import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import useTraversalLogic from '../hooks/useTraversalLogic';
import { playSong } from '../utils/playSong';
import Footer from './Footer';
import HomeButton from './side-menu/HomeButton';
import TraversalMapWrapper from './TraversalMap';
import { Button } from './ui-util/Button';

export default function MapTraversal() {
  const [searchParams] = useSearchParams();
  const { gameState, wrongGuessRegionIds, eliminatedRegionIds, highScore, initGame, handleRegionClick, toggleEliminatedRegion, resetGame } =
    useTraversalLogic();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isNewHighScore, setIsNewHighScore] = useState(false);

  const handleStart = () => {
    setIsNewHighScore(false);
    const startRegion = searchParams.get('startRegion');
    const songName = initGame(startRegion ? Number(startRegion) : undefined);
    if (songName) {
      playSong(audioRef, songName, false);
    }
  };

  const onRegionClick = (regionId: number) => {
    const result = handleRegionClick(regionId);

    if (result.correct && result.songName) {
      // Play next song
      playSong(audioRef, result.songName, false);
    }

    if (result.gameOver && result.newHighScore) {
      setIsNewHighScore(true);
    }
  };

  const handleRestart = () => {
    setIsNewHighScore(false);
    const songName = resetGame();
    if (songName) {
      playSong(audioRef, songName, false);
    }
  };

  const isGameOver = gameState.status === 'lost' || gameState.status === 'won';
  const INITIAL_LIVES = 10;

  return (
    <>
      <div className="App-inner">
        <div className="ui-box">
          <div className="modal-buttons-container">
            <span style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <HomeButton />
            </span>
          </div>

          <div className="below-map">
            {/* Lives and score display */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
                padding: '0 10px',
                gap: '10px',
              }}
            >
              <div className="osrs-frame" style={{ padding: '8px 12px', fontSize: '0.9rem', display: 'flex', gap: '4px', alignItems: 'center' }}>
                <img
                  src="/assets/osrs_hitpoints.png"
                  alt="HP"
                  style={{ width: '20px', height: '18px', imageRendering: 'pixelated' }}
                />
                {gameState.lives}/{INITIAL_LIVES}
              </div>
              <div className="osrs-frame" style={{ padding: '8px 12px', fontSize: '0.9rem' }}>
                Tiles: {gameState.score}
              </div>
            </div>

            {/* Game status */}
            {gameState.status === 'waiting' && (
              <Button label="Start" onClick={handleStart} classes="guess-btn" />
            )}

            {gameState.status === 'playing' && (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label className="osrs-frame guess-btn" style={{ whiteSpace: 'nowrap', maxWidth: 'none' }}>
                  Click the region where this song plays
                </label>
                {gameState.lastSongName && (
                  <label className="osrs-frame guess-btn" style={{ fontSize: '0.85rem' }}>
                    Last song: {gameState.lastSongName}
                  </label>
                )}
              </div>
            )}

            {gameState.status === 'lost' && (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label className="osrs-frame guess-btn" style={{ color: '#ff4444' }}>
                  Game Over! Score: {gameState.score} tiles
                </label>
                {isNewHighScore ? (
                  <label className="osrs-frame guess-btn" style={{ color: '#ffdd00', fontSize: '0.85rem' }}>
                    New best!
                  </label>
                ) : highScore > 0 && (
                  <label className="osrs-frame guess-btn" style={{ fontSize: '0.85rem' }}>
                    Best: {highScore}
                  </label>
                )}
                <label className="osrs-frame guess-btn" style={{ fontSize: '0.85rem' }}>
                  Last song: {gameState.currentSongName}
                </label>
                <Button label="Play Again" onClick={handleRestart} classes="guess-btn" />
              </div>
            )}

            {gameState.status === 'won' && (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label className="osrs-frame guess-btn" style={{ color: '#00ff00' }}>
                  You unlocked every tile! Score: {gameState.score}
                </label>
                {isNewHighScore ? (
                  <label className="osrs-frame guess-btn" style={{ color: '#ffdd00', fontSize: '0.85rem' }}>
                    New best!
                  </label>
                ) : highScore > 0 && (
                  <label className="osrs-frame guess-btn" style={{ fontSize: '0.85rem' }}>
                    Best: {highScore}
                  </label>
                )}
                <label className="osrs-frame guess-btn" style={{ fontSize: '0.85rem' }}>
                  Last song: {gameState.lastSongName}
                </label>
                <Button label="Play Again" onClick={handleRestart} classes="guess-btn" />
              </div>
            )}

            {/* Audio controls */}
            <div className="audio-container">
              <audio controls id="audio" ref={audioRef} />
            </div>

            <Footer />
          </div>
        </div>
      </div>

      <TraversalMapWrapper
        gameState={gameState}
        wrongGuessRegionIds={wrongGuessRegionIds}
        eliminatedRegionIds={eliminatedRegionIds}
        onRegionClick={onRegionClick}
        onRegionRightClick={toggleEliminatedRegion}
      />

    </>
  );
}
