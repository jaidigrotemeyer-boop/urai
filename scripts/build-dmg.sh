#!/bin/bash
# Baut URAI.app + URAI.dmg — die "aus dem Internet geladene App", die man in
# Applications zieht. Kein Electron: node_modules und ein fertig gebautes
# dist/ stecken direkt im Paket, das Programm hat keine nativen Abhängigkeiten
# (node:sqlite ist eingebaut). Darum bleibt die App klein (~60 MB) und startet
# ohne Wartezeit.
#
#   ./scripts/build-dmg.sh
#
# Ergebnis: build/URAI.dmg — ungesigniert (kein Apple-Entwicklerkonto hier).
# Beim ersten Öffnen warnt Gatekeeper "unbekannter Entwickler" — Rechtsklick
# → Öffnen umgeht das einmalig.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/build"
STAGE="$OUT/stage"
APP="$STAGE/URAI.app"

rm -rf "$OUT"
mkdir -p "$OUT" "$APP/Contents/MacOS" "$APP/Contents/Resources/app"

echo "→ Icon (.icns aus web/public/icon-512.png)"
ICONSET="$OUT/URAI.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z $size $size "$ROOT/web/public/icon-512.png" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z $double $double "$ROOT/web/public/icon-512.png" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/URAI.icns"

echo "→ Info.plist"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>URAI</string>
  <key>CFBundleDisplayName</key><string>URAI</string>
  <key>CFBundleIdentifier</key><string>app.urai.desktop</string>
  <key>CFBundleVersion</key><string>0.1.0</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>URAI</string>
  <key>CFBundleIconFile</key><string>URAI.icns</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSHumanReadableCopyright</key><string>URAI — läuft lokal, kostet nichts.</string>
</dict>
</plist>
PLIST

echo "→ Startskript"
cat > "$APP/Contents/MacOS/URAI" <<'LAUNCH'
#!/bin/bash
# Die echte ausführbare Datei im App-Paket. macOS startet sie beim Doppelklick
# auf URAI.app. Sie hat kein eigenes Fenster — darum öffnet sie Terminal und
# lässt den Server dort laufen. So sieht man ehrlich, was passiert, statt vor
# einem Icon zu sitzen, das scheinbar nichts tut. Bausteine und die gebaute
# Oberfläche liegen schon im Paket — kein Warten beim ersten Start.
BUNDLE="$(cd "$(dirname "$0")/../.." && pwd)"
APP_DIR="$BUNDLE/Contents/Resources/app"
osascript <<EOF
tell application "Terminal"
  activate
  do script "cd '$APP_DIR' && ./'URAI starten.command'"
end tell
EOF
LAUNCH
chmod +x "$APP/Contents/MacOS/URAI"

echo "→ Quelltext ins Paket kopieren"
rsync -a \
  --exclude node_modules --exclude data --exclude dist --exclude .git \
  --exclude .claude --exclude .DS_Store --exclude 'URAI-Code.*' --exclude build \
  "$ROOT/" "$APP/Contents/Resources/app/"

echo "→ npm install + Build innerhalb des Pakets (macht die App sofort startklar)"
(cd "$APP/Contents/Resources/app" && npm install --no-audit --no-fund && npm run build)

echo "→ DMG-Bühne: App + Applications-Verknüpfung"
mkdir -p "$STAGE"
ln -sf /Applications "$STAGE/Applications"

RWDMG="$OUT/URAI-rw.dmg"
hdiutil create -volname "URAI" -srcfolder "$STAGE" -ov -format UDRW "$RWDMG" >/dev/null

echo "→ Fenster-Layout (Hintergrund, Icon-Positionen)"
hdiutil attach "$RWDMG" -mountpoint /Volumes/URAI -nobrowse -noautoopen >/dev/null
mkdir -p /Volumes/URAI/.background
cp "$ROOT/scripts/dmg-bg.png" /Volumes/URAI/.background/bg.png 2>/dev/null || true
osascript <<'APPLESCRIPT'
tell application "Finder"
  tell disk "URAI"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set the bounds of container window to {200, 120, 840, 540}
    set viewOptions to the icon view options of container window
    set arrangement of viewOptions to not arranged
    set icon size of viewOptions to 128
    try
      set background picture of viewOptions to file ".background:bg.png"
    end try
    set position of item "URAI.app" of container window to {160, 220}
    set position of item "Applications" of container window to {480, 220}
    close
    open
    update without registering applications
    delay 1
  end tell
end tell
APPLESCRIPT
chmod -Rf go-w /Volumes/URAI 2>/dev/null || true
hdiutil detach /Volumes/URAI >/dev/null

echo "→ Fertig komprimieren"
hdiutil convert "$RWDMG" -format UDZO -imagekey zlib-level=9 -o "$OUT/URAI.dmg" >/dev/null

rm -rf "$STAGE" "$RWDMG" "$ICONSET"
echo "✓ $OUT/URAI.dmg fertig"
