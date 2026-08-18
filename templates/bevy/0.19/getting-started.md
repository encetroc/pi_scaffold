# Getting started

Scaffolded with **Bevy 0.19** (pinned exact). These steps come from the
official Bevy setup guide — links inline.

## 1. Install the Rust toolchain

Install via rustup:

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Bevy 0.19 requires Rust 1.95 or newer. Source:
<https://www.rust-lang.org/tools/install>

## 2. System dependencies (Linux / WSL2)

Bevy needs ALSA and X11/Wayland dev packages on Linux. On Ubuntu/Debian
(including WSL2):

```sh
sudo apt install build-essential libasound2-dev libudev-dev pkg-config \
  libwayland-dev libxkbcommon-dev libx11-dev libxrandr-dev libxi-dev \
  libxcursor-dev wayland-protocols
```

Source: <https://bevy.org/learn/quick-start/getting-started/setup/#linux>

## 3. Build

Bevy is a large dependency tree — the first build takes a while. On
memory-limited WSL keep parallelism capped with `-j 8` (about 3.8 GiB RAM):

```sh
cargo -j 8 check   # first build
cargo -j 8 run
```

or export it once: `export CARGO_BUILD_JOBS=8`.

## 4. Run (native)

```sh
./scripts/run.sh
```

The window opens through **WSLg** on Windows 11 — no X server or
`DISPLAY` trickery needed. If no window appears, confirm WSLg is enabled
(`wsl --version` shows a WSLg section) and that your distro is a recent
Ubuntu/Debian.

## 5. Run (web)

If you picked the **web** build target, `./scripts/run.sh` starts
[trunk](https://trunkrs.dev/). First-time setup:

```sh
rustup target add wasm32-unknown-unknown
cargo install trunk
```

Then serve and open <http://127.0.0.1:8080> (or the port trunk prints).

## 6. Test

```sh
./scripts/test.sh
```

Runs `cargo test`, then reminds you of the three test layers (unit /
headless / eyeball — see `tests/README.md`).
