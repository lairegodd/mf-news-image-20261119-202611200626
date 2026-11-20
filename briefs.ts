// "The rest of the day, region by region": the page's breadth panel. Every brief is an event that
// happened, or was first reported, on Thursday 19 November 2026, led by its dateline and grouped
// under a colour-coded region so a reader sees at a glance how much of the world the page covers.
// Briefs are kept to about 60 characters so each reads as one short label of at most two lines.
//
// Like ticker.ts it draws only through the page's own primitives, handed over in `g`, so it shares
// the renderer, the stroke font and the palette of main.ts. Plain JavaScript syntax.

export const REGIONS = [
  { name: 'ASIA-PACIFIC', color: '#b5321c', items: [
    ['SEOUL', "Top court voids ex-PM Han Duck-soo's 15-year term, orders retrial"],
    ['BEIJING', "China curbs exports of engines for Russia's Geran drones"],
    ['SHENZHEN', 'Thai PM backs tying ASEAN power grid to a Japan clean-energy plan'],
    ['SEOUL', 'South Korea, US and 11 more nations pledge to fight online scams'],
  ] },
  { name: 'EUROPE', color: '#1f4e9c', items: [
    ['COPENHAGEN', 'Danish MPs ratify the Greenland defence pact with the US'],
    ['BRUSSELS', 'AI-powered cyberattack hits European Commission HR systems'],
    ['WARSAW', 'Tusk on Trump\'s "my friend" Putin: "God, protect us from such friends"'],
    ['VIENNA', 'Kyiv slams IAEA plan to give a sanctioned Russian a senior post'],
  ] },
  { name: 'MIDDLE EAST', color: '#a35a12', items: [
    ['VIENNA', 'US, UK, France and Germany press Iran to readmit IAEA inspectors'],
    ['GAZA', 'Israel ends raid past the "Yellow Line"; Salah al-Din road reopens'],
    ['TEHRAN', 'Revolutionary Guards reject a "neither war nor peace" stand-off'],
    ['LEBANON', 'Israeli strikes hit the south; army chief warns of displacement'],
  ] },
  { name: 'AFRICA', color: '#2e7d32', items: [
    ['MOGADISHU', 'Somalia expels the UAE ambassador and recalls its own envoy'],
    ['NIGERIA', 'All 36 state assemblies back a change allowing state police'],
    ['HARARE', "Court reserves judgment on extending Mnangagwa's term to 2030"],
    ['NAIROBI', 'Kenya rolls out 10.8 million mosquito nets in 18 counties'],
    ['ACCRA', 'Ghana defends its $61m presidential jet as critics decry the cost'],
  ] },
  { name: 'AMERICAS', color: '#6a3d9a', items: [
    ['WASHINGTON', "Trump asks Supreme Court a third time to end Venezuelans' TPS"],
    ['BRAZIL', 'Real hits a 19-month low despite a $1BN central-bank dollar sale'],
    ['COLOMBIA', "Pilot cull to put down 10 of Pablo Escobar's invasive hippos"],
    ['NEW YORK', "City to demolish a Brooklyn block next to last week's deadly collapse"],
    ['ARGENTINA', 'Peter Thiel lifts his stake in Vaca Muerta oil firm Vista by 58%'],
  ] },
  { name: 'SCIENCE · TECH · SPORT', color: '#00756a', items: [
    ['GAMING', 'Grand Theft Auto VI goes on sale after a 13-year wait'],
    ['CYBER', 'US agency CISA urges an urgent patch for a server-hijacking Java flaw'],
    ['SPACE', "Long March 2D rocket puts China's Shijian-24 satellite in orbit"],
    ['TENNIS', 'ATP Finals: Zverev unbeaten in his group; Shelton into first semi'],
    ['SCIENCE', 'MIT study: data centres foul the air far beyond their own sites'],
  ] },
];

export const BRIEF_COUNT = REGIONS.reduce((n, r) => n + r.items.length, 0);

