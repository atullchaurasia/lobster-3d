# CLAUDE.md — Homarus HX-4 · Robotic Lobster Teardown Simulator

This file is the full brief for building and extending **Homarus HX-4**, an interactive 3D robotic lobster you can drive, take apart and record. Read all of it before writing code. Every rule here exists because something broke without it.

The reference implementation is `lobster.html` in this folder. When this file and the reference disagree, this file wins. When a detail isn't covered here, match the reference.

---

## 0. What we are building (one paragraph)

A single self-contained web page (about 60–70 KB of HTML/CSS/JS, plus three.js from a CDN) that shows a robotic lobster on a pale studio floor. The lobster walks on 8 legs, opens a crusher and a pincer claw, sways two long antennae, and escapes with a tail flip: the tail fan spreads, the 5-segment tail snaps under and the whole body darts backwards. Around the 3D view sits a dense instrument console. Every number on it is calculated live from one shared model. Every subsystem has a button that pulls that part apart while the rest steps aside. Left alone, a cursor drives the page through a 26-second tour. Any click hands control to the visitor, and 25 seconds of quiet hands it back.

Quality bar: it should look like a product reveal film, not a tech demo. Dense, precise, every part believable, nothing floating, nothing clipping, nothing typed in by hand.

---

## 1. Ground rules (non-negotiable)

1. **Model first.** Every moving part, every panel and every label reads from one model (`M` constants plus `S` state). Nothing is animated by hand. If a number appears on screen, it is computed from the same values that pose the 3D parts.
2. **Real units.** Metres, kilograms, newtons, seconds and degrees. Body mass 14 kg, so weight = 14 × 9.81 = 137 N. Write the hand-check of key numbers as comments next to the constants.
3. **Built from code.** No external 3D model files. Every part is generated geometry (boxes, cylinders, spheres, tori, cones, tapered tubes) merged per material per piece.
4. **One file, no build step.** `index.html` must open by double-click (`file://`) and on any static host. External scripts only from pinned CDNs (see §2).
5. **Keep it under 1 MB.** Anything large (textures, audio) lives next to the page as a separate file.
6. **Never hide a bug with the camera.** Fix collisions with a number in the parameter block.
7. **Check before showing.** Run the still-render checks in §13 after every meaningful change and look at the images.

---

## 2. Tech stack

| Thing | Choice | Notes |
|---|---|---|
| 3D | three.js **r128** UMD | `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js` |
| Geometry merge | `BufferGeometryUtils.js` r128 | `https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/utils/BufferGeometryUtils.js`, exposed as `THREE.BufferGeometryUtils` |
| Studio lighting | `RoomEnvironment.js` r128 | `https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/environments/RoomEnvironment.js`, fed through `PMREMGenerator` |
| Fonts | Google Fonts: **Archivo** (500/700/800) for display, **JetBrains Mono** (400/500/700) for all data and UI | Always give a fallback stack |
| Charts | Hand-drawn `<canvas>` 2D | No chart library |
| Testing | Node 20+, Playwright (Chromium) | Headless stills and frame capture |
| Video | ffmpeg | H.264 yuv420p faststart, GIF with palettegen |

Don't upgrade three.js without reason. r128 has the UMD `examples/js` builds this code relies on.

---

## 3. Suggested project layout in VS Code

```
homarus-hx4/
├── CLAUDE.md               ← this file
├── index.html              ← the simulator (start from lobster.html)
├── lobster.html            ← untouched reference copy
├── tools/
│   ├── stills.js           ← Playwright: render a still per tour beat (§13)
│   ├── record.js           ← Playwright: deterministic frame capture (§14)
│   └── vendor/             ← local copies of three.min.js etc. for offline tests
├── renders/                ← stills and contact sheets (git-ignored)
└── out/                    ← mp4 / gif (git-ignored)
```

Setup:

```bash
npm init -y
npm i -D playwright
npx playwright install chromium
# offline test copies of three r128:
npm pack three@0.128.0 && tar xzf three-0.128.0.tgz
cp package/build/three.min.js package/examples/js/utils/BufferGeometryUtils.js \
   package/examples/js/environments/RoomEnvironment.js tools/vendor/
```

For tests, write a copy of the page whose CDN URLs point at `tools/vendor/`. Headless Chrome may have no network access.

---

## 4. Visual language

