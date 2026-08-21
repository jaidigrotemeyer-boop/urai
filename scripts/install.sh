#!/bin/bash
# URAI installieren — ohne Gatekeeper-Warnung.
#
#   curl -fsSL https://raw.githubusercontent.com/jaidigrotemeyer-boop/urai/main/scripts/install.sh | bash
#
# Ein anderer Zweig als main — zum Ausprobieren, bevor etwas gemerged ist:
#
#   curl -fsSL https://raw.githubusercontent.com/jaidigrotemeyer-boop/urai/ZWEIG/scripts/install.sh \
#     | URAI_ZWEIG=ZWEIG bash
#
# Warum das die Warnung vermeidet: macOS hängt die Quarantäne-Markierung an
# Dateien, die ein BROWSER lädt — nicht an solche, die ein Skript holt und
# baut. Die App entsteht hier auf dem Rechner, statt fertig aus dem Netz zu
# kommen. Darum startet sie per Doppelklick, ohne dass jemand "Trotzdem
# öffnen" suchen muss. Das umgeht keine Sicherheitsprüfung: wer dieses Skript
# ausführt, hat die Entscheidung bewusst getroffen.
set -euo pipefail

REPO="https://github.com/jaidigrotemeyer-boop/urai"
ZWEIG="${URAI_ZWEIG:-main}"
ZIEL="${URAI_ZIEL:-/Applications/URAI.app}"
QUELLE="${URAI_QUELLE:-$HOME/.urai-app}"

blau()  { printf '\033[36m%s\033[0m\n' "$1"; }
gruen() { printf '\033[32m%s\033[0m\n' "$1"; }
rot()   { printf '\033[31m%s\033[0m\n' "$1"; }

printf '\n'
blau '  URAI'
printf '  ────\n\n'

# ── Betriebssystem prüfen ────────────────────────────────────────────
# Weiter unten kommen sips, iconutil und codesign — die gibt es nur auf dem
# Mac. Ohne diese Prüfung bricht das Skript erst nach dem Bauen ab, mit einer
# Fehlermeldung, aus der niemand schlau wird.
if [ "$(uname -s)" != "Darwin" ]; then
  rot "  Dieser Installer baut eine Mac-App — hier läuft $(uname -s)."
  printf '  URAI selbst läuft trotzdem:\n\n'
  printf '    git clone -b %s %s.git ~/urai\n' "$ZWEIG" "$REPO"
  printf '    cd ~/urai && npm install && npm start\n\n'
  exit 1
fi

# ── Node prüfen ──────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  rot '  Node fehlt.'
  printf '  Hol es bei https://nodejs.org — Version 22 oder neuer, dann nochmal.\n\n'
  exit 1
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 22 ]; then
  rot "  Node $(node -v) ist zu alt — URAI braucht 22 oder neuer."
  printf '  Neue Version bei https://nodejs.org\n\n'
  exit 1
fi

# ── Quelltext holen ──────────────────────────────────────────────────
if [ "$ZWEIG" = "main" ]; then
  printf '  Lädt URAI …\n'
else
  printf '  Lädt URAI (Zweig %s) …\n' "$ZWEIG"
fi
rm -rf "$QUELLE"
mkdir -p "$QUELLE"
if command -v git >/dev/null 2>&1; then
  if ! git clone --depth 1 --branch "$ZWEIG" --quiet "$REPO.git" "$QUELLE"; then
    rot "  Zweig \"$ZWEIG\" gibt es nicht."
    printf '  Ohne URAI_ZWEIG nimmt der Installer main.\n\n'
    exit 1
  fi
else
  # Ohne git: Tarball. curl setzt keine Quarantäne — genau darum geht es hier.
  # Zweignamen mit Schrägstrich sind in diesem Pfad erlaubt und richtig so.
  if ! curl -fsSL "$REPO/archive/refs/heads/$ZWEIG.tar.gz" | tar -xz -C "$QUELLE" --strip-components=1; then
    rot "  Zweig \"$ZWEIG\" gibt es nicht oder das Laden ging schief."
    printf '\n'
    exit 1
  fi
fi

cd "$QUELLE"

printf '  Baut (das dauert ein, zwei Minuten) …\n'
npm install --no-audit --no-fund --silent
npm run build --silent

# ── App-Paket zusammensetzen ─────────────────────────────────────────
printf '  Legt die App an …\n'
BUILD="$QUELLE/.app-build/URAI.app"
rm -rf "$QUELLE/.app-build"
mkdir -p "$BUILD/Contents/MacOS" "$BUILD/Contents/Resources"

ICONSET="$QUELLE/.app-build/URAI.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z $size $size web/public/icon-512.png --out "$ICONSET/icon_${size}x${size}.png" >/dev/null 2>&1
  sips -z $((size * 2)) $((size * 2)) web/public/icon-512.png --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null 2>&1
done
iconutil -c icns "$ICONSET" -o "$BUILD/Contents/Resources/URAI.icns"

cat > "$BUILD/Contents/Info.plist" <<'PLIST'
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

# Der Quelltext liegt im Paket, damit die App für sich allein steht und ein
# Löschen des Download-Ordners sie nicht zerlegt.
mkdir -p "$BUILD/Contents/Resources/app"
rsync -a --exclude .git --exclude .app-build --exclude data --exclude .DS_Store \
  "$QUELLE/" "$BUILD/Contents/Resources/app/"

cat > "$BUILD/Contents/MacOS/URAI" <<'LAUNCH'
#!/bin/bash
# Öffnet Terminal und startet dort den Server — so sieht man, was läuft.
BUNDLE="$(cd "$(dirname "$0")/../.." && pwd)"
APP_DIR="$BUNDLE/Contents/Resources/app"
osascript <<EOF
tell application "Terminal"
  activate
  do script "cd '$APP_DIR' && ./'URAI starten.command'"
end tell
EOF
LAUNCH
chmod +x "$BUILD/Contents/MacOS/URAI"

# Ad-hoc signieren: nimmt die Warnung nicht weg (dafür bräuchte es ein
# Apple-Entwicklerkonto), macht die App aber auf Apple-Silicon-Macs sauber
# startbar und gibt ihr eine stabile Identität für die Systemeinstellungen.
codesign --force --deep --sign - "$BUILD" >/dev/null 2>&1 || true

# ── Einsetzen ────────────────────────────────────────────────────────
if [ -d "$ZIEL" ]; then
  printf '  Ersetzt die alte Fassung …\n'
  rm -rf "$ZIEL"
fi
mkdir -p "$(dirname "$ZIEL")"
mv "$BUILD" "$ZIEL"
rm -rf "$QUELLE/.app-build"

# Falls doch irgendwo eine Markierung mitkam: weg damit. Der Nutzer hat diesen
# Installer selbst gestartet — eine Warnung über seine eigene Entscheidung
# wäre nur Lärm.
xattr -dr com.apple.quarantine "$ZIEL" 2>/dev/null || true

printf '\n'
gruen '  Fertig.'
printf '  URAI liegt in %s\n' "$ZIEL"
printf '  Im Launchpad oder Programme-Ordner doppelklicken — ohne Warnung.\n\n'

if [ -t 0 ]; then
  read -r -p '  Jetzt starten? [J/n] ' antwort
  case "$antwort" in [nN]*) ;; *) open "$ZIEL" ;; esac
else
  printf '  Starten mit:  open "%s"\n\n' "$ZIEL"
fi
