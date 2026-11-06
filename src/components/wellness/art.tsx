import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The Wellness mascots, drawn in code.
 *
 * ## One component, so any piece can be swapped
 *
 * Every screen asks for a picture by name (`<WellnessArt name="cherries" />`)
 * and never imports an SVG. When a licensed illustration pack replaces one of
 * these, only the entry in `ART` below changes.
 *
 * ## Style, and what it is not
 *
 * Flat bold fills, no outlines, big glossy eyes, rosy cheeks: the *style* the
 * reference screens share. The characters are original (a pair of cherries, a
 * crowned apple, a flexing avocado, a water drop, a sneaker, a pear holding a
 * heart, a flame) and none of them is traced from anybody's artwork.
 *
 * ## Theme-safe by construction
 *
 * Bodies are filled with the bright `well-*` fills, which are the same in both
 * themes, and the faces use the fixed `well-ink`, so a mascot looks the same on
 * a white card and on a dark one. A soft ground shadow keeps it from floating
 * on either.
 *
 * ## Decorative unless told otherwise
 *
 * `aria-hidden` by default: the words next to a mascot already say everything.
 * Pass `title` only where the picture is the only thing that says it.
 *
 * ## Motion
 *
 * A slow bob and a blink, and a twinkle on the sparkles of a cheering one. All
 * of it is CSS (`well-bob`, `well-blink`, `well-twinkle` in `globals.css`) and
 * all of it stops under `prefers-reduced-motion`. `animate={false}` stops it
 * everywhere, for a place that shows several at once.
 */

export type ArtName =
  "cherries" | "apple" | "avocado" | "drop" | "sneaker" | "pear" | "flame";

export type ArtMood = "happy" | "cheering" | "sleepy";

const token = (name: string) => `var(--color-well-${name})`;

/* Paint that is built from the tokens so it follows them. `color-mix` is
   supported by every browser this app targets. */
const PAINT = {
  ink: token("ink"),
  white: "#ffffff",
  pink: token("pink"),
  green: token("green"),
  peri: token("peri"),
  sun: token("sun"),
  leaf: token("green"),
  stem: `color-mix(in srgb, ${token("green")} 45%, ${token("ink")})`,
  skin: `color-mix(in srgb, ${token("green")} 62%, ${token("ink")})`,
  pit: `color-mix(in srgb, ${token("pink")} 45%, ${token("sun")})`,
  rose: `color-mix(in srgb, ${token("pink")} 78%, ${token("ink")})`,
  blush: `color-mix(in srgb, ${token("pink")} 75%, transparent)`,
  shade: `color-mix(in srgb, ${token("ink")} 14%, transparent)`,
  shine: "rgb(255 255 255 / 0.55)",
} as const;

const fill = (color: string): CSSProperties => ({ fill: color });
const stroke = (color: string, width: number): CSSProperties => ({
  fill: "none",
  stroke: color,
  strokeWidth: width,
  strokeLinecap: "round",
  strokeLinejoin: "round",
});

/* ------------------------------------------------------------------- pieces */

