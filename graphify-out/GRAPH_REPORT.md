# Graph Report - .  (2026-07-12)

## Corpus Check
- Corpus is ~10,248 words - fits in a single context window. You may not need a graph.

## Summary
- 197 nodes · 314 edges · 16 communities (15 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.75)
- Token cost: 54,115 input · 0 output

## Community Hubs (Navigation)
- Onboarding & Notifications
- Expo Package Dependencies
- Auth & Profile Stats
- Timeline & Comparison Picker
- Calendar & Statistics
- Entry Comparison Logic
- New Entry Capture Flow
- App Config (app.json)
- NPM Package Manifest
- TypeScript Configuration
- Metro Bundler Config
- Root Layout & Query Client

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 20 edges
2. `supabase` - 17 edges
3. `Remory (project)` - 16 edges
4. `toLocalDateKey()` - 12 edges
5. `expo` - 11 edges
6. `getPhotoUrl()` - 7 edges
7. `getPhotoUrls()` - 7 edges
8. `Istatistikler()` - 6 edges
9. `NewEntry()` - 6 edges
10. `useCurrentWeek()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `.expo folder` --semantically_similar_to--> `.env file`  [INFERRED] [semantically similar]
  .expo/README.md → README.md
- `TabsLayout()` --calls--> `useAuth()`  [EXTRACTED]
  app/(tabs)/_layout.tsx → lib/useAuth.ts
- `AuthScreen()` --calls--> `useAuth()`  [EXTRACTED]
  app/(auth)/index.tsx → lib/useAuth.ts
- `Istatistikler()` --calls--> `useAuth()`  [EXTRACTED]
  app/(tabs)/istatistikler.tsx → lib/useAuth.ts
- `CalendarYear()` --calls--> `useAuth()`  [EXTRACTED]
  app/calendar-year.tsx → lib/useAuth.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **5 sekmeli ana navigasyon (Tabs Navigation)** — app_tabs_index, app_tabs_zaman_kapsulu, app_tabs_capture, app_tabs_istatistikler, app_tabs_profil [EXTRACTED 1.00]
- **Supabase backend integration (client + schema + RLS)** — lib_supabase, supabase_migrations_0001_init, readme_supabase, readme_rls_policies [INFERRED 0.85]

## Communities (16 total, 1 thin omitted)

### Community 0 - "Onboarding & Notifications"
Cohesion: 0.07
Nodes (23): devices.json, .expo folder, expo start command, .gitignore, settings.json, Ana Ekran implementation, Card flip animation (Kart çevirme animasyonu), Full data schema (ERD) (+15 more)

### Community 1 - "Expo Package Dependencies"
Cohesion: 0.07
Nodes (30): dependencies, base64-arraybuffer, expo, expo-constants, expo-file-system, expo-image, expo-image-manipulator, expo-image-picker (+22 more)

### Community 2 - "Auth & Profile Stats"
Cohesion: 0.24
Nodes (11): AuthScreen(), EditEntry(), useAllMeasurementTypes(), useEntry(), OffDayScreen(), Profil(), useProfileStats(), computeStreaks() (+3 more)

### Community 3 - "Timeline & Comparison Picker"
Cohesion: 0.17
Nodes (12): PickComparison(), usePickableEntries(), { width }, AnaEkran(), EntryRow, useTimelineEntries(), { width }, CapsuleEntry (+4 more)

### Community 4 - "Calendar & Statistics"
Cohesion: 0.23
Nodes (14): CalendarYear(), getMonthGrid(), MONTH_NAMES, MonthCalendar(), useYearEntries(), buildChartPath(), Istatistikler(), useCurrentWeek() (+6 more)

### Community 5 - "Entry Comparison Logic"
Cohesion: 0.19
Nodes (14): Compare(), ComparisonBody(), fmtDate(), useComparison(), deleteEntry(), EntryDetail(), useEntryDetail(), { width: SCREEN_WIDTH } (+6 more)

### Community 6 - "New Entry Capture Flow"
Cohesion: 0.20
Nodes (12): NewEntry(), useDefaultMeasurementTypes(), handleCapturePress(), handleResult(), pickFromCamera(), pickFromLibrary(), resizeAndCompress(), TabsLayout() (+4 more)

### Community 7 - "App Config (app.json)"
Cohesion: 0.13
Nodes (14): package, expo, android, backgroundColor, ios, name, orientation, plugins (+6 more)

### Community 8 - "NPM Package Manifest"
Cohesion: 0.14
Nodes (13): devDependencies, @babel/core, @types/react, typescript, main, name, private, scripts (+5 more)

### Community 9 - "TypeScript Configuration"
Cohesion: 0.29
Nodes (6): compilerOptions, paths, strict, extends, include, @/*

### Community 10 - "Metro Bundler Config"
Cohesion: 0.50
Nodes (3): config, { getDefaultConfig }, { withNativeWind }

## Knowledge Gaps
- **84 isolated node(s):** `name`, `slug`, `scheme`, `version`, `orientation` (+79 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Remory (project)` connect `Onboarding & Notifications` to `Auth & Profile Stats`, `Timeline & Comparison Picker`, `Calendar & Statistics`?**
  _High betweenness centrality (0.119) - this node is a cross-community bridge._
- **Why does `supabase` connect `Auth & Profile Stats` to `Onboarding & Notifications`, `Timeline & Comparison Picker`, `Calendar & Statistics`, `Entry Comparison Logic`, `New Entry Capture Flow`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Why does `useAuth()` connect `Auth & Profile Stats` to `Timeline & Comparison Picker`, `Calendar & Statistics`, `New Entry Capture Flow`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **What connects `name`, `slug`, `scheme` to the rest of the system?**
  _85 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Onboarding & Notifications` be split into smaller, more focused modules?**
  _Cohesion score 0.07096774193548387 - nodes in this community are weakly interconnected._
- **Should `Expo Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `App Config (app.json)` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._