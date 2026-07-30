FCTC v9.3 — PERFORMANCE AUDIT + FIXES
======================================
Na-audit ko ang dev branch (commit 88d82de) at sinukat ang totoong
load times sa headless browser. Eto ang nakita at ang ginawa.

╔════════════════════════════════════════════════════════════════╗
║  SINUKAT NA RESULTA (simulated 1.2s GAS latency, 60ms/asset)   ║
╠════════════════════════════════════════════════════════════════╣
║                        DATI        NGAYON      IMPROVEMENT     ║
║  Cold load requests    54          32          -41%            ║
║  CSS file requests     23          1           -96%            ║
║  Home (logged in)      4,294 ms    2,961 ms    -31%            ║
║  Open a project        6,764 ms    5,507 ms    -19%            ║
║  2nd project open      4 API calls 1 API call  -75%            ║
╚════════════════════════════════════════════════════════════════╝


ANO ANG NAGPAPABAGAL — AT ANG AYOS
===================================

■ BOTTLENECK 1: CSS @import waterfall  ★ pinakamalaking "buffer" feel
  Ang css/main.css ay may 22 @import. Ang @import ay SERIAL at
  RENDER-BLOCKING: kailangan munang ma-download at ma-parse ang
  main.css bago pa lang MADISKUBRE ng browser ang 22 files, tapos
  pipila pa sila. Ito ang puting screen / "buffer" na nakikita niyo
  bago lumitaw ang UI — bawat page load, bawat hard refresh.
  AYOS: bagong tools/build-css.js na nagbu-bundle ng lahat sa ISANG
  css/bundle.css (parehong-pareho ang cascade order — na-verify na
  walang nawalang rule). 23 requests → 1.
  ANTI-FOOTGUN: may GitHub Action (.github/workflows/build-css.yml)
  na awtomatikong nagre-rebuild ng bundle kapag may binago sa css/.
  Modular pa rin ang sources — doon ka pa rin mag-e-edit.

■ BOTTLENECK 2: Project open = DALAWANG magkasunod na wave
  Ang getProjectData ay hinihintay munang matapos BAGO pa lang
  simulan ang 3 catalog calls (materials/equipment/manpower) — kahit
  HINDI naman sila magkadepende. Dalawang buong round-trip bawat
  pagbukas ng proyekto.
  AYOS: sabay-sabay na silang pinapaputok. Sa sukat, ang 4 API calls
  ay nasa +0ms na lahat (dati: +0ms tapos +1226ms).

■ BOTTLENECK 3: Paulit-ulit na catalog fetch
  Ang approved Materials/Equipment/Manpower ay kinukuha sa TUWING
  magbubukas ng proyekto, kahit bihirang magbago.
  AYOS: 5-minutong cache (DataService.getCatalogs) na agad ding
  ini-invalidate sa BAWAT approve path — kaya imposibleng ma-stale
  ang dropdowns. Resulta: 2nd project open = 1 API call na lang
  (dati 4).

■ BOTTLENECK 4: Approval badge = 13-sheet read sa BAWAT navigation
  Tuwing lilipat ng page, tinatawag ng App.navigate() ang
  getPendingApprovals() para lang sa numero sa badge — at nagbabasa
  iyon ng ~13 sheets sa server.
  AYOS: 45-segundong TTL cache + in-flight de-duplication (kung may
  kasalukuyang tumatakbo nang request, sasakay na lang dito imbes na
  mag-request ulit). Ang Approvals PAGE mismo ay laging fresh
  (force=true), at ang anumang approve/reject ay agad na nagpapatak
  ng cache.

■ BOTTLENECK 5: 6 na sheets na hindi kasama sa batched prefetch
  Ang mga v9 additions — Users, OTRequests, Punchlist, SafetyRecords,
  Drawings, Personnel — ay binabasa nang isa-isa PAGKATAPOS ng
  readMany_ batch ng getProjectData. 6 dagdag na Sheets round-trip
  bawat pagbukas.
  AYOS: kasama na sila sa iisang batch.

