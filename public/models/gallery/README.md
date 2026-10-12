# Gallery models and films

Drop `.glb` and video files here. Anything in `public/` is served from the site root, so a
file saved as `public/models/gallery/altar.glb` is fetched at
`/models/gallery/altar.glb` — and that path is what goes in `content/gallery.ts`:

```ts
{
  id: "altar",
  title: "Altar",
  image: altar,                        // kept: it is what shows if the file 404s
  model: "/models/gallery/altar.glb",  // was null
  modelSpan: 10,                       // ↓ see below
  modelFocus: [4, 0, 4.5],
  modelView: [40, 15],
}
```

A video is given the same way. It hangs flat and plays muted on a loop, with a
pause control under the pointer, and there is nowhere to step into:

```ts
{
  id: "chicago-jazz",
  title: "Green Mill",
  image: chicagoJazz,                    // shown until the film's first frame
  video: "/models/gallery/chicago_jazz.mp4",
  sound: true,                           // ↓ see below
}
```

Give the frame the film's own proportions and put a still of it in `image` —
pull one out with
`ffmpeg -ss 2 -i film.mp4 -frames:v 1 -vf scale=1280:-2 still.jpg` and save it
in `content/media/gallery/stills/`.

`sound: true` puts a sound toggle in the film's corner; only one film on the
wall has its sound on at a time. It is said rather than detected, because a
browser will not tell you whether a video has sound in it and a file can carry
a track of pure silence — `kiwi.mp4` does, which is why it has no toggle.

A plain **picture** is a frame with neither `model` nor `video`: just `image`,
imported from `content/media/gallery/`. It hangs flat and is not pressable.

A model's frame wants a still too — its **snapshot**. It is the flat copy of
the wall the canvas fades up over, and it is hung over the room's window in the
scene until the model has loaded, which is last of everything on the wall
(pictures, then frames, then films, then models — see `phase` in `Stage`). To
shoot them, open the gallery under `next dev` with `?snapshots`
(`/side-quests?snapshots#gallery`): the rooms alone, without frames, labels or
shading over them, at the size their frames leave. Screenshot each window at 2×
or more and save it over its still in `content/media/gallery/stills/`. Re-shoot
after changing a model's framing, its frame, or the gallery's FOV.

**Compress every model before hanging it** — textures to WebP, geometry and
animation with meshopt. Both are decoded in the page, with nothing fetched from
anywhere else, and Blender's PNG textures are most of a file's weight:
Espresso went from 30.6 MB to 1.7 MB this way with no visible difference.

```
npx @gltf-transform/cli webp Model.glb Model.glb --quality 88
npx @gltf-transform/cli meshopt Model.glb Model.glb
```

They have to live here rather than in `content/media/`: everything in there is
`import`ed and hashed at build time, and a `.glb` is fetched by URL at run time
instead.

## Staging

The model replaces the placeholder photograph in that portal, and the four
optional numbers below say how it stands in there. All of them are in **the
model's own units** — whatever the numbers in Blender said — because that is the
only frame of reference a `.glb` arrives with.

- **`modelSpan`** — how tall a slice of the model should fill the frame. Default:
  the whole thing.
- **`modelFocus`** — the point of it that sits in the middle of the frame.
  Default: the middle of its bounding box.
- **`modelView`** — where you are standing to look at it, in degrees: `[around,
  above]`. `[0, 0]` is straight on and level, which is what a scene built around
  one camera usually wants; `[40, 15]` walks you a third of the way round it and
  a little above. There is one camera and a wall of frames, so it is really the model
  that turns — but the number to reach for is the one you would have walked.
- **`modelScale`** / **`modelOffset`** — the last word, when the above got it
  nearly right. `modelOffset` is in room units, not the model's.

The defaults are right for a model that is only its subject. They are wrong for
one that brings a backdrop or a sky sphere with it, because a bounding box that
includes the sky is mostly sky: set `modelSpan` to the height of the thing you
actually want to look at.

Whatever the model brings, **nothing is drawn in front of its own window** —
everything nearer than the frame is clipped away, so a sky sphere that wraps
round where the camera is standing does not end up filling the frame with the
inside of its own front. The clip is lifted the moment you step through, since
by then there is no window to be in front of.

## Animation

Every animation clip in the file is played on a loop, from the moment it loads,
whether or not anybody has stepped into that portal.

A clip only shows if it drives something with geometry on it. Blender's
metaballs, grease pencil and Bézier curves are **not** geometry as far as glTF is
concerned: they export as empty nodes, so a clip that animates them exports
perfectly and moves nothing. Convert to mesh before exporting — for grease
pencil that means a mesh conversion per frame or a baked alternative, and for
metaballs, `Object > Convert > Mesh`.

## Size

These are fetched over the network, so keep them small: run them through
[gltfjsx](https://github.com/pmndrs/gltfjsx)'s transform first, which is what the
pmndrs portal demo does —

```
npx gltfjsx@latest model.glb --transform --simplify --resolution=2048
```

— and commit the `-transformed.glb` it writes, not the original. A few megabytes
each is fine; tens are not, since all of them load before the gallery settles.

Films the same, and for a second reason: every new frame of a film is copied
into a texture to be drawn, so a film's size is paid for again on every frame,
and four at 1080p are enough to make them stutter. The wall plays a 720p `-web`
copy of each, at its own frame rate:

```
ffmpeg -i apple_anim.mp4 -vf "scale=1280:-2" -c:v libx264 -preset slow \
  -crf 30 -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart apple_anim-web.mp4
```

(`-crf 26` and `-an` for a film with no sound worth keeping). `apple_anim.mp4`
is 165 MB — over GitHub's 100 MB limit — so it is git-ignored.

A film's still is best taken from the browser's own drawing of that frame, not
from ffmpeg's: the two turn a video's colour into a picture's slightly
differently, and the still is cross-faded straight into the film.

Glass made with Blender's Transmission (`KHR_materials_transmission`) is drawn
as ordinary see-through instead — real transmission costs a full re-draw of the
room every frame, which is enough to make every film on the wall stutter.

Textures are nearly always what the weight is. `Espresso_anim.glb` is 30.6 MB, of
which 27.7 MB is ten uncompressed PNGs; the transform above re-encodes those and
takes files like it down to a couple of megabytes.

Draco- and meshopt-compressed files both work, as do WebP textures
(`EXT_texture_webp`); the decoders are fetched from a CDN on demand.

## Frames

Frames go in `frames/` here, one .glb each, exported from Blender as they
are — the gallery turns each one round to face the room — with the opening cut
through (or none, for a canvas block the artwork is printed on).
Then run `npm run frames`: it measures each one — outside size, opening, depth
— into `content/frames.ts`, which is how the wall knows where an artwork sits
in its frame before the frame has loaded. Pick a frame for an artwork with
`frame: "frame1.glb"` in `content/gallery.ts`, or from the editor's panel.

A frame is fitted to its artwork's footprint (scaled across and up separately,
so it should be cut to roughly the artwork's shape) with its back on the wall,
and the artwork hangs in its opening — so framing an artwork makes the
artwork a little smaller, never the gaps between frames. Its size, position and
z in the file do not matter. Compress a frame as a model is, with its textures
no bigger than 1024px — `npm run frames` reads compressed files:

```
npx @gltf-transform/cli resize frameN.glb frameN.glb --width 1024 --height 1024
npx @gltf-transform/cli webp frameN.glb frameN.glb --quality 85
npx @gltf-transform/cli meshopt frameN.glb frameN.glb
npm run frames
```
