# Skyfight (Browser Dogfight Game)

A simple top-down 2D game for the browser where an F18 chases MiGs in open sky.

## How to Run

Because this project uses JavaScript modules, run it with a local web server:

- Python: `python3 -m http.server 8000`
- Then open [http://localhost:8000](http://localhost:8000)

## Controls

- Turn left: `A` or `Left Arrow`
- Turn right: `D` or `Right Arrow`
- Speed up: `W` or `Up Arrow`
- Slow down: `S` or `Down Arrow`
- Fire missile: `Space`

## Gameplay Rules

- Destroy enemy MiGs with missiles to gain points.
- Radar in the top-right shows enemy positions relative to your jet.
- Enemy jets can also fire missiles at you.
- Game ends when your F18 HP reaches 0.

## Sprite Files

Sprites are in `assets/sprites`:

- `f18.svg`
- `mig.svg`
- `missile.svg`

If sprites fail to load, the game falls back to simple shapes so it still works.
