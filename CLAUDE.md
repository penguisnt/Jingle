# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jingle (jingle.rs) is an Old School RuneScape music guessing game. Players listen to OSRS music tracks and drop a pin on an interactive map to guess where that track plays in-game. Modes: Practice, Daily Jingle (5 songs/day), and Multiplayer lobbies.

## Commands

```bash
npm run dev       # Start Vite dev server with hot reload
npm run build     # TypeScript compile + optimized production build
npm run lint      # Run ESLint
npm run preview   # Preview production build locally
```

No test framework is configured.

## Architecture

**Stack:** React 19 + TypeScript, Vite, Leaflet maps, Firebase (auth/DB), Socket.io (multiplayer), MUI + Bootstrap UI.

**Key directories:**

- `src/components/` — React UI components organized by feature (DailyJingle, Practice, Multiplayer, MultiLobby, Navbar, Profile, etc.)
- `src/hooks/` — Game logic hooks: `useGameLogic.ts` (core game state), `useLobbyWebSocket.ts` (real-time multiplayer), `useLobbyState.ts`, `usePlayerPresence.ts`, `useCountdown.ts`
- `src/data/` — Static game data and API client: `jingle-api.ts` (all backend calls via `VITE_API_HOST`), `GeoJSON.ts` (map boundaries), `map-links.ts` / `map-metadata.ts` (OSRS location data)
- `src/types/jingle.ts` — All shared TypeScript types (SoloGameState, GameStatus, Song, DailyChallenge, MultiLobby, etc.)
- `src/utils/` — Pure helpers: `map-utils.ts` (geospatial), `jingle-utils.ts` (scoring), `playSong.ts`, `getRandomSong.ts`
- `src/constants/` — Game settings, region definitions, localStorage keys, asset paths
- `src/AuthContext/` — Firebase auth context provider
- `src/style/` — Global CSS (OSRS theme, Leaflet overrides, audio player)

**Data flow:** Components consume custom hooks → hooks call `jingle-api.ts` or Firebase → Socket.io handles multiplayer state sync via `useLobbyWebSocket`.

**Map rendering:** Leaflet with custom OSRS tile layers. `RunescapeMap.tsx` is the core map component. Geospatial scoring uses Turf.js. The map uses a custom coordinate system defined in `tilemapresource.xml`.

**Large data files (do not read fully into context):** `src/data/GeoJSON.ts` (665K), `src/data/map-links.ts` (84K), `src/data/customMapDefs.json` (49K).

**Environment:** Requires `VITE_API_HOST` env var pointing to the backend API server.