### 4.1 Palette (CSS tokens on `:root`)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#F2F1EE` | Page and 3D studio background (scene background `0xF2F1EE`, fog 3.2 → 8 m) |
| `--panel` | `#FAF9F7` | Cards |
| `--ink` | `#141517` | Text, dark parts in charts |
| `--mute` | `#8A8C90` | Labels, units |
| `--rule` | `#E2E0DC` | Hairlines, chart tracks |
| `--accent` | `#E0321C` | Lobster red: the part that is working right now, active buttons, leader lines |
| `--ok` | `#1F9D6B` | Healthy status chips |

Rule: **one accent colour**. Red means "this is active / open / under load". Green chips mean "nominal". Never use red for decoration.

### 4.2 3D materials

| Key | Material | Values |
|---|---|---|
| `white` | MeshPhysical | color `#F4F3F0`, roughness .34, clearcoat .7, clearcoatRoughness .22, envMapIntensity .55 |
| `black` | MeshPhysical | `#141517`, roughness .26, metalness .35, clearcoat 1, ccRough .12, env .9 |
| `matte` | MeshStandard | `#1D1F22`, roughness .7, metalness .2 |
| `orange` (lobster red) | MeshPhysical | `#A81A06`, roughness .5, clearcoat .35, ccRough .3, **envMapIntensity .1** (higher values wash it out to peach) |
| `chrome` | MeshStandard | `#E9EBED`, roughness .14, metalness 1 |
| `steel` | MeshStandard | `#8B9097`, roughness .38, metalness .9 |
| `glass` | MeshPhysical | `#DDE6EC`, roughness .04, opacity .22, transparent, depthWrite false, renderOrder 2 |
| `lens` | MeshPhysical | near-black, roughness .05, clearcoat 1, env 1.6 |
| `glow` | MeshStandard | `#FF7A33`, emissive `#FF4A0A` × 1.6 (power core) |

Rules from experience:
- These are sRGB values. three r128 takes hex colours as linear, so convert every material colour (and emissive) with `convertSRGBToLinear()` once at load. Without it lobster red renders peach and black renders mid-grey. Flat studio marks (floor, specks, rings, footholds, trails) are converted too and set `toneMapped = false`, so they show their exact palette colour.
- Metal roughness **at least 0.14 for chrome and 0.38 for steel**. Lower values streak white against the bright studio.
- Coloured paint needs a **low envMapIntensity**, or ACES tone mapping plus the white room turns red into orange-peach.
- Near-white parts against a near-white floor disappear. Keep black ribs and red bands on every white part so its outline reads.

### 4.3 Renderer and lights

- `outputEncoding = sRGBEncoding`, `toneMapping = ACESFilmic`, exposure 1.0, `PCFSoftShadowMap`.
- Pixel ratio = min(devicePixelRatio, 2).
- Hemisphere light (white / `#E6E2DA`, .35), key directional light `#FFF8F0` × 1.7 at (1.2, 3.2, 1.6) casting shadows (2048 map, ortho ±1 m, bias −.0003, normalBias .004), cool rim light `#E6EEFF` × .6 from behind-left.
- Floor: a `ShadowMaterial` plane (opacity .16) over a flat plane in `--bg`, so only the soft shadow shows.
- Construction geometry on the floor: solid and dashed rings (r = .62, .95, 1.45 m) plus two tilted rings in the air, grey `#9A9890` at 15–40% opacity. They scroll with the walking distance (`deco.position.z = -(dist % .5)`).
- 160 tiny instanced sand specks on the floor, also scrolling with distance.

### 4.4 Typography and layout

- Display numbers: Archivo 800, tabular numbers, 40 px for main values with a 15 px muted unit.
- Everything else: JetBrains Mono, 9.5–12 px, uppercase labels with 0.14–0.2 em letter-spacing.
- Card headers: 3 × 13 px accent bar, uppercase title, a muted two-digit index (01–08) on the right. The index is the panel's real order on screen.
- Grid: `300px | 1fr | 300px` columns × `auto | 1fr | auto` rows, 10 px gaps, 12 px side gutter (use `max(12px, env(safe-area-inset-left))`).
- Below 1100 px wide: one column, the 3D view becomes 64 vh (min 380 px), the page scrolls, and the plus-grid and camera buttons hide.

---

## 5. The model (`M`): the single source of truth

