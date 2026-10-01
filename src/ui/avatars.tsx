// Ready-made client avatars, drawn as small SVG pictures (no images to upload or store).
// Each one is a set of parts: hair at the back and front, beard, glasses, headwear and the like.
import { useId, type ReactNode } from 'react';

const SKIN = { light: '#f6d3b3', fair: '#eebf98', tan: '#d39a6a', brown: '#9a6440', dark: '#6b4128' };
const HAIR = { black: '#2a2220', brown: '#6a4226', blonde: '#e6c36a', red: '#b8482b', grey: '#a8a4a0', white: '#e8e4df' };

interface Look {
  bg: string;
  skin: string;
  shirt: string;
  hair?: string;
  /** Hair behind the head (long, bob, afro…). */
  back?: 'long' | 'bob' | 'afro' | 'longMale' | 'pigtails' | 'shaggy';
  /** Hair on top. */
  top?: 'short' | 'receding' | 'bangs' | 'side' | 'curly' | 'bun' | 'spiky' | 'asym' | 'pixie' | 'sweep' | 'buzz';
  beard?: 'full' | 'braided' | 'mustache' | 'goatee' | 'stubble' | 'viking';
  beardColor?: string;
  glasses?: 'round' | 'square' | 'sun' | 'rimless';
  hat?: 'bandana' | 'beanie' | 'cap' | 'helmet' | 'headband' | 'tricorn';
  hatColor?: string;
  patch?: boolean | 'skull';
  /** Tricorn trim colour (gold by default). */
  hatTrim?: string;
  /** Frowning brows. */
  angry?: boolean;
  pipe?: boolean;
  /** A crow on the shoulder. */
  crow?: boolean;
  earring?: boolean | 'stud' | 'plug';
  /** Eye colour (dark by default). */
  eyes?: string;
  /** A wide smile showing teeth. */
  teeth?: boolean;
  /** Neckline trim of the top. */
  collar?: string;
  smile?: boolean;
  lashes?: boolean;
  /** Coloured lips. */
  lips?: boolean;
}