■ BOTTLENECK 6: EVM S-curve — quadratic, at pinalala ng v9  ★★ CPU
  Para sagutin ang "ano ang % ng SOW X noong petsang D", sinasalakay
  ng code ang LAHAT ng daily records — at ginagawa iyon nang isang
  beses kada (bucket x SOW). Nang idinagdag ang WEEKLY series sa v9
  (hanggang 60 buckets), dumami nang 4x.
  Sinukat ko:
     Bagong project (3 buwan) :     48,600 iterations  (~0.03s)
     Katamtaman (8 buwan)     :    607,500 iterations  (~0.4s)
     Mahaba (18 buwan)        :  5,308,800 iterations  (~3.5s)
  At lumalaki ito habang dumadami ang daily records — kaya bumabagal
  ang sistema habang tumatagal ang proyekto.
  AYOS: buildProgressIndex_() — isang pass lang sa daily records para
  makabuo ng per-SOW timeline, tapos binary search bawat bucket.
  PATUNAY: 14,400 randomized comparisons (kasama ang mga magulong
  kaso: rejected records, blangkong petsa, null work arrays, doble
  ang SOW sa isang araw) → 0 mismatch. EKSAKTONG PAREHO ang numero,
  napakaliit na lang ng trabaho.


DEPLOYMENT
==========
BACKEND (1 file) — i-paste sa Apps Script, tapos Deploy ▸ Manage
deployments ▸ Edit ▸ NEW VERSION ▸ Deploy:
    backend/05-ProjectService.gs

FRONTEND (6 files) — i-push sa dev:
    index.html                        (naka-turo na sa bundle.css)
    css/bundle.css                    (BAGO — generated)
    tools/build-css.js                (BAGO — bundler)
    .github/workflows/build-css.yml   (BAGO — auto-rebuild)
    js/services/data-service.js       (catalog + pending caches)
    js/pages/project/project-core.js  (parallel project open)
    js/pages/approvals.js             (forces fresh approvals)

WALANG migrateSchemas na kailangan. Pagkatapos: hard refresh.

VERIFIED (E2E sa mismong app, headless):
  ✓ Lahat ng 13 project tabs nagre-render pa rin
  ✓ Tamang styling (navy topbar, Inter font) — walang nawalang CSS
  ✓ Walang page errors
  ✓ 2nd project open = 1 API call lang
  ✓ EVM numbers identical (14,400 checks)


MGA REKOMENDASYON NA HINDI KO PA GINAWA
========================================
Nag-iingat ako sa mga ito dahil mas malaki ang risk o may kailangang
desisyon mo muna. Sabihin mo lang kung alin ang gusto mong ituloy.

(1) BUNDLE-IN ANG 28 JS FILES  → maliit-katamtamang panalo
    28 separate <script> requests pa rin. Kaya ko itong i-bundle
    tulad ng CSS (safe: plain globals lang, walang module system).
    HINDI KO MUNA GINAWA dahil araw-araw kang nag-e-edit ng JS —
    mas mahirap i-debug ang bundled file at may panganib na stale.
    Kung gusto mo, gagawa ako ng katulad na GitHub Action + source
    map para hindi mahirapan sa debugging.

(2) LIMITAHAN ANG DAILY RECORDS NA IBINABALIK  → MALAKING panalo
    habang lumalaki ang data
    Ang getProjectData ay nagbabalik ng LAHAT ng daily record ng
    proyekto, kasama ang buong nested JSON (manpower, work, photos,
    atbp.). Sa isang taong proyekto, libo-libong rows ang pumapasok
    sa isang payload kahit ang Site Daily Log ay ~20 lang ang
    pinapakita.
    MUNGKAHI: ibalik ang huling ~60 records para sa listahan, at
    ilagay sa hiwalay na tawag ang "load older". Ang progress at EVM
    ay computed na sa server kaya hindi maaapektuhan ang tama ng
    numero. Ito ang pinaka-epektibong susunod na hakbang.

(3) ARCHIVE ANG LUMANG DAILY RECORDS TAUN-TAON
    Ang readAll_ ay nagbabasa ng BUONG sheet bago mag-filter. Kapag
    umabot na ng ilang libong rows ang DailyRecords, lahat ng
    project open ay magbabayad para doon. Mungkahi: taunang
    "DailyRecords_2026" archive sheet, at ang aktibo lang ang
    binabasa. (Kailangan ng maliit na migration — sabihin mo lang.)

(4) PAGHIWALAYIN ANG "MABIGAT" NA BAHAGI NG PROJECT PAYLOAD
    Ang punchlist, safety, drawings, at attendance ay hindi naman
    kailangan sa unang paglabas ng Overview. Pwedeng i-load nang
    on-demand kapag pinindot ang tab — mas mabilis ang unang paglitaw.

(5) CACHE ANG getHomeData NANG MAIKLI
    Mabilis lang ito ngayon, pero kapag dumami na ang proyekto,
    makakatulong ang 30-60s TTL tulad ng ginawa sa approvals.

(6) LOADING SKELETON SA PROJECT TABS
    May skeleton na ang project page (maganda ito). Kung ilalagay
    ang (4), kailangan din ng maliit na skeleton bawat tab para hindi
    magmukhang "nakabitin".