function Face({
  cx,
  cy,
  s = 1,
  mood,
  shades = false,
}: {
  cx: number;
  cy: number;
  s?: number;
  mood: ArtMood;
  /** Sunglasses, for the cool one. */
  shades?: boolean;
}) {
  const ex = 9 * s;
  const eyes =
    mood === "sleepy" ? (
      <>
        <path
          d={`M${cx - ex - 5 * s} ${cy + s} q ${5 * s} ${5.5 * s} ${10 * s} 0`}
          style={stroke(PAINT.ink, 2.2 * s)}
        />
        <path
          d={`M${cx + ex - 5 * s} ${cy + s} q ${5 * s} ${5.5 * s} ${10 * s} 0`}
          style={stroke(PAINT.ink, 2.2 * s)}
        />
      </>
    ) : shades ? (
      <>
        <rect
          x={cx - ex - 8 * s}
          y={cy - 6 * s}
          width={16 * s}
          height={12 * s}
          rx={5 * s}
          style={fill(PAINT.ink)}
        />
        <rect
          x={cx + ex - 8 * s}
          y={cy - 6 * s}
          width={16 * s}
          height={12 * s}
          rx={5 * s}
          style={fill(PAINT.ink)}
        />
        <path
          d={`M${cx - ex + 8 * s} ${cy - 2 * s} h${2 * s * 1}`}
          style={stroke(PAINT.ink, 2 * s)}
        />
        <path
          d={`M${cx - ex - 5 * s} ${cy - 3 * s} l ${4 * s} ${-1 * s}`}
          style={stroke(PAINT.white, 1.4 * s)}
        />
      </>
    ) : (
      [-ex, ex].map((dx) => (
        <g key={dx} className="well-blink">
          <ellipse
            cx={cx + dx}
            cy={cy}
            rx={6.2 * s}
            ry={7.4 * s}
            style={fill(PAINT.white)}
          />
          <circle
            cx={cx + dx + 0.6 * s}
            cy={cy + 1 * s}
            r={4 * s}
            style={fill(PAINT.ink)}
          />
          <circle
            cx={cx + dx - 0.7 * s}
            cy={cy - 1.2 * s}
            r={1.4 * s}
            style={fill(PAINT.white)}
          />
        </g>
      ))
    );

  const mouth =
    mood === "cheering" ? (
      <path
        d={`M${cx - 6 * s} ${cy + 9 * s} h${12 * s} a${6 * s} ${7 * s} 0 0 1 ${-12 * s} 0z`}
        style={fill(PAINT.ink)}
      />
    ) : mood === "sleepy" ? (
      <ellipse
        cx={cx}
        cy={cy + 11 * s}
        rx={2.2 * s}
        ry={1.8 * s}
        style={fill(PAINT.ink)}
      />
    ) : (
      <path
        d={`M${cx - 4.5 * s} ${cy + 9 * s} q ${4.5 * s} ${5 * s} ${9 * s} 0`}
        style={stroke(PAINT.ink, 2 * s)}
      />
    );

  return (
    <g>
      {eyes}
      <ellipse
        cx={cx - 17 * s}
        cy={cy + 8 * s}
        rx={4.4 * s}
        ry={2.9 * s}
        style={fill(PAINT.blush)}
      />
      <ellipse
        cx={cx + 17 * s}
        cy={cy + 8 * s}
        rx={4.4 * s}
        ry={2.9 * s}
        style={fill(PAINT.blush)}
      />
      {mouth}
    </g>
  );
}

function Sparkle({
  x,
  y,
  size = 6,
  delay = 0,
  color = PAINT.sun,
}: {
  x: number;
  y: number;
  size?: number;
  delay?: number;
  color?: string;
}) {
  const a = size;
  const b = size * 0.28;
  return (
    <path
      className="well-twinkle"
      style={{ ...fill(color), animationDelay: `${String(delay)}s` }}
      d={`M${x} ${y - a} Q${x + b} ${y - b} ${x + a} ${y} Q${x + b} ${y + b} ${x} ${y + a} Q${x - b} ${y + b} ${x - a} ${y} Q${x - b} ${y - b} ${x} ${y - a}Z`}
    />
  );
}

/** Zs for a sleepy one. */
function Zs({ x, y }: { x: number; y: number }) {
  return (
    <g style={stroke(PAINT.ink, 1.8)} opacity={0.55}>
      <path d={`M${x} ${y} h6 l-6 7 h6`} />
      <path d={`M${x + 9} ${y - 9} h4.5 l-4.5 5.2 h4.5`} />
    </g>
  );
}

function Ground({
  cx = 60,
  cy = 112,
  rx = 30,
}: {
  cx?: number;
  cy?: number;
  rx?: number;
}) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={4.5} style={fill(PAINT.shade)} />;
}

/** A thin arm. `up` raises it in a cheer. */
function Arm({
  from,
  to,
  color,
  hand = true,
}: {
  from: [number, number];
  to: [number, number];
  color: string;
  hand?: boolean;
}) {
  const mid: [number, number] = [
    (from[0] + to[0]) / 2 + (to[0] < from[0] ? -5 : 5),
    (from[1] + to[1]) / 2,
  ];
  return (
    <g>
      <path
        d={`M${from[0]} ${from[1]} Q${mid[0]} ${mid[1]} ${to[0]} ${to[1]}`}
        style={stroke(color, 5.5)}
      />
      {hand && <circle cx={to[0]} cy={to[1]} r={4} style={fill(color)} />}
    </g>
  );
}

/* ---------------------------------------------------------------- mascots */

