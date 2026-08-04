#!/bin/bash
# Doppelklicken startet URAI. Mehr braucht es nicht.
cd "$(dirname "$0")" || exit 1

printf '\n  URAI\n  ────\n\n'

if ! command -v node >/dev/null 2>&1; then
  printf '  Node fehlt noch.\n'
  printf '  Hol es bei https://nodejs.org — Version 22 oder neuer.\n'
  printf '  Danach diese Datei nochmal doppelklicken.\n\n'
  read -r -p '  Enter zum Schliessen '
  exit 1
fi

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 22 ]; then
  printf '  Node %s ist zu alt — URAI braucht 22 oder neuer.\n' "$(node -v)"
  printf '  Neue Version bei https://nodejs.org\n\n'
  read -r -p '  Enter zum Schliessen '
  exit 1
fi

if [ ! -d node_modules ]; then
  printf '  Einmalig: Bausteine werden geladen. Das dauert ein, zwei Minuten …\n\n'
  if ! npm install; then
    printf '\n  Das Laden ging schief. Steht oben, woran es lag?\n\n'
    read -r -p '  Enter zum Schliessen '
    exit 1
  fi
fi

# Der Browser geht erst auf, wenn der Server wirklich antwortet
(
  for _ in $(seq 1 40); do
    if curl -s -o /dev/null http://localhost:3017; then
      open http://localhost:3017
      exit 0
    fi
    sleep 0.5
  done
) &

printf '  Startet auf http://localhost:3017\n'
printf '  Dieses Fenster offen lassen. Zum Beenden: Strg+C\n\n'
npm start
