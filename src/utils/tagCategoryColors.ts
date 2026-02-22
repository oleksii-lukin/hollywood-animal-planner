/** Per-genre tag chip classes – colors from the game. */
export const genreTagClasses: Record<string, string> = {
  DRAMA: 'border-[#2c3761] bg-[#2c3761]/20 text-[#9ba8d4]',
  COMEDY: 'border-[#325964] bg-[#325964]/20 text-[#9ab8c8]',
  ADVENTURE: 'border-[#315247] bg-[#315247]/20 text-[#8aaa8a]',
  ACTION: 'border-[#5c2b1e] bg-[#5c2b1e]/20 text-[#d49a8a]',
  THRILLER: 'border-[#714042] bg-[#714042]/20 text-[#d48a94]',
  ROMANCE: 'border-[#4c6234] bg-[#4c6234]/20 text-[#9aba7a]',
  HISTORICAL: 'border-[#926339] bg-[#926339]/20 text-[#e4c89a]',
  DETECTIVE: 'border-[#603556] bg-[#603556]/20 text-[#c49aaa]'
}

const defaultGenreClasses = 'border-purple-500/50 bg-purple-500/10 text-purple-300'

/** Shared tag chip colors by category – from the game. */
export const tagCategoryColors: Record<string, string> = {
  'Genre': defaultGenreClasses,
  'Setting': 'border-blue-500/50 bg-blue-500/10 text-blue-300',
  'Protagonist': 'border-[#3a5f42] bg-[#3a5f42]/20 text-[#9aba9a]',
  'Antagonist': 'border-[#664fa8] bg-[#664fa8]/20 text-[#b8a8e4]',
  'Supporting Character': 'border-[#5a849a] bg-[#5a849a]/20 text-[#a8c8d8]',
  'Theme & Event': 'border-[#995f4f] bg-[#995f4f]/20 text-[#e4b0a0]',
  'Finale': 'border-[#945479] bg-[#945479]/20 text-[#d89ab8]'
}

const fallbackClasses = 'border-border bg-panel/60 text-text-muted'

/** Get chip classes; for Genre pass tagId to use game genre color. */
export function getTagCategoryClasses(category: string, tagId?: string): string {
  if (category === 'Genre' && tagId && genreTagClasses[tagId]) {
    return genreTagClasses[tagId]
  }
  return tagCategoryColors[category] ?? fallbackClasses
}

/** For TagSelector sliders: bg, border, track by genre tag id. */
export const genreTagSliderColors: Record<string, { bg: string; border: string; track: string }> = {
  DRAMA: { bg: 'bg-[#2c3761]/30', border: 'border-[#2c3761]', track: '#2c3761' },
  COMEDY: { bg: 'bg-[#325964]/30', border: 'border-[#325964]', track: '#325964' },
  ADVENTURE: { bg: 'bg-[#315247]/30', border: 'border-[#315247]', track: '#315247' },
  ACTION: { bg: 'bg-[#5c2b1e]/30', border: 'border-[#5c2b1e]', track: '#5c2b1e' },
  THRILLER: { bg: 'bg-[#714042]/30', border: 'border-[#714042]', track: '#714042' },
  ROMANCE: { bg: 'bg-[#4c6234]/30', border: 'border-[#4c6234]', track: '#4c6234' },
  HISTORICAL: { bg: 'bg-[#926339]/30', border: 'border-[#926339]', track: '#926339' },
  DETECTIVE: { bg: 'bg-[#603556]/30', border: 'border-[#603556]', track: '#603556' }
}
