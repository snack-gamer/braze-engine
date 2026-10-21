/** Reusable layout data. The scaffold also saves it on the HUD scene object's UI Canvas.
 * @type {import('@braze/game').UiDocument} */
export const collectLayout = {
  version: 1, enabled: true, order: 0,
  theme: { surface: '#102331ed', accent: '#77f2cc', text: '#f1fbff', muted: '#b0c8d5' },
  root: { id: 'root', kind: 'panel', style: { layout: 'column', width: '100%', height: '100%', padding: 16, justify: 'space-between', pointer: 'pass' },
    responsive: [{ minWidth: 700, style: { padding: 28 } }], children: [
      { id: 'header', kind: 'panel', style: { layout: 'column', gap: 10, align: 'start' }, responsive: [{ minWidth: 700, style: { layout: 'row', justify: 'space-between' } }], children: [
        { id: 'identity', kind: 'panel', style: { layout: 'column', padding: 18, gap: 3, background: '$surface', radius: 16 }, children: [
          { id: 'eyebrow', kind: 'text', text: 'BRAZE / FIELD TEST', style: { color: '$accent', fontSize: 11, fontWeight: 700 } },
          { id: 'title', kind: 'text', text: 'Collect Three', style: { color: '$text', fontSize: 26, fontWeight: 700 } },
          { id: 'subtitle', kind: 'text', text: 'Explore. Collect. Make it yours.', style: { color: '$muted', fontSize: 12 } },
        ] },
        { id: 'stats', kind: 'panel', style: { layout: 'row', gap: 12, padding: 14, align: 'center', background: '$surface', radius: 16 }, children: [
          { id: 'score', kind: 'text', text: '0 points', style: { color: '$accent', fontSize: 22, fontWeight: 700 } },
          { id: 'progress', kind: 'progress', label: '0 / 3 found', value: 0, max: 3, style: { width: 110, color: '$text', fontSize: 12 } },
        ] },
      ] },
      { id: 'notice', kind: 'panel', visible: false, style: { position: 'absolute', left: '10%', top: '38%', width: '80%', layout: 'column', gap: 14, padding: 24, background: '$surface', color: '$text', radius: 20, pointer: 'block' }, children: [
        { id: 'noticeTitle', kind: 'text', text: 'Your next discovery', style: { fontSize: 26, fontWeight: 700 } },
        { id: 'noticeText', kind: 'text', text: 'Find three orange cubes. Move close, then press E. The raised platform is a good place to practice jumping.' },
        { id: 'close', kind: 'button', text: 'Back to the game', action: 'close', style: { background: '$accent', color: '#102331', radius: 10, fontWeight: 700 } },
      ] },
      { id: 'footer', kind: 'panel', style: { layout: 'row', gap: 12, align: 'end', justify: 'space-between' }, children: [
        { id: 'hint', kind: 'text', text: 'WASD · Move   Space · Jump   E · Collect', style: { background: '$surface', padding: 12, radius: 12, fontSize: 12, color: '$muted', maxWidth: '72%' } },
        { id: 'help', kind: 'button', text: 'How to play', action: 'help', style: { background: '$accent', color: '#102331', radius: 12, fontWeight: 700 } },
      ] },
    ] },
};
