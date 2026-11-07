#!/usr/bin/env bash
# The macOS checks GitHub runs after building the app (.github/workflows/mac.yml), on Apple Silicon and Intel. Each
# check's output goes to ci-out/<name>.log; a summary prints at the end and the script fails if any check failed.
set -u
OUT="$PWD/ci-out"
mkdir -p "$OUT"
FFMPEG="$(node -p "require('ffmpeg-ffprobe-static').ffmpegPath")"
APP="$(ls -d dist/mac*/IV\ Studio.app | head -n 1)"
results=()
# macOS has no `timeout`: perl's alarm does the same
tmo() { local s="$1"; shift; perl -e 'alarm shift; exec @ARGV' "$s" "$@"; }
run() {
  local name="$1"; shift
  echo "::group::$name"
  if "$@" >"$OUT/$name.log" 2>&1; then results+=("ok   $name"); else results+=("FAIL $name"); fi
  tail -n 25 "$OUT/$name.log"
  echo "::endgroup::"
}

# the app bundle: the right architecture, ad-hoc signed, and carrying the GPL ffmpeg (never a nonfree build)
run app-arch bash -c "file '$APP/Contents/MacOS/IV Studio' | grep -q '$(uname -m)'"
run app-signature codesign --verify --deep --strict "$APP"
BUNDLED_FFMPEG="$(find "$APP/Contents/Resources/app.asar.unpacked" -name ffmpeg -type f | head -n 1)"
run ffmpeg-gpl bash -c "'$BUNDLED_FFMPEG' -hide_banner -version | tee /dev/stderr | grep -q -- '--enable-gpl' && ! '$BUNDLED_FFMPEG' -hide_banner -version | grep -q -- '--enable-nonfree'"

# the parts that need no GPU and no ComfyUI
for t in cast cutout directing editgen news tours lint productions reel screenplay sizzle-cut staging timeline-tracks private-outputs comfylauncher ranking prompt-guide ollama-address nodepacks model-versions remake comfycloud image-families refmods hardware training-recipe training-runpod sampler-choice; do
  run "test-$t" node "test/$t.mjs"
done
python3 -m venv "$OUT/pyenv" && "$OUT/pyenv/bin/pip" install -q aiohttp
run test-runpod node test/runpod.mjs "$OUT/pyenv/bin/python"

# test media made with the bundled ffmpeg (the Mac build), then an edit export and a Shinobi render with Chrome
# (Shinobi installs with uv, so this also checks the pinned Mac uv build)
M="$OUT/media"; mkdir -p "$M"
"$FFMPEG" -v error -y -f lavfi -i testsrc2=size=1280x720:rate=24 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 4 -c:v libx264 -pix_fmt yuv420p -c:a aac "$M/a.mp4"
"$FFMPEG" -v error -y -f lavfi -i smptebars=size=1280x720:rate=24 -f lavfi -i sine=frequency=660:sample_rate=48000 -t 4 -c:v libx264 -pix_fmt yuv420p -c:a aac "$M/b.mp4"
"$FFMPEG" -v error -y -f lavfi -i "sine=frequency=220:sample_rate=48000:beep_factor=4" -t 12 -c:a libmp3lame "$M/music.mp3"
run test-edit-export node test/edit-export.mjs "$M/a.mp4" "$M/b.mp4"
# a real website over the network: one retry if the connection drops
run test-site-capture bash -c "node test/site-capture.mjs https://infinitevariance.ai || node test/site-capture.mjs https://infinitevariance.ai"
run test-shinobi node test/shinobi.mjs "$M/a.mp4" "$M/b.mp4" "$M/music.mp3"

# the MCP server from the built code
npx electron-vite build >/dev/null 2>&1
run mcp-dev node test/mcp-smoke.mjs

# the window: every sidebar page, from the built app, with a picture of each
export IV_STUDIO_USER_DATA="$OUT/userdata" IV_STUDIO_DATA="$OUT/data"
pages_ok() { node -e "const s=require('$OUT/window/smoke.json');if(s.pages.length<8||s.pages.some(p=>p.text<20))process.exit(1)" 2>/dev/null; }
for try in 1 2; do
  rm -rf "$OUT/window"
  # the real screen a few seconds in: the native traffic lights and the title bar as macOS draws them
  (sleep 9; screencapture -x "$OUT/screen-$try.png" 2>/dev/null) &
  run window env IV_STUDIO_SMOKE="$OUT/window" ELECTRON_ENABLE_LOGGING=1 bash -c "$(declare -f tmo); env | grep -i '^electron' ; date; tmo 180 '$APP/Contents/MacOS/IV Studio' --enable-logging; echo \"exit \$?\"; date"
  cat "$OUT/window.log"
  [ -f "$OUT/window/smoke.json" ] && cat "$OUT/window/smoke.json"
  if pages_ok; then break; fi
  echo "window pass $try didn't open every page"
done
pages_ok && results+=("ok   window-pages") || results+=("FAIL window-pages")

# the MCP server from the app, with the exact command the app gives agents (Settings -> Agents)
MCP_CMD="$(node -p "require('$OUT/window/smoke.json').mcp.command" 2>/dev/null)"
MCP_ARGS_JSON="$(node -p "JSON.stringify(require('$OUT/window/smoke.json').mcp.args)" 2>/dev/null)"
# without the window's answer, the same command it gives: the app's own binary on its bundled mcp.js
[ -n "$MCP_CMD" ] || { MCP_CMD="$APP/Contents/MacOS/IV Studio"; MCP_ARGS_JSON="$(node -p "JSON.stringify([process.argv[1]])" "$APP/Contents/Resources/app.asar/out/main/mcp.js")"; }
echo "MCP: $MCP_CMD $MCP_ARGS_JSON"
run mcp-app env MCP_COMMAND="$MCP_CMD" MCP_ARGS="$MCP_ARGS_JSON" bash -c "$(declare -f tmo); tmo 120 node test/mcp-smoke.mjs"

echo
printf '%s\n' "${results[@]}" | tee "$OUT/summary.txt"
! grep -q '^FAIL' "$OUT/summary.txt"