```js
const M = {
  mass: 14.0, g: 9.81,                 // weight W = 137.3 N
  stride: 0.062, duty: 0.54, lift: 0.05,  // m, fraction of cycle planted, m clearance
  ht: 0.11,                            // m body height: a lobster rides low
  femur: 0.13, tibia: 0.15,            // m leg links: short, slim walking legs
  footTip: 0.165,                      // m knee → foot tip as built; the IK solves to this point
  kneeMax: 4.5,                        // N·m knee servo rating → leg-servo bars are % of this
  flipClear: 0.012,                    // m the curled tail keeps above the floor (see §5.3)
  clawPitch: 0.09, clawRear: 0.075,    // rad claws pitched down; m the body rears up when a claw is opened (§7)
  showLift: 0.09,                      // m an opened leg is held up; ×1.1 the exploded diagram floats (§7)
  hipX: 0.065, hipY: -0.045, reach: 0.2, // hip offset from centre line and below it (under the skirt), foot offset beyond hip
  hipZ:  [0.05, -0.02, -0.09, -0.16],  // hip positions front→back: under the rear of the carapace, behind the claws
  footZ: [0.15, 0.0, -0.12, -0.26],    // neutral foot positions front→back
  gripMax: 180, apOpen: 32, apHold: 11,// N crusher max, claw aperture open/hold in degrees
  tailMass: [0.5,0.45,0.4,0.35,0.3],   // kg per abdomen segment
  tailLen:  [0.084,0.08,0.076,0.072,0.068], // m per segment (0.38 m, about the carapace's length)
  tailRest:   [3,-2,-3,-3,-2],         // deg per joint, + = up
  tailUp:     [10,7,5,3,1],            // raised and fanned
  tailStrike: [-30,-38,-42,-40,-34],   // curled under (the flip)
  vCruise: 0.12,                       // m/s walking speed
};
```

Hand checks to keep as comments:
- `W = 14 × 9.81 = 137.3 N`. With 4 feet planted that's 34.3 N per foot, with 8 it's 17.2 N.
- Step rate `fc = v × duty / stride = 0.12 × 0.54 / 0.062 ≈ 1.05 Hz`.
- Curl angle is the absolute sum of the joint angles: the flip reaches about 184°, which the gauge clamps to 180°.
- Foot tip: the tip cone is centred at 0.15 m along the tibia and is 0.03 m tall, so the tip is at 0.165 m. Solving the IK to a shorter point puts the feet through the floor.

### 5.0 Proportions (from the real animal, *Homarus americanus*)

The shapes follow photos of real lobsters, not imagination. Carapace + head ≈ 0.53 m to the rostrum tip; abdomen ≈ the carapace's length; the crusher claw (palm + fingers) ≈ the carapace's length and reaches about that far past the head; the walking legs are short and slim and come out from under the carapace skirt, so the body rides low; the abdomen is as wide as the carapace where they meet; the antennae arc up over the claws and sweep back.

### 5.1 Gait: alternating tetrapod