function Cherries({ mood }: { mood: ArtMood }) {
  const up = mood === "cheering";
  return (
    <g>
      <Ground rx={42} />
      <path d="M38 62 Q46 34 66 18" style={stroke(PAINT.stem, 3.6)} />
      <path d="M84 66 Q80 38 66 18" style={stroke(PAINT.stem, 3.6)} />
      <path
        d="M66 18 C78 4 98 6 104 12 C96 26 78 28 66 18Z"
        style={fill(PAINT.leaf)}
      />
      <path
        d="M68 19 C80 14 92 12 100 12"
        style={stroke(PAINT.stem, 1.4)}
        opacity={0.5}
      />
      {up && (
        <>
          <Arm from={[13, 84]} to={[4, 62]} color={PAINT.pink} />
          <Arm from={[107, 90]} to={[116, 68]} color={PAINT.pink} />
        </>
      )}
      <circle cx={36} cy={84} r={25} style={fill(PAINT.pink)} />
      <circle cx={84} cy={88} r={25} style={fill(PAINT.pink)} />
      <ellipse
        cx={26}
        cy={72}
        rx={4.5}
        ry={7}
        transform="rotate(30 26 72)"
        style={fill(PAINT.shine)}
      />
      <ellipse
        cx={74}
        cy={76}
        rx={4.5}
        ry={7}
        transform="rotate(30 74 76)"
        style={fill(PAINT.shine)}
      />
      <Face cx={36} cy={83} s={0.78} mood={mood} />
      <Face cx={84} cy={87} s={0.78} mood={mood} />
      {mood === "sleepy" && <Zs x={52} y={46} />}
    </g>
  );
}

function Apple({ mood }: { mood: ArtMood }) {
  const up = mood === "cheering";
  return (
    <g>
      <Ground rx={34} />
      {up && (
        <>
          <Arm from={[20, 78]} to={[9, 56]} color={PAINT.pink} />
          <Arm from={[100, 78]} to={[111, 56]} color={PAINT.pink} />
        </>
      )}
      <path
        d="M60 36 C44 26 18 34 18 68 C18 94 38 108 52 108 C56 108 58 106 60 106 C62 106 64 108 68 108 C82 108 102 94 102 68 C102 34 76 26 60 36Z"
        style={fill(PAINT.pink)}
      />
      <ellipse
        cx={34}
        cy={60}
        rx={5}
        ry={9}
        transform="rotate(20 34 60)"
        style={fill(PAINT.shine)}
      />
      <path d="M60 36 Q60 24 66 16" style={stroke(PAINT.stem, 4)} />
      <path
        d="M66 18 C76 6 94 6 100 12 C92 24 76 26 66 18Z"
        style={fill(PAINT.leaf)}
      />
      {/* The crown: three points and a band, a little off the level. */}
      <g transform="rotate(-9 44 30)">
        <path
          d="M30 40 L32 16 L40 28 L46 12 L52 28 L60 16 L60 40Z"
          style={fill(PAINT.sun)}
        />
        <rect
          x={30}
          y={36}
          width={30}
          height={6}
          rx={2}
          style={fill(PAINT.rose)}
          opacity={0.55}
        />
        <circle cx={32} cy={16} r={2.6} style={fill(PAINT.white)} />
        <circle cx={46} cy={12} r={2.6} style={fill(PAINT.white)} />
        <circle cx={60} cy={16} r={2.6} style={fill(PAINT.white)} />
      </g>
      <Face cx={60} cy={68} s={1.02} mood={mood} />
      {mood === "cheering" && (
        <>
          <Sparkle x={14} y={30} size={7} />
          <Sparkle x={108} y={32} size={6} delay={0.9} />
        </>
      )}
      {mood === "sleepy" && <Zs x={88} y={40} />}
    </g>
  );
}

