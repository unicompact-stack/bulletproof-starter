const icons = {
  leaf: '<path d="M20 4C9 2 3 7 5 15c8 3 15-2 15-11Z"/><path d="M4 21c2-6 6-10 11-13"/>',
  book: '<path d="M12 5c-3-2-7-2-10-1v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Z"/><path d="M12 5v15"/>',
  star: '<path d="m12 2 3 6.1 6.7 1-4.8 4.7 1.1 6.7-6-3.2-6 3.2 1.1-6.7L2.3 9.1 9 8.1Z"/>',
  sound: '<path d="m11 4-5 4H2v8h4l5 4Z"/><path d="M15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>',
  mute: '<path d="m11 4-5 4H2v8h4l5 4Z"/><path d="m16 9 5 6m0-6-5 6"/>',
  pencil: '<path d="m16 3 5 5L9 20l-6 1 1-6Z"/><path d="m13 6 5 5"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  bulb: '<path d="M8 17c0-3-4-4-4-8a8 8 0 0 1 16 0c0 4-4 5-4 8Z"/><path d="M9 21h6m-3-7V9m-3 0 3 2 3-2"/>',
  replay: '<path d="M3 10a9 9 0 1 1 1 8M3 4v6h6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12m0-12L6 18"/>',
  heart: '<path d="M20 5c-3-3-7-1-8 2-1-3-5-5-8-2-5 5 1 11 8 16 7-5 13-11 8-16Z"/>',
  play: '<path d="m8 4 12 8-12 8Z"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14c2 3 6 3 8 0M8 8h.01M16 8h.01"/>',
};
export function icon(name, className = '') {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.leaf}</svg>`;
}
export function appleSvg(id) {
  return `<svg class="apple-art" viewBox="0 0 84 88" aria-hidden="true">
    <defs><linearGradient id="fruit-${id}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff8a68"/><stop offset=".55" stop-color="#ed614e"/><stop offset="1" stop-color="#cf493e"/></linearGradient></defs>
    <ellipse cx="42" cy="80" rx="23" ry="4" fill="#684d29" opacity=".09"/>
    <path d="M42 27C22 10 5 25 9 47c4 24 17 39 33 31 16 8 29-7 33-31 4-22-13-37-33-20Z" fill="url(#fruit-${id})"/>
    <path d="M40 29q-4-12 1-21" stroke="#795331" stroke-width="5" stroke-linecap="round" fill="none"/>
    <path d="M43 19C44 7 57 1 71 6 68 19 55 26 43 19Z" fill="#53874a"/>
    <path d="m46 18 16-8" stroke="#8caf61" stroke-width="1.5" fill="none"/>
    <path d="M23 33c-5 4-7 10-6 17" fill="none" stroke="#fff0dd" stroke-width="5" stroke-linecap="round" opacity=".66"/>
    <ellipse cx="28" cy="58" rx="6" ry="3" fill="#ffb18b" opacity=".27"/>
  </svg>`;
}

// Original layered SVG. No Gambitik artwork or audio is redistributed here.
export function mascotSvg() {
  return `<svg id="mascot-svg" class="mascot" viewBox="0 0 300 320" role="img" aria-label="Яблочкин — зелёный яблочный друг" data-pose="wave" style="--mouth:0">
    <defs>
      <linearGradient id="hero-green" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#accd65"/><stop offset=".55" stop-color="#8eb94c"/><stop offset="1" stop-color="#6e9c3c"/></linearGradient>
      <linearGradient id="hero-face" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff8da"/><stop offset="1" stop-color="#ffedbc"/></linearGradient>
      <linearGradient id="hero-scarf" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffcb69"/><stop offset="1" stop-color="#ed9c43"/></linearGradient>
    </defs>
    <ellipse class="hero-shadow" cx="150" cy="291" rx="78" ry="10" fill="#496f3e" opacity=".13"/>
    <g class="hero-bounce">
      <g class="hero-feet">
        <path d="M100 249h29l-1 30c-3 13-34 14-38 3-4-9 4-16 10-18Z" fill="#678c36"/>
        <path d="M173 250h28l-1 16c13 6 20 20 6 24-11 4-30 0-32-11Z" fill="#678c36"/>
        <path d="M97 274c10-8 29-4 30 6 2 14-34 17-40 6-3-5 3-10 10-12Z" fill="#f9bf60"/>
        <path d="M177 274c7-7 20-5 30 3 10 9 6 15-7 16-15 0-30-10-23-19Z" fill="#f9bf60"/>
        <path d="M89 288q20 10 37-2m51-1q18 12 33 3" stroke="#d69a44" stroke-width="4" fill="none" stroke-linecap="round"/>
      </g>
      <g class="hero-arm-left">
        <path d="M70 170C47 168 31 146 38 128c3-9 15-8 19 1 6 15 14 15 27 17Z" fill="#84aa46"/>
        <path d="M36 130c-9-4-13-11-8-15 3-3 7 0 10 4-3-13 1-21 6-19 5 2 3 14 6 19 1-10 8-14 12-8 2 4-1 8-5 17 12-3 16 7 7 13-12 9-24 2-28-11Z" fill="url(#hero-face)"/>
        <path d="m40 128 9-4m-7 8 10-4" stroke="#e1cc91" stroke-width="2" stroke-linecap="round"/>
      </g>
      <g class="hero-arm-right">
        <path d="M226 154c26-2 41 17 37 37-3 13-17 20-24 9-4-7 3-13-7-21Z" fill="#749e3c"/>
        <path d="M251 182c14-1 22 8 17 17-4 8-18 12-23 6-6-7-4-19 6-23Z" fill="url(#hero-face)"/>
        <path d="m257 190 6 4m-11 1 7 5" stroke="#e1cc91" stroke-width="2" stroke-linecap="round"/>
      </g>
      <g class="hero-head">
        <path d="M150 76C105 39 45 79 57 157c8 57 30 104 68 106 11 1 17-5 25-5s15 6 27 5c38-2 60-49 67-106 12-78-46-118-94-81Z" fill="url(#hero-green)"/>
        <path d="M76 102c-9 11-13 29-11 43" fill="none" stroke="#d4e7a1" stroke-width="8" stroke-linecap="round" opacity=".8"/>
        <g class="hero-crown">
          <path d="M149 77c-6-19-5-34 5-48" stroke="#795738" stroke-width="10" stroke-linecap="round" fill="none"/>
          <path d="M154 47c4-24 24-35 53-26-4 28-28 39-53 26Z" fill="#35795a"/>
          <path d="m158 46 32-17" stroke="#76ad68" stroke-width="2.5" stroke-linecap="round"/>
        </g>
        <path d="M150 129c-13-18-51-23-64 2-16 31 0 76 28 84 18 6 54 6 73-2 29-12 39-55 22-83-13-21-46-18-59-1Z" fill="url(#hero-face)"/>
        <path class="hero-brow left-brow" d="M101 138q11-9 23-2" stroke="#668b3e" stroke-width="5" stroke-linecap="round" fill="none"/>
        <path class="hero-brow right-brow" d="M177 136q11-7 22 2" stroke="#668b3e" stroke-width="5" stroke-linecap="round" fill="none"/>
        <g class="hero-eyes">
          <ellipse cx="116" cy="160" rx="16" ry="20" fill="white"/>
          <ellipse cx="185" cy="160" rx="16" ry="20" fill="white"/>
          <g class="hero-pupils">
            <ellipse cx="119" cy="162" rx="11" ry="13" fill="#305546"/><ellipse cx="182" cy="162" rx="11" ry="13" fill="#305546"/>
            <circle cx="122" cy="156" r="4.5" fill="white"/><circle cx="185" cy="156" r="4.5" fill="white"/>
            <circle cx="114" cy="167" r="2" fill="#a7cabc"/><circle cx="177" cy="167" r="2" fill="#a7cabc"/>
          </g>
        </g>
        <g class="hero-happy-eyes" stroke="#305546" stroke-width="4" fill="none" stroke-linecap="round"><path d="M102 161q14-17 28 0m41 0q14-17 28 0"/></g>
        <ellipse cx="97" cy="185" rx="13" ry="7" fill="#f3a28a" opacity=".75"/>
        <ellipse cx="204" cy="185" rx="13" ry="7" fill="#f3a28a" opacity=".75"/>
        <circle cx="106" cy="189" r="1.5" fill="#df8f76"/><circle cx="195" cy="189" r="1.5" fill="#df8f76"/>
        <path d="M146 179q5 4 10 0" stroke="#d7b375" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <path class="hero-smile" d="M136 195q14 13 28 0" stroke="#76503e" stroke-width="3.5" stroke-linecap="round" fill="none"/>
        <g class="hero-mouth"><ellipse cx="150" cy="200" rx="13" ry="13" fill="#70463e"/><ellipse cx="150" cy="207" rx="8" ry="4" fill="#ee9990"/><path d="M143 190h14" stroke="#fffbea" stroke-width="3" stroke-linecap="round"/></g>
        <path d="M91 217q58 22 117-1l-3 18q-54 22-110 1Z" fill="url(#hero-scarf)"/>
        <path d="m177 232 11 35 16-5-12-38Z" fill="#efa64a"/>
        <path d="m184 247 14-4m-11 14 14-4" stroke="#ffdb8c" stroke-width="3"/>
        <circle cx="179" cy="230" r="11" fill="#ffd278"/>
        <path d="m121 226 5 1m7 1 5 1" stroke="#ffe5a7" stroke-width="3" stroke-linecap="round"/>
      </g>
    </g>
    <g class="hero-sparkles" fill="#eab34a"><path d="m44 69 3-8 3 8 8 3-8 3-3 8-3-8-8-3Z"/><path d="m252 108 2-6 2 6 6 2-6 2-2 6-2-6-6-2Z"/><circle cx="239" cy="57" r="3"/></g>
  </svg>`;
}

export const gardenSvg = `<svg class="garden-decoration" viewBox="0 0 700 54" preserveAspectRatio="none" aria-hidden="true"><path d="M0 36Q90 14 180 34T360 32T540 34T700 29v25H0Z" fill="#e9edce"/><path d="M0 46q130-19 250-6t250 0 200 1v13H0Z" fill="#dde6be"/><path d="M25 40V21m0 9c-9-1-12-5-10-11 8 0 12 4 10 11Zm0-6c2-8 7-10 13-8-1 7-5 10-13 8ZM672 38V17m0 11c-8-1-11-5-9-10 7 0 10 4 9 10Zm0-5c1-8 6-10 12-8-1 6-5 9-12 8Z" fill="#a1b77b" stroke="#91a96e" stroke-width="1.5"/></svg>`;