- Legs are named L1–L4 and R1–R4, front to back. Group A = L1, R2, L3, R4. Group B = R1, L2, R3, L4, half a cycle later.
- `footPhase(p)`: while `p < duty` the foot is planted and slides from +stride/2 to −stride/2. Otherwise it swings back with smoothstep easing and lifts by `lift · sin(πu)`.
- Leg pose: the floor target is moved into the tilted body frame and made relative to the hip, then hip yaw = `atan2(-dz, dx)` and a planar two-link IK (`ik2`, femur and `footTip`) with the knee up for femur pitch and knee angle.
- Body: height `M.ht` (0.11 m) with a ±4 mm bob at 2× step frequency, ±0.012 rad roll, −0.02 rad pitch.
- Walking ramps with `v += (vTarget − v) · min(1, dt·2.4)`. All gait amplitudes scale with `k = clamp(v / (0.3·vCruise), 0, 1)`, so a stopped lobster stands on all 8 feet.
- Per leg: `load = W / planted` if planted, else 0. `torque = load × horizontal lever` (foot distance minus the femur's horizontal reach). Bar % = torque / kneeMax.

### 5.2 Claws

- Aperture per claw `ap[c]` eases to `apT[c]` at rate 7/s. The finger rotates `s · ap · 1.2°`.
- Grip force = `gripMax · closure^1.7` plus a small ±1.2 N ripple, where `closure = 1 − mean(ap)/apOpen`. The panel keeps 90 samples of history.

### 5.3 Tail and tail flip

- `tailK` eases between rest (0) and raised (1).
- Flip timeline `strikeT` in seconds:
  - 0–0.40 s: blend to `tailUp`, fan fully spread.
  - 0.40–0.58 s: snap to `tailStrike` (eased), fan closes to 40%, thrust ramps to 1.
  - 0.58–1.30 s: recover to `tailUp`.
  - 1.30–2.60 s: hold. Then repeat if the Flip view is armed, otherwise end.
- Thrust: `robot.position.z = −0.17 × thrust`. It rises fast (rate 9) and decays slowly (0.9), so the body darts back and drifts home.
- Lift: mid-snap the tail points straight down and is longer than the body is high, so the strike pushes off the seabed. Each frame, probe points on the tail (shell top, pleuron spines, swimmerets, telson, uropods) give the lowest tail point; the robot rises at once to keep it `flipClear` above the floor, then settles back at 1.6/s. While lifted more than 10 mm, no foot counts as planted.
- Fan: 4 uropods with spread `s · (b·0.3 + fan·k)` where (b, k) = (.25, .35) inner and (.75, .55) outer.
- Tail velocity (°/s) is the smoothed derivative of the curl angle. Holding torque = Σ mᵢ·g·|horizontal lever of segment centre| × 4.2, plus 0.02 × |velocity|.
- Antennae sway: yaw `s·(0.06 sin(1.1t + s) + 0.03 sin 2.7t)`, pitch `0.05 sin(1.6t + 0.7s) − 0.04·thrust`, so they trail back during the dart.

---

## 6. Geometry: every part (built with the `Kit` class)

### 6.1 The `Kit` helper

A `Kit` collects geometries into **pieces**. Each piece has an explode vector and a set of geometries per material. `build(key)` merges each piece's geometries per material with `mergeBufferGeometries`, giving one mesh per material per piece. Every piece is a `Group` tagged with `userData.key` (its subsystem) and `userData.ex` (its explode offset). Count every primitive in `PARTS` and show the total in the HUD (about 1,650).

Primitives: `box`, `cyl`, `sph`, `tor`, `cone`, `rod(a,b,r)` (a cylinder between two points), `cable(points, r)` (rods with sphere joints), `servo(x,y,z,r,w,axis,band)` and `gear(x,y,z,r,w,teeth,mat,axis)`.

**The servo puck is the signature detail.** It goes on every joint:
- black cylinder body (28 segments)
- red band around the middle (width = band × w, radius × 1.05)
- a white face disc on each side (r × 0.7)
- a black hub cap (r × 0.28)
- 6 chrome bolts on a circle at r × 0.5

**Gear:** steel disc, `n` square teeth around the rim, black hub.

**`taperTube(points, r0, segments, taper)`:** a Catmull-Rom tube whose radius shrinks linearly along its length. Used for antennae, claw fingers and feelers.

### 6.2 Chassis and power core (key `body`)
- Spine box 0.07 × 0.034 × 0.5 m (matte). Two black side rails, two steel rails.
- 9 black cross ribs every 58 mm.
- Piece `cells`: 5 rows × 2 battery cells (r 16 mm, 52 mm long), alternating red and black, with chrome caps.
- Piece `cables`: 2 thick cables (one red, one black) and 2 thin black ones, routed along the spine.
- Piece `core`: glowing cylinder (r 26 mm, 70 mm long) with chrome end caps, 3 black rings, 2 steel gears and 1 red gear.
- Piece `belly`: black half-shell underneath.

### 6.3 Carapace plates T1–T7 (key `carapace`)
The 7 plates together read as **one** shell (`SHELL` in the code). For i = 0..6: radius `0.085 + 0.0022·i` (widening to the rear), length 62 mm, placed at `z = 0.08 − 0.054·i`, y = 0.014.
- Cross-section scaled y × 0.82 (rounded, not flat), wrapping 0.45 rad (26°) below the equator on each side as a skirt over the leg bases.
- Two-tone: the white back spans ±1.0 rad from the top and the flanks below it are black, so the shell outlines against the pale floor and separates from the white tail. Black inner shell.
- Seams are thin black rims; **red only behind T3 (the cervical groove) and on T7's rear edge**.
- A black dorsal ridge strip on each plate; on T3–T6, 3 steel gill-vent slats per side on the flank.
- 2 chrome bolts each side, plus a white lip along the skirt's lower edge.
- When opened, each plate tilts back by `(0.18 − 0.03·i)` rad on top of its explode offset, so the plates fan open like real tergites.

### 6.4 Head and canopy (key `carapace`)
- The carapace tapers to the rostrum: a front half-ellipsoid with T1's section (r 0.085, y × 0.82, same skirt and same two-tone split), 0.14 m long, from z 0.111 to the nose tip at z 0.251.
- A red strip down the brow, a black ridge, 3 steel cheek vents and a servo puck on each side at the skirt.
- Glass canopy, a low dome (scaled 0.046 × 0.026 × 0.07) on top of the head, with a black ring where it meets the shell.

### 6.5 Eyes and rostrum (key `sensors`)
- Black base with a vertical servo.
- Piece `eyes`: 2 black stalks (rods) ending in 11 mm lens spheres with red rings and white collars.
- Piece `rostrum`: forward-pointing white cone (r 11 mm, 85 mm long) with a red top strip and 4 pairs of small black spines.
- Piece `mast`: black block with a chrome mast.

### 6.6 Antennae (key `sensors`; each one is its own group so it can sway)
- Mounted at (±0.035, 0.03, 0.235) on the head surface, with a servo puck at the root.
- Piece `whip`: a tapered tube (r 7.5 mm, 48 segments, taper 0.92) through `(0,0,0) → (.02,.04,.1) → (.08,.075,.22) → (.2,.08,.34) → (.36,.05,.38) → (.52,0,.3) → (.64,−.05,.16)` (`ANT_PATH`), mirrored per side: up and forward over the claws, then out and back. Its length (`ANT_LEN`, 0.97 m, about the body without the tail fan) is measured from the curve and shown on the labels and the mode line. 5 red rings near the root.
- Piece `scale`: white flat antennal scale with a red tip.
- Piece `short`: 2 short red feelers (tapered tubes) per side.

### 6.7 Legs × 8 (key `legs`; L2 uses `legL2` so it can be opened alone)
Hierarchy: `hip (yaw) → femur group (pitch) → tibia group at x = femur (knee)`. Hips sit at `(±hipX, hipY, hipZ)`, below the carapace skirt. Positions along each link are fractions of `M.femur` (F) and `M.footTip` (T), so the legs rescale with the model.
- Hip: vertical servo puck (r 15 mm) plus a black mount block.
- Femur: horizontal servo at the root (r 14 mm). Piece `shell`: white box 0.72F × 0.022 × 0.024 m with a black top rib, red tip band, 3 black underside slots and 2 chrome bolts. Piece `rod`: chrome push-rod with a black sleeve.
- Knee: servo puck (r 15 mm, band 0.42).
- Piece `shin`: white tapered cylinder (r 6 → 11 mm, 0.62T long), black collar, red band, black top strip.
- Piece `tip`: black cuff, red ring, black cone foot (tip at T).
- Each leg also has a red foothold ring that appears where the swing foot will land, and a 60-point red trail of where the foot has been.

### 6.8 Claws (keys `clawL` = crusher, `clawR` = pincer)
Chain: `base (servo, merus) → elbow (servo, carpus) → wrist (servo, palm) → finger`, held forward in a V like the real chelipeds.
- Base at (±0.06, −0.02, 0.12), rotation (0.09, ±0.5, 0) (pitched slightly down). Piece `arm` (merus): white box 0.032 × 0.03 × 0.13 m, black top rib, red band, 3 black spines on top.
- Elbow at z 0.15, yaw ∓0.75. Piece `arm2` (carpus): short knobby white ellipsoid, black top plate, red ring, 2 black spines on the inner side.
- Wrist at z 0.075, yaw ±0.35. **Scale: crusher (left) 1.55 uniform; cutter (right) 1.1 × 1.15 × 1.45, longer and slimmer.** This asymmetry is what makes it read as a lobster.
- Piece `shell` (palm): white upper half-ellipsoid (0.046 × 0.028 × 0.08), black lower half, red top strip, 4 black slots.
- Piece `belly`: glass lower half. Piece `gears`: 4 spur gears (r 11, 9, 8, 7 mm; 10, 8, 8, 7 teeth; one red) plus a chrome shaft, visible through the glass.
- Piece `fixed`: the crusher's is thick and blunt (r 14 mm) with 5 red molar knobs; the cutter's is slender (r 9 mm) with 9 small red cutting teeth.
- Finger (at z 0.125): small servo and a black tapered movable finger matching its claw: thick with 4 knobs, or slender with 9 teeth, facing the fixed one.
- The claws stay at least 25 mm above the floor and never touch the legs or antennae (checked by exact point-in-mesh tests, §13).

### 6.9 Abdomen: 5 segments (key `tail`)
The tail base sits at (0, 0.018, −0.285). Each segment `i` (width `w = 0.19 − 0.012·i` (`tailW`), as wide as the carapace where they meet, length `tailLen[i]`) is its own group, chained at the previous segment's end:
- Black core box and a transverse servo puck at the joint.
- Piece `top`: white open half-cylinder shell (y × 0.55), black inner shell, a rear band (red on even segments, black on odd), 3 black slots and 2 chrome bolts.
- Pieces `pL` / `pR`: a white side plate (pleuron) angled 0.32 rad, a black downward spine cone, a red edge strip and a small side servo.
- Piece `swim`: 2 swimmerets (black rod plus red paddle) and a white belly plate.

### 6.10 Tail fan (telson key `tail`; uropods key `stinger`)
- Transverse servo across the joint.
- Piece `telson`: white centre plate 56 × 8 × 90 mm with a black spine, red trailing edge and 2 black side spines.
- 4 uropods, each its own group scaled 1.65: white flattened paddle, black rib, red trailing edge and 3 black fan ribs. They spread as described in §5.3.

---

## 7. Explode / isolate system

- Explode targets `S.exT[key]` for keys `sensors, clawL, clawR, carapace, tail, stinger, legL2, legs, body`, each eased at rate 3.6/s. Global `S.all` is eased at 2.6/s.
- Each piece's position = `userData.ex × max(ex[key], all × 1.15)`. Explode vectors are local to the piece's parent, so parts come apart along their own axes even mid-stride.
- Isolate presets (set by the Assemblies buttons):

| Button | Opens | Also does |
|---|---|---|
| Hero | nothing | walks |
| Crusher | `clawL` | crusher opens to 32°; body rears up `clawRear` (75 mm) |
| Tail fan | `tail` + `stinger` | tail raised, fan spread |
| Leg L2 | `legL2` | L2 lifts its foot `showLift` (90 mm) |
| Carapace | `carapace` and half of `body` | plates fan open |
| Antennae | `sensors` (and part of the carapace) | |
| Tail flip | nothing | armed flip, repeats every 2.6 s |

- Every non-Hero preset stops the walk, so the parts come apart on a still body.
- **Exploded** (toggle or X key): everything apart, turntable on, camera pulled back to r 3.0. The whole diagram floats `showLift × 1.1` (99 mm) off the floor.
- **No part passes through the floor or another part while apart.** The body rides low, so parts that come apart downward (leg tips along the tibia, claw belly and gears) would go under the floor. Fix that by lifting what is shown (`clawRear`, `showLift`), never by shrinking the explode or moving the camera. Explode vectors also avoid neighbours: the claw shell lifts outward `(±0.075, 0.03, 0.04)`, because straight up it rose into the antenna's arc. Check every isolate view and the exploded view for the lowest vertex and with exact point-in-mesh tests (§13).

---

## 8. Camera

- Orbit camera with spherical coordinates (θ, φ, r) around a target that follows the focused part (eased at 2.6/s).
- Presets:

| View | θ | φ | r | Target |
|---|---|---|---|---|
| hero | .85 | 1.10 | 2.3 | (0, `M.ht`, 0) |
| clawL | .6 | 1.05 | 1.3 | crusher wrist + (0, 0, .1) |
| tail | 1.75 | 1.28 | 1.5 | tail segment 3 |
| legL2 | 2.2 | 1.12 | 1.0 | L2 femur + (.08, 0, 0) |
| carapace | 1.1 | .85 | 1.35 | plate T4 |
| sensors | .45 | 1.0 | 1.3 | left antenna + (.12, 0, .25) |
| flip | π/2 + .15 | 1.3 | 2.1 | centre |
| exploded | 1.2 | 1.05 | 3.0 | centre |

- Transitions take 1.3 s with cubic ease-in-out, always taking the shorter way round in θ.
- Drag to orbit (φ clamped 0.15–1.52), scroll to zoom (r 0.35–4). Turntable = 2π / 16 s. The camera never goes below y = 0.03.
- FOV 30°, or 42° when the view is taller than it is wide.

---

## 9. The console: every panel

**Top bar:** red badge (lobster icon + "HX-4") · eyebrow "Robotic lobster · Benthic crawler" · H1 "Homarus HX-4 /" (red slash) · eyebrow "Decapod walker / Seabed simulator" · **Drive load** 46-segment bar (Idle / Cruise / Max) with % · Sim ID `HX4-0207` · Runtime `hh:mm:ss` · Status (green dot when nominal, red when anything is open) · Terrain `SEABED · 38 M`.

**Left rail**

01 **Gait**: stride rate Hz (big) · speed mm/s (right) · a scrolling 8-row stride trace (L1–L4, R1–R4; black = planted, red = swinging; 96 samples ≈ 1.6 s; "−1.6 s … NOW") · Pattern (ALT TETRAPOD, or STANCE · n FEET when stopped) · Duty (54%, or 100% when stopped).

02 **Tail flip**: curl angle ° (big) · semicircle gauge 0–180° with 6 ticks and a red needle (the arc turns red while raised or flipping) · Velocity °/s · Torque N·m · Fan FOLDED / SPREAD / OPEN.

03 **Leg servos**: chip STEPPING / HOLDING / DETACHED · "Load per leg · knee torque" · 8 bars, L1–L4 then R1–R4, % of kneeMax. Bars over 60% turn red. A detached leg shows red "DETACHED" instead of a bar.

**Right rail**

04 **Claw grip**: force N (big) · sparkline (last 90 samples, scaled to 150 N) · CRUSH L and PINCH R mini bars with aperture ° (red "OPEN" when over 20°) · Mode HOLD / OPEN · Aperture °.

05 **Assemblies**: Hero, Crusher, Tail fan, Leg L2, Carapace, Antennae, Tail flip. The active one is solid red.

06 **Display**: Labels, Exploded, Turntable, Gait trace (on by default).

07 **Subsystems**: numbered rows with name, sub-caption and status chip:
1. Eyes + antennae: 2 stalk eyes · 4 feelers. SENSING / OPEN
2. Claw drives: Crusher L · pincer R. CLOSED / OPEN
3. Carapace core: 7 plates · glass canopy. SEALED / OPEN
4. Abdomen: 5 segments · 10 swimmerets. TRAILING / RAISED / CURLING / OPEN
5. Leg servos: 8 legs · 3 joints. STEPPING / HOLDING / DETACHED
6. Tail fan: Telson · 4 uropods. FOLDED / SPREAD / FLIPPING / OPEN

When a chip is red, its row gets a red left border and a red name. When everything is exploded, all chips read DETACHED.

**Bottom (under the 3D view): 08 Operation log**: round red play/pause button · "DEPLOY … current action (red) … RECALL" · timeline with a tick at each action, a red progress fill and a ring knob (click to jump) · `00:ss / 00:26` · "9 operator actions".

**Overlays on the 3D view**
- Top left: `MODEL HX-4 · REV A · {PARTS} PARTS`. Top right: `ISOLATE · {view}`.
- Top centre: 2 × 14 red plus-sign grid (decorative instrument grid).
- Bottom left: "OPERATION MODE" eyebrow, then a big red mode (CRAWL, CRUSHER OPEN, TAIL APART, LEG L2 OPEN, CARAPACE OPEN, ANTENNAE, TEARDOWN, TAIL FLIP), then a live sub-line (e.g. `105 MM/S · DEPTH 38 M · HDG 101°`, `CRUSHER · 84 N · 89% APART`, `CURL 26° · 53 °/S · THRUST`, `TURNTABLE 61° · 81% APART`).
- Bottom right: Orbit and Reset view buttons.
- **Callout labels:** up to 6 per view. Each has a small red square, a bold uppercase name and a muted caption below. A red polyline runs from a red dot on the part to the label. Labels sit on the left or right depending on which half of the screen the part is in, are kept at least 40 px apart vertically, are hidden while the camera is moving, and stay hidden in the exploded view. The full label list per view is in the reference `LBL` object.

**All panels redraw every other frame** (a cheap quality step), and every value comes from `M` / `S`.

---

## 10. The tour (26 s, 9 actions)

| t (s) | Action | Log text |
|---|---|---|
| 0 | Hero | Inbound · crawl · 8 legs |
| 3 | Crusher | Operator · isolate crusher |
| 6 | Tail fan | Operator · isolate tail fan |
| 9 | Leg L2 | Operator · isolate leg L2 |
| 12 | Carapace | Operator · isolate carapace |
| 15 | Antennae | Operator · antennae |
| 18 | Exploded on | Operator · exploded on |
| 21.5 | Tail flip | Operator · tail flip |
| 25.2 | Hero | Recall · crawl |

- A drawn cursor (black arrow with a white outline) glides to each button over 0.7 s, starting 0.8 s before the action, then "clicks" with a red ring ping.
- Any real `pointerdown`, `wheel` or `keydown` (`isTrusted`) outside the play button and timeline pauses the tour and hides the cursor. After 25 s of quiet the tour resumes.
- A black pill reads "AUTO TOUR · CLICK ANYWHERE TO DRIVE" while the tour plays.
- Keys: **Space** = tail flip on/off, **X** = exploded on/off.

---

## 11. Performance and quality steps

- Warm every shader before the first frame: `renderer.compile(scene, camera)` after one `pose()`.
- Merge geometry per material per piece (about 1,650 primitives become roughly 250 draw calls).
- Adaptive quality: if fps stays under 36 for 2 seconds, first drop the pixel ratio to 1, then turn off shadows (set `needsUpdate` on all materials).
- Clamp `dt` to 0.05 s.
- Test on an integrated GPU. The target is 60 fps on a mid laptop.
- Respect `prefers-reduced-motion` for UI animations (the cursor ping).

---

## 12. Accessibility and robustness

- The canvas gets an `aria-label`. Buttons have visible focus rings (2 px ink outline). The play button's label switches between "Pause tour" and "Play tour".
- No `alert`, `confirm` or `prompt` dialogs. No `localStorage` dependency.
- Responsive down to 400 px width with no horizontal scroll.

---

## 13. Check it like a critic (run before showing anything)

`tools/stills.js` (Playwright, Chromium with `--use-gl=swiftshader --enable-webgl --ignore-gpu-blocklist`):

1. Load the vendor-pointed test copy and stop the tour (`window.__lx.stop()`).
2. Render a still for each state: hero, each isolate preset, exploded, and the flip at 0.5 s and 1.0 s. Wait long enough for the camera to settle (swiftshader runs at about 3–5 fps).
3. Look at every still for:
   - a part passing through another part (legs through claws, tail through the floor during the flip, antenna through a claw)
   - a part floating off its mount
   - a label covering what it names, or two labels overlapping
   - a number that disagrees with the pose (curl angle vs the tail's shape, OPEN chip vs a closed claw)
   - colour drift (red turning orange or peach, white parts vanishing into the floor)
4. Scrub the flip at 0.1 s steps and look for jumps.
5. Fix collisions with a number in `M` or in the part dimensions. Never move the camera to hide them.
6. Report what you checked, what you fixed, and show the stills (a 4 × 2 contact sheet is ideal).

The page exposes `window.__lx = { S, scene, A, setAsm, setExplode, stop }` for tests (`A` is the anchor table: parts and `part/piece` groups).

Also check numerically, since a still only shows one side: the lowest world vertex in every view (nothing under the floor), and exact point-in-mesh tests (a ray from each vertex, odd hit count = inside) for antenna vs claws and claws vs legs, walking, flipping and opened. Box-only tests give false positives on merged meshes.

---

## 14. Turn it into a video and GIF

Use a deterministic clock. **Never screen-record**: a screen recorder drops frames when the GPU is busy, and a seeked tour can't.

`tools/record.js`:
```js
await page.addInitScript(() => {
  let now = 0; const q = [];
  performance.now = () => now;
  window.requestAnimationFrame = cb => (q.push(cb), q.length);
  window.__step = ms => { now += ms; q.splice(0).forEach(cb => cb(now)); };
});
// then for each frame: __step(1000/fps); screenshot
```

- Capture 26.5 s at 12 fps for the GIF and at 30–60 fps for video, at 1280 × 720 or 1920 × 1080.
- MP4: `ffmpeg -framerate 30 -i f%04d.png -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart out/hx4.mp4`
- GIF: two passes, `palettegen=max_colors=128:stats_mode=diff`, then `paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, scaled to 900 px wide.
- Optional sound, scored in code on the same timeline: a low pulse at 92 bpm, a soft click on every operator action, a rising whoosh under the tail flip, a hydraulic hiss when parts explode. Master to −14 LUFS with true peak under −1 dB, then mux into the MP4.
- Make a contact sheet (`select='not(mod(n,40))',tile=4x2`) and check every beat.

---

## 15. Publishing

- Keep `index.html` under 1 MB.
- Add a 1200 × 630 preview image (best hero frame) with absolute `og:image` URLs.
- Deploy to any static host (Vercel, Netlify, GitHub Pages).

---

## 16. Ideas for the next version (in this order)

1. **Bonus slider "Current (0–1.2 m/s)":** a water current pushes the antennae back, raises the leg loads on the upstream side, and the lobster leans into it. Show it on the same panels.
2. **Crusher demo:** a shell object the crusher closes on. Grip force climbs to 180 N, the shell cracks into pieces, and the sparkline spikes.
3. **Molting / shell-swap sequence:** the carapace lifts, the body slides out, then a new shell drops in.
4. **Underwater mode:** caustics on the floor, floating particles, blue-green fog. Keep the console identical.
5. Generated soundtrack as described in §14.

---

## 17. How to work in this repo (instructions for Claude Code)

- Start every session by reading this file and `index.html`.
- Make changes in small steps: one subsystem or one panel at a time, then render stills (§13) and look at them before moving on.
- When adding a part, add it to the right subsystem key, give it an explode vector, use the existing materials, and keep the red-band / black-rib detailing so it matches.
- When adding a number to the UI, compute it from `M` / `S` and write the hand-check in a comment.
- Don't add libraries. Don't add a build step. Don't move to ES modules unless asked.
- If you're unsure a number is realistic, say so and explain where it comes from.
