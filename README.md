# Hollywood Animal Planner

**Companion web app for [Hollywood Animal](https://store.steampowered.com/app/2680550/Hollywood_Animal/)** — plan movie tags, check synergies and conflicts, calculate Art & Commercial scores, build release plans, generate scripts, and analyze advertisers. Load a save file to use your in-game tag pool, view raid/trial intel, and link in-game movies to pinned scripts.

This is a rewritten and extended version of [CallOn84/Hollywood-Animal-Calculator](https://github.com/CallOn84/Hollywood-Animal-Calculator/).

**Try it:** [https://userbig.github.io/hollywood-animal-planner/](https://userbig.github.io/hollywood-animal-planner/)

---

## Features

| Section | Description |
|--------|-------------|
| **Board** | Pin scripts (from Generator or import), filter by source/status, sort by date/score/compatibility. Mark scripts as “released”, link them to in-game movies from a loaded save, archive/restore backlog. Quick actions: open Synergy, Advertisers, or Plan. |
| **Release Plan** | 9-slot plan (e.g. 2 films/year × 2.5 years). Fill slots from Board or generate on the fly. Uniqueness: allow tag repetition or enforce low/medium/high across slots. Plan history (snapshots). |
| **Script Generator** | Batch generation with target compatibility and target movie score. Locked/excluded tags, profiles: custom, starting tags, save-based, or preset. Optional “skip low quality” and “fully diverse tags”. Backlog of generated scripts, pin to Board. |
| **SE Compatibility** | Pick tags and see synergy result: average compatibility, Art/Commercial bonuses, effective scores, tag cap, conflict detection. Links to Best Advertisers. |
| **Best Advertisers** | Pick tags and see which advertisers (NBG, Spark, Velvet Gloss, etc.) fit best by demographic and type (Universal/Art/Commercial). Pre-release / release / post-release phases, owned theatres. |
| **Save file** | Load a Hollywood Animal `.json` save. Use tag pool/codex from save in Generator and filters. Optional “secrets” parsing: police raid dates, surveillance, trials, secrets history. “Our movies” list and link to pinned scripts. |
| **Localization** | UI in English, Ukrainian, Russian, German, French, Spanish, Portuguese, Japanese, Chinese, Belarusian. |
| **Themes** | Default, Warm, Valve (clear). Persisted in `localStorage`. |

---

## Project structure

```
hollywood-animal-planner/
├── index.html              
├── package.json            
├── vite.config.ts          
├── tailwind.config.js      
├── assembly/
│   └── index.ts            # AssemblyScript: compatibility matrix, tag bonuses, matrix score, script generator candidate swap (WASM)
├── public/
│   ├── fonts/              
│   ├── wasm/
│   │   └── release.wasm    # Built from assembly/ (npm run wasm:build)
│   ├── data/               # Game data (loaded at runtime)
│   │   ├── TagData.json
│   │   ├── TagsAudienceWeights.json
│   │   ├── TagCompatibilityData.json
│   │   └── GenrePairs.json
│   └── localization/       # English.json, Ukrainian.json, etc.
├── src/
│   ├── main.ts             # Vue app, Pinia + persisted statet
│   ├── App.vue             # Tab routing (#board, #plan, #generator, #synergy, #advertisers), gameData + WASM init
│   ├── style.css           # Tailwind + global CSS variables (themes)
│   ├── types/
│   │   └── game.ts         # Tag, Demographic, TagInput, SavedScript, PlanSlotEntry, ParsedSaveData, SaveSecretsInfo, etc.
│   ├── stores/
│   │   ├── calculator.ts   # Tags (synergy/advertisers/generator/excluded), scores, generator state, pinned scripts, plan slots, save data, game-movie links
│   │   ├── gameData.ts     # Tags, compatibility, genre pairs, demographics, ad agents, holidays, localization, loadData/loadLocalization
│   │   └── theme.ts        # Theme id (default/warm/valve), persist + apply to document
│   ├── utils/
│   │   ├── wasmCalculator.ts   # Load WASM, init matrix from gameData, calculateMatrixScoreWasm, trySwapCandidatesWasm
│   │   ├── calculator.ts       # Matrix score (WASM or JS fallback), bonuses, audience affinity, formatScore
│   │   ├── saveFileParser.ts   # Parse .json save → ParsedSaveData, optional secrets (raid, trials, our movies)
│   │   ├── scriptGenerator.ts # runGenerationAttempts, runGenerationAlgorithm (locked/excluded/avoid tags, WASM swap)
│   │   ├── tagCategoryColors.ts # Category → color for UI
│   │   └── resetAll.ts         # Reset calculator state (for dev/debug)
│   └── components/
│       ├── Navbar.vue          # Save upload, language, theme, modals (Save data, Debug), multi-tab warning
│       ├── TabNavigation.vue   # Tabs: Board, Release Plan | Script Generator, SE Compatibility, Best Advertisers
│       ├── tabs/
│       │   ├── BoardTab.vue       # Pinned scripts list, filters, link to movies, archive, open Plan/Generator/Synergy/Advertisers
│       │   ├── PlanTab.vue       # 9 slots, uniqueness settings, fill from Board or generate, history
│       │   ├── GeneratorTab.vue  # Locked/excluded tags, batch size, targets, generate → backlog, pin
│       │   ├── SynergyTab.vue    # Tag selector → compatibility result, Art/Com scores
│       │   └── AdvertisersTab.vue # Tag selector → best advertisers by phase
│       ├── TagSelector.vue       # Category panels, tag list, percent sliders (Genre), codex highlight
│       ├── GeneratorPanel.vue    # Reusable panel for generator (Board + Plan)
│       ├── SaveFileUpload.vue    # File input + parse + load into store
│       ├── SaveDataModal.vue     # Save info (tags, codex, game date, secrets summary)
│       ├── OurMoviesModal.vue    # Movies from save, link to pinned script
│       ├── AdvertiserAnalysisModal.vue
│       ├── SaveSecretsModal.vue
│       ├── DebugModal.vue
│       ├── QuickSearch.vue
│       ├── LanguageSelector.vue
│       ├── AppHeader.vue
│       ├── ScriptCard.vue
│       └── ui/
│           ├── Card.vue
│           ├── CardHeader.vue
│           ├── Modal.vue
│           └── Button.vue
├── tests/
│   ├── calculator.test.ts  # Matrix score, bonuses
│   └── wasm.test.ts        # WASM init + score (when built)
└── build/                  # AssemblyScript output (release.js, release.wasm, release.d.ts) — WASM copied to public/wasm by script
```

---

## Tech stack

- **Vue 3** (Composition API, `<script setup>`)
- **Pinia** + **pinia-plugin-persistedstate** (persist calculator state, theme)
- **Vite** (build, dev server, base path for GitHub Pages)
- **TypeScript**
- **Tailwind CSS** (theme via CSS variables)
- **Vue Router** (hash routes for tabs only)
- **AssemblyScript** → WebAssembly for heavy matrix/synergy and generator candidate swap (with JS fallback if WASM fails)
- **Vitest** for unit tests

---

## Data and localization

- **Game data** in `public/data/`: tags (TagData, TagsAudienceWeights), compatibility matrix (TagCompatibilityData), genre pairs (GenrePairs). Loaded once in `gameData.loadData()`.
- **Localization** in `public/localization/*.json`: key → translated string. Loaded by `gameData.loadLocalization(lang)`; tag names fall back to `beautifyTagName` from ID.

---

## Development

**Requirements:** Node.js ≥ 24 (see `.nvmrc`).

```bash
# Install
npm install

# Build WASM (required before full build)
npm run wasm:build

# Dev server
npm run dev

# Type-check + production build
npm run build

# Preview production build
npm run preview

# Tests
npm run test
# Watch: npm run test:watch
```

- **Build** runs `wasm:build` then `vue-tsc -b` and `vite build`. For GitHub Pages, `vite.config.ts` uses `base: '/hollywood-animal-planner/'` when `GITHUB_ACTIONS` is set.
- **WASM** is loaded from `public/wasm/release.wasm` at runtime; if it fails, matrix score falls back to JS in `calculator.ts`.

---

## License and credits

- **Hollywood Animal** is a game by its authors; this project is an unofficial fan tool.
- Rewritten and extended from [CallOn84/Hollywood-Animal-Calculator](https://github.com/CallOn84/Hollywood-Animal-Calculator/).
