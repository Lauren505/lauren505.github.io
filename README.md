# lauren505.github.io

Personal site — Next.js (App Router), deployed on Vercel.

## Develop

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
```

## Layout

```
content/             # ALL site content — edit here, not in the components
  profile.ts         #   name, tagline, socials, bio paragraphs
  news.ts            #   news list
  publications.ts    #   papers, venues, links
  posts.ts           #   side quests (empty for now)
  gallery.ts         #   the wall: where each frame hangs, what is in it
  media/             #   portrait, paper previews, gallery stand-ins
  index.ts           #   re-exports, so components `import { … } from "@/content"`
app/                 # routes, layout, global styles
  icon.png           #   favicon, by Next's file convention
components/          # presentation only
  PageFold.tsx       #   the home -> publications fold (see below)
  cube.ts            #   what the fold and the two other turns share
  PublicationsMorph.tsx #  the block that rearranges as it folds
  PortalScene.tsx    #   the gallery, in three.js (see below)
public/models/gallery/ # .glb files for the gallery — see the README in there
Archive/             # previous Jekyll site, kept for reference only
```

Images live in `content/media/` and are imported as modules (`import portrait
from "./media/prof_pic.jpg"`), so they get hashed, cached filenames and their
dimensions come along for free. The one thing `public/` is for is the gallery's
`.glb` models, which are fetched by URL at run time rather than imported.

Pictures on the pages go through Next's image optimizer (`<Image>`, or
`getImageProps` where the markup has to stay a plain `<img>` — see
`components/thumb.ts`), so a reader is sent a copy sized for the screen, not
the file in `content/media/`. Still, keep photos to about 2400px on the long
edge, as JPEG unless they need transparency: every size of every picture is
made from the original the first time it is asked for. The exceptions are sent
as they are — an animated WebP, SVG drawings, and whatever three.js loads in
the gallery — so those are the ones to keep small by hand.

Bio paragraphs and post bodies use `[label](https://url)` for links, rendered by
`components/RichText.tsx`.

## The frame

Every page sits inside one frame, and the whole of it is four tokens in
`app/globals.css`:

```
--edge       window -> content, left and right, and the top of the nav
--nav-h      one line of the nav, pinned so the band above the page is a number
--nav-gap    nav -> the first line of the page
--frame      the three of them: window -> content, top, and the same at the foot
```

So the left and right margins are equal at every window width — one column of
`--page-max`, centred, never closer to the edge than `--edge` — and the top and
bottom are equal to each other, because the band below the page is built from
the same parts as the band above it. Nothing in the layout measures from the
window any other way; a page ends by carrying `padding-bottom: var(--frame)`.

`--edge` is a `clamp`, so the gutter closes as the window narrows instead of
stepping at a breakpoint.

`--nav-gap` is the knob for how much room the page keeps at its top and foot,
since it is the only part of `--frame` that is not doing another job as well.
On the home page it is not free: that page is drawn to fit the window, so
widening the band has to be paid for out of the space between its sections —
see `.sectionTitle` and the rest of the vertical rhythm in `app/page.module.css`,
which are tighter than they would be on a page that scrolls. Widen one, tighten
the other, then re-measure the fit below.

**The home page fits the window it is in.** Every width, height and gap in the
layout is in `rem`, so the root font size is the scale of the whole drawing —
set it and the page is drawn at that size, in proportion. The page is 70.7
rem-units tall, so in a window on its side the root size is 1/70.7 of the
window's height:

```css
@media (orientation: landscape) {
  :root { font-size: clamp(10.86px, 1.414vh, 19px); }
}
```

That is the whole of it. The page comes out exactly as tall as the window, so
both margins are on screen at once with nothing below the fold, and the four of
them stay in proportion as the window is dragged about.

The two ends of the `clamp` are where it gives up. Below **10.86px** the page
would be too small to read, so windows under about 768px tall scroll instead —
raise the floor to trade that for larger type. Above **19px** it stops growing,
so a window over about 1345px tall keeps its extra room at the foot. In
between, the fit is exact to within a few pixels.

Upright windows are read by scrolling, so they stay at full size.

The height it is calibrated against is the height of the blocks on the page, so
it holds while Selected Publications is one row of cards. A fourth selected
paper wraps to a second row and adds about 24rem, which no root size can take
back — `selectedPublications` in `content/publications.ts` is the knob.

It also follows `--page-max`. The cards are three across the column, so a wider
column makes their pictures taller faster than it makes the text beside them
shorter: the page was 67.6 rem tall at a column of 68.75rem and is 70.7 at
78rem. Widen the column and both this number and the nav's shape gate below
have to be measured again. The same is true of `--nav-gap`: it is paid for
twice, once at the top and once at the foot.

**The nav ends where the body text ends.** It runs down the same column as the
page, so its right edge is the text's right edge — and the last tab is taken
out of flow (`.hang` in `Nav.module.css`) and hung past it, in the margin. That
puts the end of *Publications* level with the end of the body text, with Side
quests outside the column. Below about 1320px there is no margin to hang in, so
the last tab comes back into the line and the nav ends at the text instead.

It also puts the sideways turn's crease — the line between those two tabs —
just clear of the column, which is the one place a vertical crease can fall
without cutting through what is being read.

**Every tab is as wide as its word**, so the gap between two labels is
`--nav-gap-x` and nothing else — the same gap between every pair, on every
page. The tab that is the page is genuinely wider, being set uppercase, bold
and tracked, and it takes that room rather than having it reserved on all of
them: reserving the widest state everywhere would leave each of the other
words sitting in a slot too big for it, and the slack, which grows with the
length of the label, would show up as a wider gap beside the longer ones. What
*is* reserved is the hover. The label is printed twice underneath, hidden, at
the two weights it is drawn in while it is not the page (`.link::before` and
`.link::after`), so the tab is as wide as the widest of the three and hovering
one moves nothing but itself.

**On side quests the row stands in the left margin instead**, with Side quests
— the tab that is now the page — level with the start of the body text and the
other two hanging off the far side of it: the mirror of where it sits
everywhere else. It is one rule (`.atSide` in `Nav.module.css`), and the
distance is `-100%` of the row's own width, which is the column's, plus one
gap, so it lands exactly whatever the window's size. Only where there is a
margin to stand in, which — the column being in `rem` like the type in it — is
a question about the window's shape rather than its width: about five twelfths
wider than it is tall (`17 / 12`). Anywhere narrower or more upright the row
stays put.

**And the row grows while it is there.** Side quests has sections of its own —
Projects, Gallery, Bakery, Life lately — and they stand after its tab, over the
column the row has just crossed into, which is the only place with room for
them. They are `SUBS` and `.subs` in `Nav.tsx` / `Nav.module.css`, rendered only
while side quests is the page, and they are anchors to `#projects` and the rest:
places on one page rather than routes, so the tab that is lit is read from the
hash. Nothing has those ids yet — `content/posts.ts` is still empty — so they
are a frame waiting for its content.

The turn carries them. The row arrives from the right of the window, where four
more tabs would reach off the edge of it, so they unfurl over the last third of
the journey instead of riding along from the first frame: `--turn-subs` on the
stage (`SUBS_AT` in `PageTurn.tsx`) becomes `--nav-subs` on `.chrome`, which is
the opacity and a small slide, and is unset on a page at rest. Where the row has
*not* crossed — a narrow or upright window — there is nothing to the right of
Side quests but window, so the group dissolves into the row (`display: contents`)
and the sections take a line of their own underneath.

## Layout

On the home page the photo, the links + address row and the News block sit in
one side column, and that column is **one publication card wide**: the cards
below are three across the page with `--cards-gap` between them, and the column
is drawn on the same width, so the same arithmetic gives the same number and
the photo lines up with the card under it. The links sit together under the
middle of the photo rather than being ruled across it: four of a kind with one
real measure between them, so the gap does not change with the length of the
address or the width of the column, and the air left over goes to the ends.
The address cannot be broken, so on a window too narrow to hold the row in a
line it takes one of its own. `--side-w` is the width the photo keeps when the
layout stacks and there are no cards to measure against.

Whenever the window is upright — a phone, or a desktop window dragged taller
than it is wide — both halves dissolve (`display: contents`) and their parts
are ordered into a single run: name, photo, about, news, and then Selected
Publications, which is a block of its own below. Two columns need width; a
window turned on its end has height instead. Each block carries its own spacing
rather than sharing one grid gap, since they do not all want the same.

On the publications page the year column is a run of years rather than a list
of them. Entries that share a year are strung on one line, and only one of them
says the year out loud — the row you are reading, or the first of the run when
you are reading somewhere else; the rest are circles on the line. The year is
painted on the page colour, so it covers the line rather than the line being
cut to fit around it, which is what lets the year and the circle trade places
by fading with no geometry to animate. The line does stop short of the circles,
by `--mark-gap` — the same measure the year takes as its padding, so the air
around a circle and the air around a year are one distance. Every row still
carries its year in the markup, so it is still spoken; it is only the ink that
is shared.

## The home -> publications fold

At the bottom of the home page, the page folds along the line between News and
Selected Publications — halfway between the last line of news and the heading
below it, which the two `data-fold-seam-*` marks in `HomeBody` and
`PublicationsMorph` point at. About + News is the face above the edge; it foreshortens
away and the edge rides up to the top of the screen. Below the edge, the
Selected Publications block rearranges into the publications page's layout: the
heading drops the word "Selected", and each card's image, title, venue and tag
buttons fly from their place in the grid to their place in the list. Then it
hands over to `/publications`.

**What the scroll drives is a line, not the rotation.** At the foot of the home
page there is a thin chevron under the words *See all publications*
(`components/ChargeLine.tsx`), and scrolling down fills it from one end to the
other. Nothing else moves until it is full; when it is, the fold plays through
on its own. The line is the gesture's meter, so "scroll until the line is full"
is the whole instruction, and the point of no return — which used to be a
threshold you could only feel — is now something you can see coming.

Two colours and nothing else: the mark stands in the lighter orange, and the
darker one travels along it. The fill is `stroke-dashoffset` on a path declared
one unit long, so the same number means the same fraction of the line at any
size. `--pull` carries it, on its own spring (`FILL_TAU`) rather than the
turn's, since the two never run at once. The line is on the page at all times
rather than waiting for the foot of it, and it stands in the page's own bottom
band — `--frame` less the handle's height — so it sits under the last row of
cards rather than adrift on the window's edge. On an upright window, which is
the only kind the home page is longer than, it stands on a wash of the page's
own colour so the text dissolves under it rather than meeting a card.

Pulling up at the top of the publications page turns it back, the mirror of
pulling down at the foot of the home page — `components/PageLift.tsx`, with the
same line and the same length of scroll. That one is shown only once the page
is back at its top: until then there is nothing to pull against, and a line
there would be promising a gesture that does nothing. The rotation itself
cannot run there, since it is laid out against the home page, so the pull hands
over once the line is full and the home route plays the rotation on arrival.

The nav turns the cube too: Publications rolls down, Home rolls back up.
Rolling down happens in place, since the fold is already mounted. Rolling up
cannot — only the home route lays the turn out — so the nav navigates first and
leaves a note in `components/foldSignal.ts`; the fold reads it on mount and
plays the turn backwards before the first frame is drawn, landing at the top of
the home page. Under `prefers-reduced-motion` both are ordinary links.

Three components:

- `components/PageFold.tsx` — the gesture, the geometry and the frozen stage.
- `components/ChargeLine.tsx` — the line both ends of the fold are charged by.
- `components/PublicationsMorph.tsx` — the block below the edge, which holds
  both layouts at once so the flight has real geometry at both ends.
- `components/foldSignal.ts` — the one-way channel between the nav and the
  fold, which live on opposite sides of the route boundary.
- `components/PageLift.tsx` — the pull-up gesture at the top of the
  publications page, which hands over through the same channel.

**Both ends are real pages.** The face below the edge ends up exactly where
`/publications` starts: it borrows that page's own classes, lists every paper
rather than the selected few, and is dropped clear of the nav by `--fold-land`.
So the hand-off moves nothing, which is what lets the turn also run backwards —
the first frame of a roll-up has to be the page you were just reading.

**The fold.** While the turn runs, a fixed copy of the viewport sits over the
live page, which never moves. The face above the edge is hinged along the top
of the viewport and foreshortens away; the face below hangs from the edge and
fills the screen by 90 degrees. The edge itself sits at `height * cos(theta)`,
and everything the fold measures hangs off that number.

**The camera.** A flat projection turns out to read as a squash rather than a
turn — parallel lines say nothing about depth. Each face is drawn through a
`perspective()` of its own, with the vanishing point at its own hinge, so the
upper face converges on the top of the screen and the lower one on the foot.
Type that has swung away is smaller than type near the edge, which is what
makes the crease read as a corner pointing at the reader.

That would normally move the crease, since a perspective divide scales the
whole face. `--fold-top-z` pushes the upper face back by exactly the depth its
near edge gained, putting that edge on the camera plane: it keeps its size, the
crease stays at `height * cos(theta)`, and only what is behind it draws
smaller. The lower face leans away from the same edge by `--fold-tilt`, which
peaks side-on and is nothing at either end of the turn, where it has a real
page to match.

`--fold-veil-*` then fades each face's far end into the page colour, under the
shading, the way distance washes things out.

Both the shading and the haze are laid over the window, not over the faces. A
turned face no longer reaches the sides of the screen, and tinting the face
alone would draw its silhouette — a slanted edge where the tint stops. Painted
full width, against a background the same colour as the faces, only the type
gives the turn away.

**Cost.** Every animated value is a custom property feeding a transform or an
opacity, so a turn costs a style recalculation and compositing, and no layout
at all. That is worth keeping: the earlier version moved the lower face with
`top` and resized two window-sized gradients, which laid out and repainted most
of the page on every frame. The FLIP below measures in one pass and writes in
another for the same reason — interleaving them makes each write invalidate the
layout the next read needs.

The springs that follow a pull are given a time constant in milliseconds, not a
fraction per frame, so they feel the same whatever the refresh rate.

**The morph** is a FLIP. `PublicationsMorph` renders the cards in flow and the
rows laid out but collapsed to zero height, so both have measurable geometry at
rest. When the fold starts, `PageFold` pairs every `[data-flip]` element with
its `[data-flip-to]` slot, banks the corner-to-corner delta and the size ratio
as custom properties, and CSS interpolates them against `--fold-q`. Because the
rows use the same column as the real publications page, everything lands exactly
where that page puts it.

Two things about the flight are worth knowing:

- **Text scales by type size, not by box.** A card title and a row title hold
  the same words but wrap at different widths, so scaling one into the other's
  box would stretch the letters. `data-flip-mode="text"` switches to a single
  uniform scale taken from the font sizes — times whatever an ancestor is
  already scaling the slot by, since the rows shrink their inactive entries.
- **Images land; text dissolves.** An image's slot stays hidden for good and
  the flying copy is what you see arrive. Text can't do that: the two versions
  break their lines in different places, so holding both over the same spot
  reads as doubled text. The flying copy fades out partway across and the real
  row text comes up afterwards, with no overlap between them. The flying text
  also travels *under* the images, the only reading that makes sense while they
  cross paths.

The row-only parts — the year, the authors, the figure's brackets — have
nothing flying to them, so they simply arrive, through a `--row-fade` variable
that multiplies into whatever opacity they already carry rather than
overriding it.

It is built with CSS transforms rather than three.js on purpose: the faces hold
real DOM, so the text stays selectable, crisp at any zoom, and readable by a
screen reader — nothing has to be captured to a texture.

Tuning lives in the constants at the top of `PageFold.tsx`: `DEADZONE` is the
travel absorbed before the line starts to fill, `RESIST` how hard the pull
fights back, and `COMMIT` the charge at which the line reads as full and the
turn takes over — together they come to about 670px of scroll, and `PageLift`
is tuned to the same, so both directions ask for the same gesture. That is more
than one flick of a wheel gives, so `RELEASE_MS` is long enough to bridge the
gap between two of them; pause for longer than that and the charge drains. Shading starts at zero so the
page looks untouched until the rotation begins, then the lower face lifts out
of shadow as it comes round. Reduced-motion users get a plain link instead.

## The sideways turn

Side quests is the same cube laid on its side. Its crease is the vertical line
between the Publications and Side quests tabs, so the tab you press is already
on the face coming round: clicking it turns the page away to the left, and
clicking Home or Publications from there turns it back. It runs between side
quests and either of the other two pages — `components/PageTurn.tsx`, which
wraps the document in `app/layout.tsx` and talks to the nav through
`components/turnSignal.ts`.

The geometry is the fold's, rotated a quarter turn: the near face is hinged
along a vertical line and foreshortens away, the far face hangs from the crease
and leans away from it, each is drawn through a `perspective()` whose vanishing
point is its own hinge, and the shading and haze are laid over the window
rather than over the faces. The same numbers do the same jobs, with `--turn-`
in place of `--fold-`.

**The crease keeps its place in the nav.** It is the middle of the gap between
the two tabs — measured from the labels themselves rather than the boxes they
are laid out in, so it is the line those two words are written either side of —
and those two tabs are on their way to the left margin, so it goes with them:
the hinge is not the edge of the window but that same gap read in the layout
the turn is landing in, and the near face is what lies between the two. Both
are read in `measure()` by one function, and the row's travel is then taken as
the distance between them rather than measured separately. That is what glues
the two together: `hinge + width * cos(theta)` and `landed + travel *
cos(theta)` are the same number by construction, so the crease sits exactly
between Publications and Side quests in every frame of the turn instead of
running out from under them towards the window's edge.

It ends where the new page's own column begins, and over the last fifth of the
turn (`EDGE_OUT`) the crease goes out: the line, and the shading and haze that
gather into it from the near side. Everything the stage draws over the near
half has to be gone by the last frame, because the stage is taken down the
moment the turn is over and whatever is still painted then would go with it in
one step. (The far face's two need no help — they are already `cos` and
`sin * cos`, which are nothing at a right angle.) There is only the page's own
margin to the left of the hinge, so nothing being read swings the wrong way
round it.

Where the row does not travel — a window too narrow or too upright for it to
stand in the left margin — the gap it lands in is the gap it started in, so the
hinge falls back to the edge of the window and the crease sweeps the whole of
it as it always did. That test is measured too, not a breakpoint: the crease
stops short only when its destination is in the far half of the window from
where it starts.

What is different is where the faces come from. **The near face is the live
page itself**, rotated where it stands: a route is only laid out where it is
mounted, and there is nothing to copy it from. **The far face is always side
quests**, which is empty and so can be drawn from anywhere — and that is what
makes both directions one animation:

```
to side quests    turn 0 -> 1, then change route behind the covered screen
from side quests  change route behind the covered screen, then turn 1 -> 0
```

At a full turn the near face is edge-on and the far one fills the window, so
the route can change with nothing to see either way.

Two things the fold did not have to answer:

- **The page is not cut at the crease.** It runs the full width of the window,
  and on a narrow one the crease falls inside the column, so clipping there
  would take a strip of what is being read away the instant the tab was
  pressed. The far face is opaque
  and covers everything past the crease anyway; it comes up over the first
  frames of the turn (`RAMP`) rather than at the first one, so at rest the
  window is the page, untouched.
- **The nav is chrome, not page.** The crease runs between two of its tabs, so
  it belongs to neither face. It rides above the shading and clear of the
  crease, and hands over from the live one at the start — the two stand in the
  same place, so all that changes is which tab is lit.

  It travels, though. Side quests keeps the row in the left margin and every
  other page keeps it against the right of the column, so the turn carries it
  between the two: `--turn-nav-x` falls by `cos(theta)`, the same law the
  crease moves by, which is what makes the row read as part of the cube rather
  than as something laid over it. The distance is measured rather than
  computed — the stage's copy is already drawn where side quests draws it and
  the live one is drawn where the page being left draws it, so the distance
  between the two creases is the whole of the journey, whichever way round the
  turn is going and whether the window is wide enough for the row to move at
  all. At either end it is exactly where the page it lands on puts it.

There is no gesture for it: sideways is not a direction the window scrolls, and
the two vertical gestures stand down while it runs. Under
`prefers-reduced-motion` the tabs are ordinary links.

## The gallery

Side quests is a page of sections, and which one is open is the hash and nothing
else — the same thing the nav reads to light a sub-tab. Only **Gallery** has
anything in it so far, so `/side-quests` and the other three tabs are the blank
page this route was before the gallery went in.

The gallery is a wall of three kinds of frame, and which kind a frame is is
which of `model` and `video` it is given in `content/gallery.ts`: a **picture**
hangs flat, a **film** hangs flat and plays, and a **model** is a window into a
room of its own — drei's `MeshPortalMaterial`
renders every room into its own texture and masks it to the shape of the frame.
Each room is captioned "double-click to step in" at its bottom left corner (a
small label inside the corner on a phone, where the gaps between frames are a
few pixels). A picture or a film is double-clicked to **zoom** in on it: the camera flies
to the one card, fitted to the window, with the wall's stops still on and the
films still playing — a zoomed film's controls work as they do on the wall,
and a single press on a film waits a quarter of a second to be sure it is not
the start of a double-click, so zooming never pauses it. Double-click a room and
its mask dissolves while the camera flies in; double-click again — anywhere — and it takes you back out, as do
Escape and the ← back link. It is the pmndrs
[Enter portals](https://codesandbox.io/p/sandbox/9m4tpc) demo laid flat: no tilt
on the frames, the swing stopped at fifteen degrees in each direction so the
backs of them can never be reached, and the corners square.

That stop is on the wall, not on the room: once you are through a frame there is
no back of it to get to, so the camera goes all the way round whatever is in
there. Coming out, the stops go back on *after* the flight home rather than before it,
because camera-controls clamps the instant a limit narrows and tightening them
while the camera is still round the back of a room snaps it instead of flying
it.

Stepping in also **freezes the wall**: every frame's mesh stops answering the
raycaster. The wall is behind you by then and, being right in front of the
camera, most of the screen — left pickable, every press meant for the room you
are standing in lands on a picture instead. Which is also why the way back out
is heard on the element rather than in the scene: by then there is nothing in
the scene left to press.

Where the frames hang is `content/gallery.ts`, in wall units — an arbitrary
measure, since the whole wall is fitted to the window, so the numbers are only
ever read against each other. They are deliberately ragged — no two frames the
same size and few edges in line — but evenly spaced: every frame is `GUTTER`
(0.3) from each of its neighbours.

**Turning and zooming** needs no clicking. With a mouse, the view follows the
pointer — its place across the canvas is the angle the wall is seen from, out to
the stops at the edges (forty degrees round and twenty-five up in a room) — and
the wheel zooms. With a trackpad, a two-finger slide turns the view and a pinch
zooms; both arrive as wheel events (a pinch with `ctrlKey`), so `fromTrackpad`
in `PortalScene` tells a slide from a mouse wheel by the shape of the events,
and once it has seen a trackpad the pointer stops turning the view until a mouse
wheel is seen again. To slide the view across the wall, hold Shift and slide
two fingers, or hold the mouse wheel down and drag; the wall follows, and stops
once the point at the middle of the view reaches the wall's edge, so some of it
is always in sight (`slide` in `PortalScene`). On a touch screen a finger drags
to turn and two pinch to zoom, as before.

**The room.** A floor meets the wall at the bottom, laid just below the bottom
of the window as it is at rest (`FLOOR_DROP`), so it is out of sight head on and
comes into view as soon as the wall is turned from above or stepped back from.
The corner is drawn as the inside of one of the sideways page turn's cube edges,
in the cube's own colours (`PageTurn.module.css`): the floor, seen at a slant,
takes the cube's warm brown by how edge-on it is, deepest at the crease; the
wall darkens a little into the crease, only as far as it is turned; the crease
is a hairline; and what swings furthest away goes back into the page rather
than dark. The wall is still the page behind the canvas — all that is drawn
over it is that tint, which head on is none (`Space` in `PortalScene`).

**Frames.** An artwork can hang in a frame from `public/models/gallery/frames/`
(`frame` in `content/gallery.ts`, or the editor's panel). The frame is fitted to
the artwork's footprint and the artwork hangs in its opening, so the wall's gaps
never change; `npm run frames` measures new frames into `content/frames.ts` —
see the README in that folder. Each frame loads on its own, after the artwork:
the wall does not wait for its frames.

**Light and labels.** The wall's light is one spot from above, like a gallery's
track lights, throwing crisp shadows down the wall from anything standing off
it; the artworks themselves are not lit, so their colours are what they are.
Every artwork has a wall label (`components/WallLabel.tsx`): a slip of card on
whichever side `label` says, with the title, `medium` and `about` on it. At the
wall's size it is a little piece of paper; double-clicking the artwork zooms in
on it and its label together, which is where it is read. Labels count as part of
a frame's footprint, for the wall's fit and for the editor's even gaps.

**The wall is drawn twice.** `components/PortalWall.tsx` draws it flat, in HTML,
and `components/PortalScene.tsx` fades the canvas up over it once the pictures
are in. They land on the same pixels: every frame is on the z = 0 plane, so the
perspective camera scales them all by one number, and markup fitting the same
rectangle into the same box puts them in the same place. The flat one is what
the sideways turn would carry round on its far face (a second WebGL context for
three quarters of a second, blank for most of it, is worse than no turn at all —
hence `SideQuestsBody`'s `still`), and what a reader without WebGL keeps.

**The canvas is the window; the wall is the column.** The scene is drawn on a
`position: fixed` canvas over the whole viewport, but the camera is fitted *and
aimed* at the rectangle the section occupies: blown up by as much as the window
is bigger than that rectangle, and slid off the axis by the distance between the
two centres — which are the same point on a wide window and nowhere near it on
an upright one, where the section is cut down to the wall's own height. So at
rest the wall lands exactly where the flat copy of it does, and the margins are
window the wall simply does not reach. That is what
they are for: a wall zoomed in on runs off into them instead of being clipped at
them, and a room you have stepped into spreads out over the whole window rather
than sitting in a frame of page. The nav is given `z-index: 2` so it stays over
the canvas and stays pressable.

A room stands behind its frame and everything in it is drawn that much larger to
pay for the distance, so head-on the two cancel out and what is in the frame
sits square in it — what is left is the parallax, which only shows once the wall
is turned. That is the whole reason the rooms are back there and not in the
frame.

A model has depth, and the window is a plane that **cuts** —
anything of it in front of the glass is sliced off, and a sliced mesh is a hollow
one — so a model stands its own height further back again, which is room enough
for everything but the room's own walls, and those are what the cut is for. The
height it is drawn at is the one that pays the distance back exactly, so it
fills the frame by as much as it would have at the glass.

Every room is lit by three's `RoomEnvironment`, prefiltered once **per
renderer** — not once per page. It is a render target, whose pixels live on one
WebGL context only, and the canvas is made anew whenever the gallery is (coming
back to the tab, or React's development double-mount): cached from the last
canvas, it is an empty texture on the next, and the rooms come out at half
brightness with their metal black. Pictures and stills likewise have their
colour space set in a *layout* effect, before the first frame — a texture first
drawn while it still calls itself linear keeps linear storage for good, and
reads as the picture under a white haze.

Each room is also **scissored to its frame**. drei's `MeshPortalMaterial`
renders a room into a target the size of the whole canvas, at full pixel
density, every frame, and samples only the patch behind the frame — but a
room's sky and walls cover the whole target, so three rooms were three
full-window passes of lit shading a frame, enough to halve the frame rate on a
retina screen and make every film on the wall stutter. `clip` in
`PortalScene.tsx` projects the frame's corners each frame and cuts the room's
render down to that rectangle; while a room is opening or open, it comes off.

And **glass is drawn as plain see-through**. A glTF material with
`KHR_materials_transmission` makes three re-draw everything behind it into a
full-size, mipmapped picture of its own every frame, so that the glass can bend
it; the gate's gems and vines were glass, and that one pass was most of what
the wall cost. `Model` sets transmission to nothing and leaves the material
blended — at the size they are drawn, it looks the same.

The **films** play muted on a loop from the moment they can, showing their still
until the first frame is decoded. The film gets a material of its own when it
takes over from the still, rather than the still's material being handed a new
map: three keeps a video's frames as they come and decodes them from sRGB in
the shader, but only in a shader that was built for a video — given the still's,
every frame is drawn encoded twice, under a white haze. And every film is a
720p `-web` copy: each new frame of a film is copied into a texture, and at
1080p four of them were enough to make them stutter while the rooms stayed
smooth. Under the pointer each shows a pause control
in the middle (a press anywhere on the card works it) and, if it is marked
`sound: true`, a sound toggle in the corner. The wall has one soundtrack at a
time: turning one film's on turns whichever was on off. Both controls are drawn
in the scene rather than laid over the canvas in HTML, so they swing with the
wall like everything else on it.

**Editing the wall.** Under `next dev` there is an **Edit gallery** button in
the bottom right of the gallery, the bakery's table editor for a wall
(`components/GalleryEditor.tsx`). Drag a frame to move it and its corner to size
it — shift keeps its shape — and it snaps to an even gap (`GUTTER`, 0.3) from
the neighbour beside, above or below it, with a guide where it does; ⌘ places
it freely. Nothing snaps edges into line: the wall is ragged on purpose, and
only its spacing is even. In framing mode (the panel's button, F, or ⌥ held)
a drag moves what is inside instead: a picture or a film is panned across its
crop (`focus`) and scrolled to zoom (`zoom`); a model is walked round
(`modelView`), shift-dragged to move the point it is centred on
(`modelFocus`), and scrolled to zoom (`modelSpan`). The panel swaps which
artwork hangs in which frame, hangs new ones from the two gallery folders,
takes frames down, and has the numbers — and the label of each, with its
text. Save writes `content/gallery.ts`
through `app/api/gallery` — the picture imports and the `entries` list,
keeping the comment above each field — and neither the button nor the route
exists in any other build. While it is open the camera is held at rest and the
wall's fit is held still mid-drag, so the frame under the pointer stays under
it. A model's still is not re-rendered when its framing changes.

`three`, `@react-three/fiber` and `@react-three/drei` are about half a megabyte
between them and nothing else on the site wants them, so `PortalScene` is a
`next/dynamic` import with `ssr: false` and is fetched when this section is.

Models and films go in `public/models/gallery/` — **see the README in that
folder** for how a model is staged, where to stand to look at it, what gets
clipped, and why a Blender animation can export perfectly and still move
nothing.

`Archive/` is not part of the build — it's the old al-folio Jekyll site, kept
around to copy content out of.

## Deploy

Import the repo at [vercel.com/new](https://vercel.com/new). Framework preset
Next.js, everything else default. Pushes to `master` deploy automatically.