function Avocado({ mood }: { mood: ArtMood }) {
  const flex = mood === "cheering";
  return (
    <g>
      <Ground rx={30} cy={113} />
      {/* Legs and feet. */}
      <path d="M48 98 V110 M72 98 V110" style={stroke(PAINT.skin, 6)} />
      <ellipse cx={44} cy={111} rx={8} ry={3.4} style={fill(PAINT.skin)} />
      <ellipse cx={76} cy={111} rx={8} ry={3.4} style={fill(PAINT.skin)} />
      {/* Arms: a flex with a bicep, or just by the sides. */}
      {flex ? (
        <>
          <path d="M26 74 Q8 70 10 48" style={stroke(PAINT.skin, 8)} />
          <circle cx={13} cy={64} r={6.5} style={fill(PAINT.skin)} />
          <circle cx={10} cy={44} r={6} style={fill(PAINT.skin)} />
          <path d="M94 74 Q112 70 110 48" style={stroke(PAINT.skin, 8)} />
          <circle cx={107} cy={64} r={6.5} style={fill(PAINT.skin)} />
          <circle cx={110} cy={44} r={6} style={fill(PAINT.skin)} />
        </>
      ) : (
        <>
          <path d="M28 76 Q16 84 20 96" style={stroke(PAINT.skin, 7)} />
          <path d="M92 76 Q104 84 100 96" style={stroke(PAINT.skin, 7)} />
        </>
      )}
      {/* Skin, then flesh, then the pit. */}
      <path
        d="M60 8 C44 8 38 26 32 42 C26 58 24 66 24 78 C24 96 38 106 60 106 C82 106 96 96 96 78 C96 66 94 58 88 42 C82 26 76 8 60 8Z"
        style={fill(PAINT.skin)}
      />
      <path
        d="M60 16 C48 16 44 30 39 44 C34 58 32 66 32 78 C32 92 43 99 60 99 C77 99 88 92 88 78 C88 66 86 58 81 44 C76 30 72 16 60 16Z"
        style={fill(PAINT.sun)}
      />
      <circle cx={60} cy={80} r={14} style={fill(PAINT.pit)} />
      <ellipse
        cx={55}
        cy={75}
        rx={3.4}
        ry={4.6}
        transform="rotate(30 55 75)"
        style={fill(PAINT.shine)}
      />
      <Face cx={60} cy={52} s={0.95} mood={mood} shades={flex} />
      {flex && (
        <>
          <Sparkle x={22} y={22} size={6} />
          <Sparkle x={100} y={20} size={7} delay={1.1} />
        </>
      )}
      {mood === "sleepy" && <Zs x={90} y={30} />}
    </g>
  );
}

function Drop({ mood }: { mood: ArtMood }) {
  const up = mood === "cheering";
  return (
    <g>
      <Ground rx={30} cy={112} />
      {up && (
        <>
          <Arm from={[26, 80]} to={[12, 58]} color={PAINT.peri} />
          <Arm from={[94, 80]} to={[108, 58]} color={PAINT.peri} />
        </>
      )}
      <path
        d="M60 6 C60 6 22 48 22 76 C22 98 38 110 60 110 C82 110 98 98 98 76 C98 48 60 6 60 6Z"
        style={fill(PAINT.peri)}
      />
      <path
        d="M36 74 C36 62 42 52 48 44"
        style={{ ...stroke(PAINT.white, 6), opacity: 0.55 }}
      />
      <Face cx={60} cy={78} s={1.05} mood={mood} />
      {mood === "cheering" && (
        <>
          <Sparkle x={20} y={26} size={6} color={PAINT.white} />
          <Sparkle x={102} y={30} size={5} delay={1} color={PAINT.white} />
        </>
      )}
      {mood === "sleepy" && <Zs x={88} y={30} />}
    </g>
  );
}

function Sneaker({ mood }: { mood: ArtMood }) {
  const hop = mood === "cheering";
  return (
    <g transform={hop ? "translate(0 -4)" : undefined}>
      <Ground rx={46} cy={112} />
      {/* The sole, then the upper, the toe cap, the collar and the laces. */}
      <path
        d="M10 92 C10 86 16 84 22 84 H98 C108 84 112 90 112 96 C112 104 106 108 98 108 H22 C14 108 10 102 10 92Z"
        style={fill(PAINT.peri)}
      />
      <path
        d="M16 88 L18 46 C18 36 26 30 36 30 L54 30 C58 30 60 34 62 40 C68 52 82 56 96 62 C106 66 112 74 112 88Z"
        style={fill(PAINT.green)}
      />
      <path
        d="M86 61 C100 66 110 74 112 88 H80 C82 76 84 68 86 61Z"
        style={fill(PAINT.sun)}
      />
      <ellipse cx={37} cy={31} rx={16} ry={6.5} style={fill(PAINT.pink)} />
      <g style={stroke(PAINT.white, 3.6)}>
        <path d="M56 42 L68 38" />
        <path d="M60 52 L72 47" />
        <path d="M66 62 L77 56" />
      </g>
      <Face cx={38} cy={64} s={0.82} mood={mood} />
      {mood === "cheering" && (
        <>
          <Sparkle x={106} y={28} size={7} />
          <Sparkle x={14} y={28} size={5} delay={0.8} />
        </>
      )}
      {mood === "sleepy" && <Zs x={84} y={30} />}
    </g>
  );
}