function Face({ look }: { look: Look }) {
  const { skin, hair = HAIR.black } = look;
  const beard = look.beardColor || hair;
  const parts: ReactNode[] = [];
  // Background, shoulders, neck.
  parts.push(<circle key="bg" cx="32" cy="32" r="32" fill={look.bg} />);
  if (look.back === 'afro') parts.push(<circle key="afro" cx="32" cy="25" r="20" fill={hair} />);
  if (look.back === 'long') parts.push(<path key="long" d="M15 30 C13 10 51 10 49 30 L51 54 L13 54 Z" fill={hair} />);
  if (look.back === 'longMale') parts.push(<path key="lm" d="M17 28 C16 12 48 12 47 28 L48 48 L16 48 Z" fill={hair} />);
  // Wild hair sticking out at the sides under a hat.
  if (look.back === 'shaggy')
    parts.push(
      <g key="sh" fill={hair}>
        <path d="M21 22 C15 25 13 31 14.5 37 L12.5 40 L16.5 40 L15.5 44 L19.5 41.5 L20.5 46 L23 40 L22.5 28 Z" />
        <path d="M43 22 C49 25 51 31 49.5 37 L51.5 40 L47.5 40 L48.5 44 L44.5 41.5 L43.5 46 L41 40 L41.5 28 Z" />
      </g>,
    );
  if (look.back === 'bob') parts.push(<path key="bob" d="M16 30 C14 11 50 11 48 30 L48 43 L16 43 Z" fill={hair} />);
  if (look.back === 'pigtails')
    parts.push(
      <g key="pt" fill={hair}>
        <ellipse cx="14" cy="36" rx="5" ry="9" />
        <ellipse cx="50" cy="36" rx="5" ry="9" />
      </g>,
    );
  parts.push(<path key="body" d="M10 64 C10 52 20 48 32 48 C44 48 54 52 54 64 Z" fill={look.shirt} />);
  parts.push(<rect key="neck" x="27.5" y="40" width="9" height="10" rx="3" fill={skin} />);
  if (look.collar) parts.push(<path key="col" d="M25.5 49.2 C28 52.5 36 52.5 38.5 49.2" stroke={look.collar} strokeWidth="1.6" fill="none" strokeLinecap="round" />);
  // Ears, head.
  parts.push(<circle key="el" cx="19.5" cy="31" r="3" fill={skin} />, <circle key="er" cx="44.5" cy="31" r="3" fill={skin} />);
  parts.push(<ellipse key="head" cx="32" cy="30" rx="12.5" ry="14.5" fill={skin} />);
  // Hair on top.
  const top = look.top;
  if (top === 'short') parts.push(<path key="t" d="M19.5 29 C18 10 46 10 44.5 29 C42 21 37 19.5 32 19.5 C26 19.5 22 21 19.5 29 Z" fill={hair} />);
  if (top === 'spiky')
    parts.push(<path key="t" d="M19.5 29 C18 18 22 14 24 13 L26 17 L28 11 L31 16 L34 10 L36 16 L39 12 L40 17 L43 15 C46 19 46 24 44.5 29 C42 22 37 20 32 20 C26 20 22 22 19.5 29 Z" fill={hair} />);
  // Receding at the temples, hair still on top (an M-shaped hairline).
  if (top === 'receding')
    parts.push(
      <path
        key="t"
        d="M19.5 30 C18.5 11 45.5 11 44.5 30 C44 27 43 24.5 41.8 22.8 C40 23.2 38.6 21.8 37.4 19.4 C35.4 20.3 33.6 21.4 32 23 C30.4 21.4 28.6 20.3 26.6 19.4 C25.4 21.8 24 23.2 22.2 22.8 C21 24.5 20 27 19.5 30 Z"
        fill={hair}
      />,
    );
  if (top === 'bangs') parts.push(<path key="t" d="M19.5 29 C19 11 45 11 44.5 29 C41 22 34 22.5 30 20.5 C26 23 22 24 19.5 29 Z" fill={hair} />);
  if (top === 'side') parts.push(<path key="t" d="M19.5 29 C18 10 46 10 44.5 29 C44 24 41 20.5 37 20 C31 21 25 23.5 19.5 29 Z" fill={hair} />);
  if (top === 'bun')
    parts.push(
      <g key="t" fill={hair}>
        <circle cx="32" cy="12.5" r="5.5" />
        <path d="M19.5 29 C18 11 46 11 44.5 29 C42 22 37 20.5 32 20.5 C27 20.5 22 22 19.5 29 Z" />
      </g>,
    );
  if (top === 'curly')
    parts.push(
      <g key="t" fill={hair}>
        {[
          [21, 23],
          [24, 18.5],
          [29, 16],
          [35, 16],
          [40, 18.5],
          [43, 23],
          [32, 19.5],
        ].map(([x, y]) => (
          <circle key={x + '-' + y} cx={x} cy={y} r="4.6" />
        ))}
      </g>,
    );
  // Short asymmetric cut: the left side short, a long sweep over the forehead down to the jaw on the right.
  if (top === 'asym')
    parts.push(
      <path key="t" d="M19.5 29 C18 10 47 9 46.8 30 L47 41.5 C45 41.5 43.6 39.5 43.6 36 C43 27 37 22.5 30 22 C25.5 22.5 22 25 19.5 29 Z" fill={hair} />,
    );
  // Buzz cut with a high receding hairline and a small tuft in the middle.
  if (top === 'buzz')
    parts.push(
      <path
        key="t"
        d="M19.4 30 C18.4 11 45.6 11 44.6 30 C44.3 26.6 43.5 24 42.4 22.6 C40.4 22.4 38.6 21.2 37.2 19.4 C35.4 19.8 33.6 20.6 32 22 C30.4 20.6 28.6 19.8 26.8 19.4 C25.4 21.2 23.6 22.4 21.6 22.6 C20.5 24 19.7 26.6 19.4 30 Z"
        fill={hair}
        opacity="0.92"
      />,
    );
  // Short with volume on top and a long fringe swept across the forehead to one side.
  if (top === 'sweep')
    parts.push(
      <g key="t" fill={hair}>
        <path d="M18.6 31 C15.5 8 48.5 8 46.2 31 C45.8 34 44.4 36.4 42.8 37.2 C43.2 33 42.6 30.4 41.4 29.2 C35 28.4 27.4 25.2 22.4 23.2 C20.8 25.4 19.4 28 18.6 31 Z" />
        <path d="M19 30 C18.4 33 18.8 35.5 20.2 37 C20.6 34.5 20.8 32 21.4 29.8 Z" />
      </g>,
    );
  // Pixie: short, soft, a side fringe.
  if (top === 'pixie')
    parts.push(
      <g key="t" fill={hair}>
        <path d="M19 31 C17 10 47 10 45 31 C44.5 26 42.5 22 38.5 21 C35 24.5 28 25.5 23 24 C21 26 19.8 28 19 31 Z" />
        <path d="M19 30 C18 34 18.5 38 20.5 40 C21 36 21 33 21.5 30 Z" />
        <path d="M45 30 C46 34 45.5 38 43.5 40 C43 36 43 33 42.5 30 Z" />
      </g>,
    );
  // Eyes, brows, nose, mouth.
  if (!look.glasses || look.glasses !== 'sun') {
    parts.push(<circle key="e1" cx="27" cy="30.5" r="1.6" fill={look.eyes || '#2a2220'} />);
    if (!look.patch) parts.push(<circle key="e2" cx="37" cy="30.5" r="1.6" fill={look.eyes || '#2a2220'} />);
    if (look.eyes)
      parts.push(
        <g key="pu" fill="#1d1d1f">
          <circle cx="27" cy="30.5" r="0.7" />
          <circle cx="37" cy="30.5" r="0.7" />
        </g>,
      );
  }
  if (look.lashes)
    parts.push(
      <g key="la" stroke="#2a2220" strokeWidth="0.9" strokeLinecap="round">
        <path d="M25 29 L24 28" />
        {!look.patch && <path d="M39 29 L40 28" />}
      </g>,
    );
  parts.push(
    <g key="br" stroke={look.top === 'receding' && !look.hair ? '#2a2220' : beard} strokeWidth="1.3" strokeLinecap="round" fill="none">
      {look.angry ? (
        <>
          <path d="M24 25.2 L29.6 27.4" />
          <path d="M34.4 27.4 L40 25.2" />
        </>
      ) : (
        <>
          <path d="M24.5 26.5 Q27 25.3 29.3 26.3" />
          <path d="M34.7 26.3 Q37 25.3 39.5 26.5" />
        </>
      )}
    </g>,
  );
  parts.push(<path key="n" d="M32 32 Q31 35 32.8 35.4" stroke="rgba(0,0,0,0.25)" strokeWidth="1" fill="none" strokeLinecap="round" />);
  // Beard (under the mouth line).
  const b = look.beard;
  if (b === 'full' || b === 'braided' || b === 'viking')
    parts.push(<path key="b" d="M19.5 31 C19.5 47 26 50 32 50 C38 50 44.5 47 44.5 31 C43 38 39 40.5 32 40.5 C25 40.5 21 38 19.5 31 Z" fill={beard} />);
  if (b === 'braided')
    parts.push(
      <g key="br2" fill={beard} stroke="rgba(0,0,0,0.25)" strokeWidth="0.6">
        <ellipse cx="32" cy="52" rx="2.6" ry="2.4" />
        <ellipse cx="32" cy="56" rx="2.3" ry="2.2" />
        <ellipse cx="32" cy="59.6" rx="2" ry="1.9" />
        <circle cx="32" cy="62.4" r="1.4" fill="#d9a441" stroke="none" />
      </g>,
    );
  if (b === 'viking')
    parts.push(
      <g key="vk" fill={beard}>
        <path d="M25 46 L23.5 58 L27 57 Z" />
        <path d="M39 46 L40.5 58 L37 57 Z" />
      </g>,
    );
  if (b === 'goatee') parts.push(<path key="b" d="M28 40 C28 46 36 46 36 40 C34 41.5 30 41.5 28 40 Z" fill={beard} />);
  if (b === 'stubble') parts.push(<path key="b" d="M20 33 C20.5 45 26 48 32 48 C38 48 43.5 45 44 33 C42 39 38 41 32 41 C26 41 22 39 20 33 Z" fill={beard} opacity="0.35" />);
  // Mouth, then mustache over it.
  if (look.teeth)
    parts.push(
      <g key="m">
        <path d="M27.6 37.4 Q32 42.6 36.4 37.4 Z" fill="#fff" stroke={look.lips ? '#a8344f' : '#7a3b2e'} strokeWidth="0.9" strokeLinejoin="round" />
        <path d="M28.6 38.2 H35.4" stroke="rgba(0,0,0,0.12)" strokeWidth="0.5" />
      </g>,
    );
  else parts.push(
    look.smile ? (
      <path key="m" d="M28.3 38.2 Q32 41.6 35.7 38.2" stroke={look.lips ? '#c0395b' : '#7a3b2e'} strokeWidth={look.lips ? 1.9 : 1.4} fill="none" strokeLinecap="round" />
    ) : (
      <path key="m" d="M29 38.8 Q32 40 35 38.8" stroke={look.lips ? '#c0395b' : '#7a3b2e'} strokeWidth={look.lips ? 1.9 : 1.4} fill="none" strokeLinecap="round" />
    ),
  );
  if (b === 'mustache' || b === 'full' || b === 'braided' || b === 'viking')
    parts.push(<path key="mu" d="M25.5 38 C27.5 35.3 30.5 35.6 32 36.7 C33.5 35.6 36.5 35.3 38.5 38 C36 37.4 34 37.7 32 38.4 C30 37.7 28 37.4 25.5 38 Z" fill={beard} />);
  // Glasses, patch, earring.
  if (look.glasses === 'round' || look.glasses === 'square') {
    const lens =
      look.glasses === 'round'
        ? [<circle key="g1" cx="27" cy="30.5" r="4.3" />, <circle key="g2" cx="37" cy="30.5" r="4.3" />]
        : [<rect key="g1" x="22.5" y="27" width="9" height="7" rx="1.6" />, <rect key="g2" x="32.5" y="27" width="9" height="7" rx="1.6" />];
    parts.push(
      <g key="gl" stroke="#2a2220" strokeWidth="1.3" fill="rgba(255,255,255,0.18)">
        {lens}
        <path d="M31.3 30 L32.7 30" />
      </g>,
    );
  }
  if (look.glasses === 'rimless')
    parts.push(
      <g key="gl" stroke="#c3ced6" strokeWidth="0.55" fill="rgba(235,245,250,0.12)">
        <path d="M22.4 28.2 H31.2 C31.2 32.6 29.8 33.6 26.8 33.6 C23.8 33.6 22.4 32.6 22.4 28.2 Z" />
        <path d="M32.8 28.2 H41.6 C41.6 32.6 40.2 33.6 37.2 33.6 C34.2 33.6 32.8 32.6 32.8 28.2 Z" />
        <path d="M31.2 29 Q32 28.4 32.8 29 M22.4 28.6 L19.8 29.2 M41.6 28.6 L44.2 29.2" fill="none" />
      </g>,
    );
  if (look.glasses === 'sun')
    parts.push(
      <g key="gl" fill="#1d1d1f">
        <path d="M21.5 27.5 H31.3 V31 C31.3 34 22.5 34 21.5 31 Z" />
        <path d="M32.7 27.5 H42.5 V31 C41.5 34 32.7 34 32.7 31 Z" />
        <rect x="31" y="28" width="2" height="1.3" />
      </g>,
    );
  if (look.patch)
    parts.push(
      <g key="pa">
        <path d="M20 23 L44.5 33" stroke="#1d1d1f" strokeWidth="1.2" />
        <ellipse cx="37" cy="30.8" rx="3.6" ry="3.2" fill="#1d1d1f" />
        {look.patch === 'skull' && (
          <g fill="#d9dde2">
            <circle cx="37" cy="30.1" r="1.7" />
            <rect x="36" y="31.2" width="2" height="1.3" rx="0.3" />
            <circle cx="36.35" cy="30" r="0.45" fill="#1d1d1f" />
            <circle cx="37.65" cy="30" r="0.45" fill="#1d1d1f" />
          </g>
        )}
      </g>,
    );
  if (look.earring === 'plug') parts.push(<circle key="ea" cx="19.2" cy="34.4" r="1.3" fill="#3a3a3a" stroke="#1d1d1f" strokeWidth="0.5" />);
  else if (look.earring === 'stud')
    parts.push(
      <g key="ea" fill="#1d1d1f">
        <circle cx="19.2" cy="34.6" r="1" />
        <circle cx="44.8" cy="34.6" r="1" />
      </g>,
    );
  else if (look.earring) parts.push(<circle key="ea" cx="19" cy="35.5" r="1.8" fill="none" stroke="#d9a441" strokeWidth="1.1" />);
  // Headwear.
  const hc = look.hatColor || '#c0392b';
  if (look.hat === 'bandana')
    parts.push(
      <g key="h" fill={hc}>
        <path d="M18.5 27 C18 12 46 12 45.5 27 C40 22.5 24 22.5 18.5 27 Z" />
        <path d="M45 24 L52 22 L50.5 27 Z" />
        <path d="M45 25 L51.5 30 L46.5 30.5 Z" />
        <circle cx="26" cy="18" r="1" fill="#fff" />
        <circle cx="33" cy="16.5" r="1" fill="#fff" />
        <circle cx="39" cy="19" r="1" fill="#fff" />
      </g>,
    );
  if (look.hat === 'beanie')
    parts.push(
      <g key="h">
        <path d="M18.5 25 C18 9 46 9 45.5 25 Z" fill={hc} />
        <rect x="17.5" y="22" width="29" height="5.5" rx="2.5" fill={hc} stroke="rgba(0,0,0,0.18)" />
        <circle cx="32" cy="8.5" r="3" fill={hc} />
      </g>,
    );
  if (look.hat === 'cap')
    parts.push(
      <g key="h" fill={hc}>
        <path d="M18.5 25.5 C18 11 46 11 45.5 25.5 Z" />
        <path d="M30 24 C38 22.5 47 23 52 26 C47 27.5 38 27.5 30 26.5 Z" />
        <circle cx="32" cy="12.2" r="1.3" fill="rgba(0,0,0,0.25)" />
      </g>,
    );
  if (look.hat === 'helmet')
    parts.push(
      <g key="h">
        <path d="M14 22 C10 15 11 9 14 6 C14 12 17 16 21 18 Z" fill="#f2ead8" />
        <path d="M50 22 C54 15 53 9 50 6 C50 12 47 16 43 18 Z" fill="#f2ead8" />
        <path d="M18.5 26 C18 10 46 10 45.5 26 Z" fill="#9aa3ad" />
        <rect x="17.5" y="23" width="29" height="4" rx="2" fill="#7c858f" />
        <rect x="30.8" y="23" width="2.4" height="11" rx="1" fill="#7c858f" />
      </g>,
    );
  if (look.hat === 'tricorn')
    parts.push(
      <g key="h">
        <path d="M19.5 23 C19 9 45 9 44.5 23 Z" fill={look.hatColor ? 'rgba(0,0,0,0.35)' : '#2b2118'} />
        <path d="M6 23.5 C11 13 20 17.5 32 9.5 C44 17.5 53 13 58 23.5 C51 20.5 41 21.5 32 26.5 C23 21.5 13 20.5 6 23.5 Z" fill={look.hatColor || '#3a2a1e'} stroke={look.hatTrim || '#d9a441'} strokeWidth="1.1" strokeLinejoin="round" />
        <circle cx="32" cy="17.5" r="2.6" fill="#f4efe6" />
        <circle cx="31" cy="17.2" r="0.6" fill="#2b2118" />
        <circle cx="33" cy="17.2" r="0.6" fill="#2b2118" />
        <path d="M29.6 21 L34.4 23.6 M34.4 21 L29.6 23.6" stroke="#f4efe6" strokeWidth="0.9" strokeLinecap="round" />
      </g>,
    );
  if (look.pipe)
    parts.push(
      <g key="pi">
        <path d="M35.5 39.2 C38.5 40.4 41.5 42 43.2 44.2" stroke="#4a2f1f" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        <path d="M41.6 43 h4.2 v3.6 c0 1.4 -4.2 1.4 -4.2 0 Z" fill="#5a3a26" />
        <ellipse cx="43.7" cy="43" rx="2.1" ry="0.8" fill="#ff5a1f" />
        <circle cx="43.7" cy="42.6" r="0.6" fill="#ffd166" />
      </g>,
    );
  if (look.crow)
    parts.push(
      <g key="cr">
        {/* body and folded wing */}
        <path d="M46.5 49 C47.5 42.5 53 40 57.5 42 C61 43.8 62 48.5 60.5 52 C58 55.5 51 56 47.5 54 Z" fill="#101114" />
        <path d="M49.5 47.5 C52.5 45 57 45 60 47.5 C58 50.5 53.5 52 50 51 Z" fill="#26292f" />
        <path d="M59.5 51.5 L64 57 L58 54.5 Z" fill="#101114" />
        {/* head, big beak, eye */}
        <circle cx="53.5" cy="37" r="4.6" fill="#101114" />
        <path d="M49.6 35.4 L42.8 38.6 L49.8 39.6 Z" fill="#4b4f57" />
        <path d="M49.6 37.6 L43.6 38.6" stroke="#101114" strokeWidth="0.4" />
        <circle cx="52.4" cy="36" r="1.1" fill="#d0d4da" />
        <circle cx="52.2" cy="36" r="0.5" fill="#101114" />
        {/* feet on the shoulder */}
        <path d="M51 55.5 L50 58 M54 55.8 L54 58.4" stroke="#6b6f76" strokeWidth="0.8" strokeLinecap="round" />
      </g>,
    );
  if (look.hat === 'headband') parts.push(<rect key="h" x="19" y="20.5" width="26" height="4.2" rx="2" fill={hc} />);
  return <>{parts}</>;
}

