// Text auf einem Bild erkennen — mit Apples Vision-Framework.
// Eingebaut in macOS, kostet nichts, braucht kein Netz.
// Aufruf: osascript -l JavaScript ocr.jxa.js <bild.png>
// Ausgabe: JSON [{t, x, y, w, h}] — Koordinaten 0..1, Ursprung links UNTEN.
ObjC.import('Vision')
ObjC.import('Foundation')

function run(argv) {
  const url = $.NSURL.fileURLWithPath(argv[0])
  const handler = $.VNImageRequestHandler.alloc.initWithURLOptions(url, $())
  const req = $.VNRecognizeTextRequest.alloc.init
  req.recognitionLevel = 0 // 0 = genau, 1 = schnell
  req.usesLanguageCorrection = true
  try {
    req.recognitionLanguages = $(['de-DE', 'en-US'])
  } catch (e) {}

  const err = Ref()
  handler.performRequestsError($([req]), err)

  const results = req.results
  if (!results) return '[]'
  const out = []
  const n = results.count
  for (let i = 0; i < n; i++) {
    const obs = results.objectAtIndex(i)
    const cands = obs.topCandidates(1)
    if (!cands || cands.count === 0) continue
    const cand = cands.objectAtIndex(0)
    const bb = obs.boundingBox
    out.push({
      t: ObjC.unwrap(cand.string),
      c: cand.confidence,
      x: bb.origin.x,
      y: bb.origin.y,
      w: bb.size.width,
      h: bb.size.height,
    })
  }
  return JSON.stringify(out)
}
