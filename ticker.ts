// The "ALSO ON" band at the foot of the page: the day's further stories, one line each,
// every line led by its dateline so a reader knows where it happened without the art.
//
// It draws only through the page's own primitives, handed over in `g`, so it shares the
// renderer, the stroke font and the palette of main.ts. Plain JavaScript syntax, like main.ts.

export const TICKER = [
  { where: 'VIENNA', text: 'US, UK, FRANCE AND GERMANY PRESS IRAN AT THE IAEA TO READMIT INSPECTORS TO BOMBED NUCLEAR SITES' },
  { where: 'BEIJING', text: "CHINA CURBS EXPORTS OF DRONE ENGINES USED IN RUSSIA'S GERAN ATTACK DRONES" },
  { where: 'WASHINGTON', text: "TRUMP ASKS SUPREME COURT, FOR A THIRD TIME, TO END VENEZUELANS' TPS PROTECTIONS" },
];

// g: { fillRect, fillCircle, drawText, measure, KICK, BODY, NAVY, RED, GOLD }
// The band fills x0..x0+w, y0..y0+h; `margin` is the page margin the red day box sits in.
// Returns the type size it chose, so the caller can report it.
export function drawTicker(g, items, x0, y0, w, h, margin, day) {
  g.fillRect(x0, y0, w, h, g.NAVY);

  // the red day box on the left
  const boxW = 96;
  g.fillRect(x0 + margin, y0 + 9, boxW, h - 18, g.RED);
  const boxO = Object.assign(g.KICK(11), { align: 'center' });
  g.drawText('ALSO ON', x0 + margin + boxW / 2, y0 + 17, 11, '#ffffff', boxO);
  g.drawText(day, x0 + margin + boxW / 2, y0 + 34, 11, '#ffffff', boxO);

  // Datelines right-aligned against a thin gold rule, the briefs in white after it. The datelines
  // already mark each line, so there are no bullets, and their tracking is light so the column
  // stays narrow and the briefs keep their size. One size for every line: the largest at which
  // the longest line still fits the band.
  const where = (size) => Object.assign(g.KICK(size), { track: 0.5, align: 'right' });
  const left = x0 + margin + boxW + 12;
  const right = x0 + w - margin;
  const colOf = (size) => Math.max(...items.map(it => g.measure(it.where, size, where(size))));
  let s = 11;
  while (s > 8 && !items.every(it => left + colOf(s) + 16 + g.measure(it.text, s, g.BODY(s)) <= right)) s -= 0.25;
  const ruleX = left + colOf(s) + 8;

  // centre the block of lines in the band, whatever its height
  const pitch = s * 1.6;
  const top = y0 + (h - ((items.length - 1) * pitch + s)) / 2;
  g.fillRect(ruleX - 0.75, top - 1, 1.5, (items.length - 1) * pitch + s + 2, g.GOLD);
  items.forEach((it, i) => {
    const ly = top + i * pitch;
    g.drawText(it.where, ruleX - 8, ly, s, g.GOLD, where(s));
    g.drawText(it.text, ruleX + 8, ly, s, '#ffffff', g.BODY(s));
  });
  return s;
}