export const AVATARS: Array<{ id: string; label: string; look: Look }> = [
  { id: 'pirate', label: 'Пират', look: { bg: '#cfe3f3', skin: SKIN.tan, shirt: '#2f3b4c', hair: HAIR.black, beard: 'braided', hat: 'tricorn', patch: true, earring: true } },
  { id: 'captain', label: 'Капитан с вороной', look: { bg: '#2b2d31', skin: '#c9a689', shirt: '#2c3440', hair: '#c9ccd1', back: 'shaggy', beard: 'full', hat: 'tricorn', hatColor: '#26272b', hatTrim: '#a7adb5', patch: 'skull', angry: true, teeth: true, pipe: true, crow: true } },
  { id: 'bald-beard', label: 'Лысый, русая борода', look: { bg: '#e8dccb', skin: SKIN.fair, shirt: '#3d5a40', hair: HAIR.brown, beard: 'full', smile: true } },
  { id: 'blonde', label: 'Блондинка', look: { bg: '#f6dbe3', skin: SKIN.light, shirt: '#c2577a', hair: HAIR.blonde, back: 'long', top: 'side', smile: true, lashes: true } },
  { id: 'brunette', label: 'Брюнетка', look: { bg: '#e7dff3', skin: SKIN.fair, shirt: '#5a4a8a', hair: HAIR.black, back: 'long', top: 'bangs', lashes: true } },
  { id: 'receding', label: 'С залысинами', look: { bg: '#dfe9df', skin: SKIN.fair, shirt: '#55606e', hair: HAIR.brown, top: 'receding', beard: 'stubble' } },
  { id: 'glasses', label: 'В очках', look: { bg: '#dbe7f1', skin: SKIN.light, shirt: '#3a6ea5', hair: HAIR.brown, top: 'side', glasses: 'round', smile: true } },
  { id: 'redhead', label: 'Рыжая', look: { bg: '#fbe3cf', skin: SKIN.light, shirt: '#2e7d6b', hair: HAIR.red, back: 'bob', top: 'bangs', smile: true, lashes: true } },
  { id: 'grandpa', label: 'Седой с усами', look: { bg: '#ece7df', skin: SKIN.fair, shirt: '#8a6d4a', hair: HAIR.white, top: 'receding', beard: 'mustache', beardColor: HAIR.white, glasses: 'square' } },
  { id: 'bun', label: 'С пучком', look: { bg: '#e2f0ea', skin: SKIN.tan, shirt: '#e07a5f', hair: HAIR.brown, top: 'bun', smile: true, lashes: true, earring: true } },
  { id: 'hipster', label: 'Хипстер в шапке', look: { bg: '#f3e6d4', skin: SKIN.light, shirt: '#264653', hair: HAIR.brown, beard: 'full', hat: 'beanie', hatColor: '#e76f51' } },
  { id: 'afro', label: 'Афро', look: { bg: '#f6e7c8', skin: SKIN.dark, shirt: '#f4a261', hair: HAIR.black, back: 'afro', smile: true } },
  { id: 'cap', label: 'В кепке', look: { bg: '#d9ecf2', skin: SKIN.tan, shirt: '#457b9d', hair: HAIR.black, hat: 'cap', hatColor: '#1d3557', beard: 'goatee' } },
  { id: 'viking', label: 'Викинг', look: { bg: '#dde3ea', skin: SKIN.light, shirt: '#6b4f3a', hair: HAIR.red, back: 'longMale', beard: 'viking', hat: 'helmet' } },
  { id: 'sporty', label: 'С повязкой', look: { bg: '#fde2e4', skin: SKIN.brown, shirt: '#d62828', hair: HAIR.black, back: 'pigtails', top: 'short', hat: 'headband', hatColor: '#ffb703', smile: true, lashes: true } },
  { id: 'bob-glasses', label: 'Каре и очки', look: { bg: '#eae4f6', skin: SKIN.light, shirt: '#6d597a', hair: HAIR.black, back: 'bob', top: 'bangs', glasses: 'square', lashes: true } },
  { id: 'mustache', label: 'С усами', look: { bg: '#f1e3d3', skin: SKIN.tan, shirt: '#9c6644', hair: HAIR.black, top: 'short', beard: 'mustache', smile: true } },
  { id: 'curly', label: 'Кудрявый', look: { bg: '#e0efe0', skin: SKIN.fair, shirt: '#588157', hair: HAIR.brown, top: 'curly', smile: true } },
  { id: 'rocker', label: 'Рокер', look: { bg: '#e4e4e4', skin: SKIN.light, shirt: '#111111', hair: HAIR.blonde, back: 'longMale', top: 'side', glasses: 'sun', beard: 'goatee', beardColor: '#b89443' } },
  { id: 'bald-black', label: 'Лысый, чёрная борода', look: { bg: '#dcdcdc', skin: SKIN.tan, shirt: '#1d3557', hair: HAIR.black, beard: 'full' } },
  { id: 'bald-blond', label: 'Лысый, светлая борода', look: { bg: '#e9f1f7', skin: SKIN.light, shirt: '#6c757d', hair: '#d8b25a', beard: 'full', smile: true } },
  { id: 'bald-red', label: 'Лысый, рыжая борода', look: { bg: '#f7e4d6', skin: SKIN.light, shirt: '#2d6a4f', hair: HAIR.red, beard: 'full' } },
  { id: 'hair-beard-dark', label: 'Тёмный с бородой', look: { bg: '#e6e1da', skin: SKIN.fair, shirt: '#3a5a78', hair: HAIR.black, top: 'side', beard: 'full' } },
  { id: 'hair-beard-light', label: 'Светлый с бородой', look: { bg: '#e3eef6', skin: SKIN.light, shirt: '#8d6e63', hair: '#d8b25a', top: 'short', beard: 'full', smile: true } },
  { id: 'receding-beard-dark', label: 'Залысины, тёмная борода', look: { bg: '#e2e8df', skin: SKIN.fair, shirt: '#495057', hair: HAIR.black, top: 'receding', beard: 'full' } },
  { id: 'receding-beard-light', label: 'Залысины, светлая борода', look: { bg: '#f3ecdf', skin: SKIN.light, shirt: '#5e548e', hair: '#d8b25a', top: 'receding', beard: 'full', smile: true } },
  { id: 'short-blonde', label: 'Короткая, светлая', look: { bg: '#fdf0d5', skin: SKIN.light, shirt: '#e56b6f', hair: HAIR.blonde, top: 'pixie', smile: true, lashes: true, earring: true, lips: true } },
  { id: 'short-dark', label: 'Короткая, тёмная', look: { bg: '#e8e0f0', skin: SKIN.fair, shirt: '#355070', hair: HAIR.black, top: 'pixie', smile: true, lashes: true, earring: true, lips: true } },
  { id: 'asym-glasses-dark', label: 'Асимметрия и очки, тёмная', look: { bg: '#dfe7ee', skin: SKIN.fair, shirt: '#22333b', hair: HAIR.black, top: 'asym', glasses: 'round', lashes: true, earring: true, lips: true } },
  { id: 'asym-glasses-light', label: 'Асимметрия и очки, светлая', look: { bg: '#f6e6ee', skin: SKIN.light, shirt: '#9a8c98', hair: HAIR.blonde, top: 'asym', glasses: 'square', smile: true, lashes: true, earring: true, lips: true } },
  { id: 'sweep-glasses', label: 'Короткая с чёлкой набок, очки без оправы', look: { bg: '#dfe9d0', skin: SKIN.tan, shirt: '#1d1d1f', collar: '#8a9aa6', hair: HAIR.black, top: 'sweep', glasses: 'rimless', earring: 'stud', teeth: true, lips: true, lashes: true } },
  { id: 'buzz-beard', label: 'Короткий ёжик, залысины, тёмная борода', look: { bg: '#ecebe7', skin: SKIN.fair, shirt: '#3b3f45', hair: '#4a3426', top: 'buzz', beard: 'full', eyes: '#6d8794' } },
  { id: 'spiky', label: 'Ёжик', look: { bg: '#fff1c9', skin: SKIN.fair, shirt: '#0096c7', hair: HAIR.blonde, top: 'spiky', smile: true } },
];

const byId = new Map(AVATARS.map((a) => [a.id, a]));
export const isAvatar = (id?: string | null) => !!id && byId.has(id);

export function AvatarArt({ id, size = 38 }: { id: string; size?: number }) {
  // A clip id of its own: the same picture in a hidden screen must not take the shape from there.
  const clip = 'av' + useId().replace(/:/g, '');
  const a = byId.get(id);
  if (!a) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={a.label}>
      <defs>
        <clipPath id={clip}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <Face look={a.look} />
      </g>
    </svg>
  );
}