function Pear({ mood }: { mood: ArtMood }) {
  return (
    <g>
      <Ground rx={30} cy={112} />
      {mood === "cheering" ? (
        <>
          <Arm from={[26, 84]} to={[10, 66]} color={PAINT.sun} hand={false} />
          <Arm from={[94, 84]} to={[110, 60]} color={PAINT.sun} hand={false} />
          {/* The heart, held up in a raised hand. */}
          <path
            d="M110 60 C100 52 98 42 106 38 C110 36 112 40 112 42 C112 40 116 36 120 38 C126 42 122 52 110 60Z"
            transform="translate(-6 -6)"
            style={fill(PAINT.pink)}
          />
        </>
      ) : (
        <>
          <path d="M28 86 Q16 90 18 102" style={stroke(PAINT.sun, 6)} />
          <path d="M92 86 Q104 90 102 102" style={stroke(PAINT.sun, 6)} />
        </>
      )}
      <path
        d="M60 14 C48 14 44 26 42 36 C40 46 22 56 22 80 C22 98 38 108 60 108 C82 108 98 98 98 80 C98 56 80 46 78 36 C76 26 72 14 60 14Z"
        style={fill(PAINT.sun)}
      />
      <ellipse
        cx={36}
        cy={74}
        rx={4.6}
        ry={9}
        transform="rotate(14 36 74)"
        style={fill(PAINT.shine)}
      />
      <path d="M60 16 Q62 8 68 4" style={stroke(PAINT.stem, 3.6)} />
      <path
        d="M66 10 C76 -2 94 0 98 8 C90 20 74 20 66 10Z"
        style={fill(PAINT.leaf)}
      />
      <Face cx={60} cy={72} s={1} mood={mood} />
      {mood === "cheering" && (
        <Sparkle x={20} y={34} size={6} color={PAINT.pink} />
      )}
      {mood === "sleepy" && <Zs x={86} y={34} />}
    </g>
  );
}

/** A flame with a friendly face: the streak, and the small version of it. */
function Flame({ mood }: { mood: ArtMood }) {
  return (
    <g>
      <Ground rx={24} cy={113} />
      <path
        d="M60 6 C64 24 92 38 92 72 C92 94 78 110 60 110 C42 110 28 94 28 72 C28 58 36 48 42 40 C44 48 48 52 52 52 C50 36 54 20 60 6Z"
        style={fill(PAINT.pink)}
      />
      <path
        d="M60 36 C62 50 80 58 80 76 C80 92 71 104 60 104 C49 104 40 92 40 76 C40 68 44 62 48 58 C50 64 54 66 56 66 C54 54 56 44 60 36Z"
        style={fill(PAINT.sun)}
      />
      <Face cx={60} cy={78} s={0.85} mood={mood} />
      {mood === "sleepy" && <Zs x={84} y={34} />}
    </g>
  );
}

const ART: Record<ArtName, (props: { mood: ArtMood }) => ReactNode> = {
  cherries: Cherries,
  apple: Apple,
  avocado: Avocado,
  drop: Drop,
  sneaker: Sneaker,
  pear: Pear,
  flame: Flame,
};

export const ART_NAMES = Object.keys(ART) as ArtName[];

export function WellnessArt({
  name,
  mood = "happy",
  size = 96,
  title,
  animate = true,
  className,
}: {
  name: ArtName;
  mood?: ArtMood;
  /** Width and height in pixels. The drawing is square. */
  size?: number;
  /** Only when the picture is the only thing that says it. Otherwise decorative. */
  title?: string;
  /** Off for a place that shows several at once. */
  animate?: boolean;
  className?: string;
}) {
  const Piece = ART[name];
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      {...(title
        ? { role: "img", "aria-label": title }
        : { "aria-hidden": true, focusable: false })}
    >
      <g className={animate && mood !== "sleepy" ? "well-bob" : undefined}>
        <Piece mood={mood} />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------- scenes */

/**
 * The Open Doodles scenes (CC0, Pablo Stanley), for the places a person is
 * doing something rather than a character reacting: running, resting, a coffee.
 * Static files in `public/wellness/scenes/`, loaded lazily, never in the JS.
 * Black line art, so they sit on a light sticker in both themes.
 */
export type SceneName =
  "strolling" | "meditating" | "chilling" | "coffee" | "ice-cream";

export function SceneImage({
  name,
  size = 120,
  className,
}: {
  name: SceneName;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-2xl bg-well-sticker p-2",
        className,
      )}
    >
      {/* The scenes are decorative line art in a fixed palette; `next/image`
          would add a loader for files that are already small static SVGs. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/wellness/scenes/${name}.svg`}
        alt=""
        width={size}
        height={Math.round(size * 0.75)}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="select-none object-contain"
      />
    </span>
  );
}
