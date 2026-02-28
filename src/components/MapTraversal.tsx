import { useEffect, useRef } from 'react';
import useTraversalLogic from '../hooks/useTraversalLogic';
import { playSong } from '../utils/playSong';
import Footer from './Footer';
import HomeButton from './side-menu/HomeButton';
import TraversalMapWrapper from './TraversalMap';
import { Button } from './ui-util/Button';

export default function MapTraversal() {
  const { gameState, wrongGuessRegionIds, initGame, handleRegionClick, resetGame } =
    useTraversalLogic();
  const audioRef = useRef<HTMLAudioElement>(null);

  // Initialize game on mount
  useEffect(() => {
    const songName = initGame();
    if (songName) {
      playSong(audioRef, songName, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRegionClick = (regionId: number) => {
    const result = handleRegionClick(regionId);

    if (result.correct && result.songName) {
      // Play next song
      playSong(audioRef, result.songName, false);
    }
  };

  const handleRestart = () => {
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
            {gameState.status === 'playing' && (
              <label className="osrs-frame guess-btn">
                Click the region where this song plays
              </label>
            )}

            {gameState.status === 'lost' && (
              <div style={{ textAlign: 'center' }}>
                <label className="osrs-frame guess-btn" style={{ color: '#ff4444' }}>
                  Game Over! Score: {gameState.score} tiles
                </label>
                <Button label="Play Again" onClick={handleRestart} classes="guess-btn" />
              </div>
            )}

            {gameState.status === 'won' && (
              <div style={{ textAlign: 'center' }}>
                <label className="osrs-frame guess-btn" style={{ color: '#00ff00' }}>
                  You unlocked every tile! Score: {gameState.score}
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
        onRegionClick={onRegionClick}
      />

      {/* Song name reveal on game over */}
      {isGameOver && gameState.currentSongName && (
        <div
          style={{
            position: 'fixed',
            bottom: '120px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            padding: '8px 16px',
            borderRadius: '4px',
          }}
          className="osrs-frame"
        >
          Last song: {gameState.currentSongName}
        </div>
      )}
    </>
  );
}
