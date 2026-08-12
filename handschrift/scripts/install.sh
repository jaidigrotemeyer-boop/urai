#!/bin/bash
# Handschrift installieren — ohne Gatekeeper-Warnung.
#
#   curl -fsSL https://raw.githubusercontent.com/BENUTZER/handschrift/main/scripts/install.sh | bash
#
# Warum keine Warnung kommt: macOS hängt die Quarantäne-Markierung an Dateien,
# die ein BROWSER lädt — nicht an solche, die ein Skript holt und baut. Die App
# entsteht hier auf dem Rechner, statt fertig aus dem Netz zu kommen. Das
# umgeht keine Sicherheitsprüfung: wer dieses Skript ausführt, hat die
# Entscheidung bewusst getroffen.
set -euo pipefail

REPO="${HANDSCHRIFT_REPO:-https://github.com/jaidigrotemeyer-boop/handschrift}"
ZWEIG="${HANDSCHRIFT_ZWEIG:-main}"
ZIEL="${HANDSCHRIFT_ZIEL:-/Applications/Handschrift.app}"
QUELLE="${HANDSCHRIFT_QUELLE:-$HOME/.handschrift-app}"

blau()  { printf '\033[36m%s\033[0m\n' "$1"; }
gruen() { printf '\033[32m%s\033[0m\n' "$1"; }
rot()   { printf '\033[31m%s\033[0m\n' "$1"; }

printf '\n'
blau '  Handschrift'
printf '  ───────────\n\n'

# ── Betriebssystem ───────────────────────────────────────────────────
# Weiter unten kommen sips, iconutil und codesign — die gibt es nur auf dem
# Mac. Ohne diese Prüfung bricht das Skript erst nach dem Bauen ab.
if [ "$(uname -s)" != "Darwin" ]; then
  rot "  Dieser Installer baut eine Mac-App — hier läuft $(uname -s)."
  printf '  Handschrift selbst läuft trotzdem:\n\n'
  printf '    git clone -b %s %s.git ~/handschrift\n' "$ZWEIG" "$REPO"
  printf '    cd ~/handschrift && npm start\n\n'
  exit 1
fi

# ── Node ─────────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  rot '  Node fehlt.'
  printf '  Hol es bei https://nodejs.org — Version 20 oder neuer, dann nochmal.\n\n'
  exit 1
fi
if [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  rot "  Node $(node -v) ist zu alt — Handschrift braucht 20 oder neuer."
  printf '  Neue Version bei https://nodejs.org\n\n'
  exit 1
fi

# ── Quelltext ────────────────────────────────────────────────────────
printf '  Lädt Handschrift%s …\n' "$([ "$ZWEIG" = main ] || printf ' (Zweig %s)' "$ZWEIG")"
rm -rf "$QUELLE"
mkdir -p "$QUELLE"
if command -v git >/dev/null 2>&1; then
  if ! git clone --depth 1 --branch "$ZWEIG" --quiet "$REPO.git" "$QUELLE"; then
    rot "  Konnte \"$ZWEIG\" nicht holen. Gibt es den Zweig? Ist das Repo öffentlich?"
    printf '\n'
    exit 1
  fi
else
  if ! curl -fsSL "$REPO/archive/refs/heads/$ZWEIG.tar.gz" | tar -xz -C "$QUELLE" --strip-components=1; then
    rot "  Konnte \"$ZWEIG\" nicht laden."
    printf '\n'
    exit 1
  fi
fi
cd "$QUELLE"

# npm install gibt es hier bewusst nicht: Handschrift hat keine einzige
# Abhängigkeit. Was geladen wurde, ist schon die ganze App.

# ── App-Paket ────────────────────────────────────────────────────────
printf '  Legt die App an …\n'
BUILD="$QUELLE/.app-build/Handschrift.app"
rm -rf "$QUELLE/.app-build"
mkdir -p "$BUILD/Contents/MacOS" "$BUILD/Contents/Resources"

cat > "$BUILD/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Handschrift</string>
  <key>CFBundleDisplayName</key><string>Handschrift</string>
  <key>CFBundleIdentifier</key><string>app.handschrift.desktop</string>
  <key>CFBundleVersion</key><string>0.1.0</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>Handschrift</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSHumanReadableCopyright</key><string>Handschrift — läuft lokal, kostet nichts.</string>
</dict>
</plist>
PLIST

# Der Quelltext liegt im Paket, damit die App für sich allein steht und ein
# Löschen des Download-Ordners sie nicht zerlegt.
mkdir -p "$BUILD/Contents/Resources/app"
rsync -a --exclude .git --exclude .app-build --exclude data --exclude .DS_Store \
  "$QUELLE/" "$BUILD/Contents/Resources/app/"

cat > "$BUILD/Contents/MacOS/Handschrift" <<'LAUNCH'
#!/bin/bash
# Öffnet Terminal und startet dort den Server — so sieht man, was läuft.
BUNDLE="$(cd "$(dirname "$0")/../.." && pwd)"
APP_DIR="$BUNDLE/Contents/Resources/app"
osascript <<EOF
tell application "Terminal"
  activate
  do script "cd '$APP_DIR' && ./'Handschrift starten.command'"
end tell
EOF
LAUNCH
chmod +x "$BUILD/Contents/MacOS/Handschrift"
chmod +x "$BUILD/Contents/Resources/app/Handschrift starten.command" 2>/dev/null || true

# Ad-hoc signieren: nimmt die Warnung nicht weg (dafür bräuchte es ein
# Apple-Entwicklerkonto), macht die App aber auf Apple-Silicon-Macs sauber
# startbar und gibt ihr eine stabile Identität für die Systemeinstellungen.
codesign --force --deep --sign - "$BUILD" >/dev/null 2>&1 || true

# ── Einsetzen ────────────────────────────────────────────────────────
[ -d "$ZIEL" ] && { printf '  Ersetzt die alte Fassung …\n'; rm -rf "$ZIEL"; }
mkdir -p "$(dirname "$ZIEL")"
mv "$BUILD" "$ZIEL"
rm -rf "$QUELLE/.app-build"
xattr -dr com.apple.quarantine "$ZIEL" 2>/dev/null || true

printf '\n'
gruen '  Fertig.'
printf '  Handschrift liegt in %s\n' "$ZIEL"
printf '  Im Launchpad oder Programme-Ordner doppelklicken.\n\n'
printf '  Fürs Tippen fragt macOS beim ersten Mal nach "Bedienungshilfen".\n'
printf '  Schneller tippt es mit:  brew install cliclick\n\n'

if [ -t 0 ]; then
  read -r -p '  Jetzt starten? [J/n] ' antwort
  case "$antwort" in [nN]*) ;; *) open "$ZIEL" ;; esac
else
  printf '  Starten mit:  open "%s"\n\n' "$ZIEL"
fi
