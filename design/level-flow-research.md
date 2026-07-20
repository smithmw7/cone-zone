# Skate Burger Level Flow Research

## Executive Finding

The current problem is not a shortage of obstacles. It is that obstacles are
placed as individual coordinates instead of being authored as routes.

A good Skate Burger level should let the player make expressive choices while
maintaining speed:

- a broad, forgiving main circuit that is difficult to leave accidentally;
- technical feature lines that branch off the circuit and merge back into it;
- transition pieces at the perimeter that return the player toward play;
- clear setup and landing corridors around every rail, jump, and drop;
- several visible ways to move between each major area.

The player should usually be deciding what trick or route to attempt next, not
deciding how to avoid a wall.

## What The References Teach

### Real Skateparks

World Skate defines a flow line as the ability to move through a whole course
in different ways, at useful speed, performing successive tricks without a
forced interruption caused by the course. It says line quantity and quality
must take priority during design.

Sport New Zealand's skatepark planning guide describes three especially useful
patterns:

- low street obstacles centralized with transitions on the perimeter;
- multiple zones that can operate separately but flow together;
- pump-track circuits with multiple options that always reconnect to the start.

The Public Skatepark Development Guide treats a park as a traffic network.
Good parks have many lanes of different difficulty that split, intersect, and
join. It also warns against mixing fast and slow zones without enough space and
visibility.

Useful reference layouts:

- [Sport NZ Skatepark Planning and Design Guide](https://sportnz.org.nz/media/b1gjnvoy/250912_24914_skatepark-planning-and-design-guide.pdf)
- [World Skate Facility Certification Rules](https://www.worldskate.org/skateboarding/about/regulations.html?download=5133%3Afacility-certification-rules-vesrion-1-0-october-2021)
- [Manglerud Skatepark flow plan](https://www.betongpark.no/nyheter-betongpark/manglerud-skatepark-er-aapnet)
- [West Jordan Wheels Park plan](https://www.westjordan.utah.gov/parks-department/skate/)
- [John Rabson Skatepark flow diagram](https://www.maverickskateparks.co.uk/johnrabson)

### Snowboard Terrain Parks

Strong terrain parks are organized as parallel progression lines rather than a
single obstacle gauntlet. A rider can choose a small, medium, or advanced line,
skip any feature, and continue downhill without crossing a landing.

Mammoth's Unbound parks separate feature families and difficulty levels. Its
beginner parks increase feature size through the run, while Forest Trail is
explicitly designed around flow between features. The terrain-park operations
manual reviewed for this research extends boundaries at least 6 m beyond the
last feature runout so ordinary traffic cannot enter the landing.

Useful references:

- [Mammoth Unbound park map](https://www.mammothmountain.com/on-the-mountain/unbound-terrain-parks/unbound-park-map)
- [Mammoth Unbound terrain parks](https://www.mammothmountain.com/on-the-mountain/unbound-terrain-parks)
- [Mount St. Louis terrain-park operations manual](https://mountstlouis.com/pdf/manuals/terrain-parks.pdf)

### Tony Hawk

Tony Hawk's Pro Skater succeeded when it stopped behaving like a downhill race.
Players avoided the finish because they wanted to stay in useful trick zones.
The best compact maps then connect those zones with transfers, rails, quarter
pipes, and gaps that work in several directions.

Warehouse is a useful small-map reference:

- a central rail is reachable from multiple launch points;
- the half-pipe is both a self-contained trick zone and a transfer target;
- quarter pipes around the room turn dead walls into usable return surfaces;
- the same modules support many named gaps rather than one intended action.

School II is a useful larger-map reference because courtyards, roofs, stairs,
ramps, and corridors form a web. Areas feel distinct, but the player can enter
and leave them in several ways.

Useful references:

- [THPS Warehouse map and gap list](https://strategywiki.org/wiki/Tony_Hawk%27s_Pro_Skater/Warehouse)
- [THPS2 level maps](https://strategywiki.org/wiki/Tony_Hawk%27s_Pro_Skater_2/Maps)
- [THPS development interview](https://www.gq-magazine.co.uk/technology/article/tony-hawks-pro-skater-1-and-2-interview)

### Mario Kart

Mario Kart contributes route readability and layered mastery:

- keep one obvious route usable with basic controls;
- add optional faster or more technical routes beside it;
- use landmarks and surface language to communicate upcoming choices;
- concentrate detail at memorable activity nodes and connect them with clean,
  readable travel routes;
- avoid interactions that stop forward motion.

Nintendo's Mario Kart World team described higher-density areas as the courses
within the connected world. They also rejected a shop interaction that would
interrupt driving, and made optional advanced moves without requiring them for
basic enjoyment. Those are directly applicable to Skate Burger.

Useful references:

- [Mario Kart World developer interview, Chapter 1](https://www.nintendo.com/en-gb/News/2025/May/Ask-the-Developer-Vol-18-Mario-Kart-World-Chapter-1-2832687.html)
- [Mario Kart World developer interview, Chapter 3](https://www.nintendo.com/en-gb/News/2025/May/Ask-the-Developer-Vol-18-Mario-Kart-World-Chapter-3-2832747.html)

## Current Level Problems

### 1. Five Levels Share One Scatter Layout

Sunny Cove, Canopy Run, Redwood Coast, Aqueduct City, and Sunset Harbor all call
`basicPark()`. Their themes differ, but their circulation is effectively the
same. Extra themed modules are then added after the shared layout, which has
already caused feature overlap and blocked routes.

### 2. Features Have Footprints But No Travel Corridors

A rail is more than its metal geometry. It needs:

- an approach lane;
- an attachment window;
- an exit lane;
- a safe miss/bypass lane;
- space to turn toward the next feature.

The current builders only express the rail endpoints. They do not reserve the
space needed to use the rail.

### 3. Too Many Exit Vectors End At Hard Boundaries

Several rails, kickers, and open-floor routes point toward the perimeter. The
rounded boundary prevents escape, but it still behaves as a failure state.
Perimeter geometry should catch and redirect speed with banks, quarters, berms,
or broad turning lanes.

### 4. The Reaction Distances Are Too Short

Characters cruise around 10-14 m/s and can boost much faster. At 12 m/s, a
5 m runout is only 0.42 seconds. A boosted 90-degree turn can consume roughly
10-12 m of travel.

The old 5 m landing-clearance rule is not enough for this controller.

### 5. The Levels Lack Route Hierarchy

There are many isolated feature islands, but few complete loops. The player
cannot quickly read:

- the safe main route;
- the technical route;
- the advanced transfer;
- how a route returns to another useful feature.

### 6. Props And Landmarks Sometimes Occupy Play Space

The burger shack is a useful visual landmark, but in the shared layout it sits
in a primary travel lane. Landmarks should frame decisions, not become surprise
collision tests.

## Proposed Skate Burger Flow Standard

### Route Structure

Every arena-style level should have:

1. Two continuous primary circuits that can be ridden indefinitely.
2. At least four connectors between those circuits.
3. One beginner line with no mandatory rail or gap.
4. Two technical branches that rejoin a primary circuit.
5. One advanced transfer or shortcut visible from the safe route.
6. No major zone with only one entrance or exit.

### Clearances At Current Game Speed

- Major jump or transition approach: 10-14 m clear.
- Landing and rail exit: 10-12 m clear.
- Rail miss/bypass lane: at least 4 m wide.
- High-speed turning pocket: at least 10 m diameter.
- Hard-wall recovery band: 8 m minimum.
- Decorations: outside all approach, landing, bypass, and turning volumes.

These are initial graybox targets and should be tuned through measured play.

### Perimeter Rules

- No rail or jump may point directly into a hard wall.
- Perimeter features must face inward or feed a tangent circulation lane.
- Use quarter pipes, broad banks, hips, berms, and bowls as speed return tools.
- Keep an uninterrupted loop between the playable features and the hard wall.
- A wall may be close only when it is intentionally skateable.

### Rail Rules

- Rails run parallel to the expected travel vector unless they are an obvious
  transfer target.
- The rail endpoint must feed open floor, a bank, or another aligned feature.
- Never terminate a rail at stairs, a bowl wall, a prop, or the perimeter.
- Every rail gets a visible non-rail bypass.
- Place rails in families along a line, not as isolated needles in open space.

### Choice And Readability

- Show the next two useful actions from each landing.
- Use color/material families to identify route type.
- Put landmarks behind or beside decisions so they act as navigation anchors.
- Place coins along complete lines; use boosts before expressive choices, not
  immediately before blockers.
- Keep the safe route broad and visually dominant. Advanced routes may be
  narrower, elevated, or require a transfer.

## Three Buildable Layout Archetypes

See `design/flow-layout-concepts.svg`.

### A. Looping Flow Plaza

Best first replacement for Sunny Cove.

- Outer pump circuit supplies constant speed.
- Perimeter quarters and berms return the player inward.
- Central street island contains rails, stairs, and manual pads.
- Four broad connectors let the player change direction or switch loops.
- The bowl is tangent to the circuit instead of occupying a landing lane.

### B. Three-Lane Slopestyle Mountain

Replacement direction for Powder Peak.

- Easy, medium, and advanced lines descend in parallel.
- Each feature has a bypass and all landings remain separated.
- Crossovers happen only in wide setup terraces, never in landing zones.
- A surfy snake-run return at the bottom leads to a lift/teleport reset.
- Difficulty increases gradually down each lane.

### C. Campus Trick Web

Replacement direction for Canopy Run or Aqueduct City.

- Two large courtyards form dense activity nodes.
- A figure-eight boulevard links them.
- Roof, stair, rail, and plaza branches reconnect at multiple points.
- Edge transitions return speed toward the courtyards.
- The landmark sits in a non-playable center island and remains visible from
  most of the map.

## Limited Base Asset Kit

Most of the redesign can use a small modular set:

- broad bank in straight, inside-corner, and outside-corner forms;
- quarter pipe in three heights with optional deck;
- shallow berm/hip for 45-degree and 90-degree redirection;
- pump roller and tabletop in three sizes;
- flat, down, kinked, and curved rail using one rail profile;
- low ledge, manual pad, stair set, and hubba;
- bowl corner and open bowl pocket;
- snowboard jump with explicit takeoff, tabletop, landing, and bypass pieces;
- visual route paint, flags, coping colors, and landmark props.

The missing asset is not another decorative object. It is a family of connector
and redirection pieces.

## Implementation Recommendation

Rebuild Sunny Cove first because it is one of the shared `basicPark()` levels
and its current extra bowl/spine additions expose the layout problem clearly.

1. Graybox only the Looping Flow Plaza.
2. Add module metadata for footprint, approach, landing, bypass, and exit
   heading.
3. Add a route validator that catches corridor intersections and wall-facing
   exits before a level can ship.
4. Run repeated controller traces from each feature at normal and boosted
   speed.
5. Add art and collectibles only after both circuits and every connector can
   be ridden cleanly in both directions.

The level should pass one simple test: after landing any ordinary trick, the
player can see at least two useful next actions and has enough time to choose
between them.