// g: { fillRect, drawText, measure, KICK, BODY, INK, NAVY, GOLD, CARD }
// Fills the panel x..x+w, y..y+h. Returns the brief type size it chose.
export function drawBriefs(g, x, y, w, h) {
  g.fillRect(x, y, w, h, g.CARD);
  // header bar
  const barH = 22;
  g.fillRect(x, y, w, barH, g.NAVY);
  g.drawText('THE REST OF THE DAY, REGION BY REGION', x + 12, y + 6, 10.5, g.GOLD, g.KICK(10.5));
  g.drawText(BRIEF_COUNT + ' MORE STORIES, ALL FROM THURSDAY 19 NOVEMBER 2026', x + w - 12, y + 6, 10.5, '#ffffff', Object.assign(g.KICK(10.5), { align: 'right' }));

  const pad = 12, gap = 16, cols = 3;
  const colW = (w - 2 * pad - (cols - 1) * gap) / cols;
  const top = y + barH + 8, avail = y + h - 6 - top;

  // Lay one brief out: a bullet, the dateline in the region's colour, then the text, wrapped with
  // the first line starting after the dateline and the rest under the dateline's left edge.
  const indent = 9;
  const kick = (s) => Object.assign(g.KICK(s * 0.94), { track: 0.4 });
  const body = (s) => Object.assign(g.BODY(s), { sx: 0.82 });
  const layoutItem = (where, text, s) => {
    const kO = kick(s), bO = body(s);
    const lead = g.measure(where, s * 0.94, kO) + s * 0.5;
    const lines = [];
    let cur = '', maxW = colW - indent - lead;
    for (const wd of text.split(' ')) {
      const t = cur ? cur + ' ' + wd : wd;
      if (cur && g.measure(t, s, bO) > maxW) { lines.push(cur); cur = wd; maxW = colW - indent; } else cur = t;
    }
    if (cur) lines.push(cur);
    return { lines, lead, kO, bO };
  };
  const pitch = (s) => s * 1.34;
  const itemGap = 2.5, regionGap = 5;
  const headH = (s) => s + 8;

  // Flow the briefs down three columns in order. A region's chip opens it, and is repeated at the top
  // of a column the region continues into, so every brief sits under its region; a chip is never left
  // alone at the foot of a column. Returns the placements, or null when the briefs overflow.
  const flow = (s) => {
    const out = [];
    let c = 0, cy = 0;
    for (const r of REGIONS) {
      let needHead = true;
      if (cy > 0) cy += regionGap;
      for (const [wh, tx] of r.items) {
        const it = layoutItem(wh, tx, s);
        const ih = it.lines.length * pitch(s);
        if (cy + (needHead ? headH(s) : 0) + ih > avail) {
          if (++c >= cols) return null;
          cy = 0; needHead = true;
        }
        if (needHead) { out.push({ kind: 'head', r, c, cy }); cy += headH(s); needHead = false; }
        out.push({ kind: 'item', r, c, cy, wh, it });
        cy += ih + itemGap;
      }
    }
    return out;
  };
  // The largest size at which everything fits.
  let s = 10.5, placed = null;
  for (; s >= 8.5; s -= 0.25) if ((placed = flow(s))) break;
  if (!placed) throw new Error('briefs do not fit the panel at 8.5px');

  for (let c = 1; c < cols; c++) g.fillRect(x + pad + c * (colW + gap) - gap / 2 - 0.5, top, 1, avail, '#d9d3c7');
  for (const p of placed) {
    const cx = x + pad + p.c * (colW + gap), cy = top + p.cy, r = p.r;
    if (p.kind === 'head') {
      // region chip and a thin rule in its colour
      const nO = Object.assign(g.KICK(s - 0.5), { track: 1.1 });
      const nw = g.measure(r.name, s - 0.5, nO);
      g.fillRect(cx, cy, nw + 10, s + 4, r.color);
      g.drawText(r.name, cx + 5, cy + 2, s - 0.5, '#ffffff', nO);
      g.fillRect(cx + nw + 14, cy + (s + 4) / 2 - 0.5, colW - nw - 14, 1.2, r.color);
    } else {
      const it = p.it;
      g.fillRect(cx + 1, cy + s * 0.3, 4, 4, r.color);
      g.drawText(p.wh, cx + indent, cy + s * 0.03, s * 0.94, r.color, it.kO);
      it.lines.forEach((ln, k) => g.drawText(ln, cx + indent + (k === 0 ? it.lead : 0), cy + k * pitch(s), s, g.INK, it.bO));
    }
  }
  return s;
}
