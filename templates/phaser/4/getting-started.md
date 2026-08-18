# Getting started

Scaffolded with **Phaser 4.2.1** (`phaser@^4.2.1` on npm) and **Vite 8**.
These steps come from the official Phaser and Node.js docs — links inline.

## 1. Install Node.js 24

Node.js is required to install dependencies and run npm scripts. Vite 8
requires Node `^20.19.0 || >=22.12.0`; Node 24 (current LTS) is recommended.
Install with nvm (per-account, no sudo):

```sh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# restart your shell, then:
nvm install 24
nvm use 24
```

or download the LTS installer from <https://nodejs.org/en/download>.
Verify with `node --version` — expect `v24.x`.

Sources: <https://nodejs.org/en/download> and
<https://vitejs.dev/guide/>

## 2. Install dependencies

```sh
npm install
```

Installs `phaser@^4.2.1` plus Vite 8 as a dev dependency.

## 3. Run (dev server)

```sh
./scripts/run.sh
```

Vite serves the game at <http://localhost:8080>. Because the Vite config
sets `server.host=true`, the server binds all interfaces — from a Windows
browser you can open the game while the project lives in WSL2 (WSL2
forwards `localhost` to the Linux side automatically).

## 4. Build for production

```sh
npm run build
```

A production bundle lands in `dist/` — deploy the whole folder to any
static host. Source: <https://github.com/phaserjs/template-vite>

## 5. Test

```sh
./scripts/test.sh
```

Runs the three test layers (unit / headless / eyeball — see
`tests/README.md`). The headless layer is `npm run build`, proving the
imports and bundle compile.
