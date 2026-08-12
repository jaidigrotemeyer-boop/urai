#!/bin/bash
# Doppelklicken startet Handschrift. Mehr braucht es nicht.
cd "$(dirname "$0")" || exit 1

printf '\n  Handschrift\n  ───────────\n\n'

if ! command -v node >/dev/null 2>&1; then
  printf '  Node fehlt noch.\n'
  printf '  Hol es bei https://nodejs.org — Version 20 oder neuer.\n'
  printf '  Danach diese Datei nochmal doppelklicken.\n\n'
  read -r -p '  Enter zum Schliessen '
  exit 1
fi

if [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  printf '  Node %s ist zu alt — Handschrift braucht 20 oder neuer.\n' "$(node -v)"
  printf '  Neue Version bei https://nodejs.org\n\n'
  read -r -p '  Enter zum Schliessen '
  exit 1
fi

# Kein npm install: Handschrift hat keine Abhängigkeiten.

PORT="${PORT:-3018}"

# Der Browser geht erst auf, wenn der Server wirklich antwortet
(
  for _ in $(seq 1 40); do
    if curl -s -o /dev/null "http://localhost:$PORT"; then
      open "http://localhost:$PORT"
      exit 0
    fi
    sleep 0.5
  done
) &

printf '  Startet auf http://localhost:%s\n' "$PORT"
printf '  Dieses Fenster offen lassen. Zum Beenden: Strg+C\n\n'
node server/index.js
