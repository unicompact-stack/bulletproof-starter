// Голубой кролик — собственная стилизация по мотивам картинки пользователя.
// Полноценная анатомия: уши прикреплены к макушке, руки с кистями и пальцами,
// ноги со ступнями. Каждая часть — отдельная группа для анимаций.
// Рот: в покое улыбка с зубками (.hero-smile), при речи — открытый рот (.hero-mouth).
export function rabbitSvg() {
  return `<svg id="mascot-svg" class="mascot rabbit" viewBox="0 0 300 320" role="img" aria-label="Голубой кролик — друг из лаборатории" data-pose="idle" data-emotion="neutral" style="--mouth:0">
    <defs>
      <linearGradient id="rab-fur" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#a9e3f2"/><stop offset=".55" stop-color="#7cc8de"/><stop offset="1" stop-color="#61b5ce"/></linearGradient>
      <linearGradient id="rab-ear" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#9adcee"/><stop offset="1" stop-color="#6fc0d8"/></linearGradient>
      <linearGradient id="rab-inner" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#d7f2fa"/><stop offset="1" stop-color="#a8dcec"/></linearGradient>
      <radialGradient id="rab-nose" cx=".35" cy=".3" r="1"><stop stop-color="#ff9cc0"/><stop offset="1" stop-color="#ee5f96"/></radialGradient>
      <radialGradient id="rab-halo" cx=".5" cy=".45" r=".6"><stop stop-color="#bfe7f2" stop-opacity=".55"/><stop offset="1" stop-color="#bfe7f2" stop-opacity="0"/></radialGradient>
      <radialGradient id="rab-ground" cx=".5" cy=".5" r=".5"><stop stop-color="#2b6f83" stop-opacity=".28"/><stop offset="1" stop-color="#2b6f83" stop-opacity="0"/></radialGradient>
      <linearGradient id="rab-shade" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#2b6f83" stop-opacity="0"/><stop offset="1" stop-color="#2b6f83" stop-opacity=".16"/></linearGradient>
      <linearGradient id="rab-mouth-in" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#5e241c"/><stop offset="1" stop-color="#8a4a3a"/></linearGradient>
      <radialGradient id="rab-tongue" cx=".5" cy=".3" r="1"><stop stop-color="#f08a72"/><stop offset="1" stop-color="#d95f4b"/></radialGradient>
    </defs>
    <g class="hero-bg" aria-hidden="true">
      <circle cx="150" cy="176" r="112" fill="url(#rab-halo)"/>
      <g class="hero-sparkles" fill="#e9b957">
        <path d="M52 120l3 8 8 3-8 3-3 8-3-8-8-3 8-3Z" opacity=".8"/>
        <path d="M252 96l2.5 7 7 2.5-7 2.5-2.5 7-2.5-7-7-2.5 7-2.5Z" opacity=".7"/>
        <path d="M244 210l2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" opacity=".6"/>
      </g>
      <g stroke="#79b98c" stroke-width="3" stroke-linecap="round" fill="none" opacity=".8">
        <path d="M64 282q2-10 8-12M72 284q0-8 6-10"/>
        <path d="M232 284q-2-10-8-12M224 286q0-8-6-10"/>
      </g>
      <ellipse cx="150" cy="289" rx="74" ry="12" fill="url(#rab-ground)"/>
    </g>
    <g class="hero-bounce">
      <g class="hero-crown">
        <g class="ear-left">
          <path d="M118 102C100 66 98 30 114 16c14-11 26 10 24 84Z" fill="url(#rab-ear)" stroke="#2b6f83" stroke-width="2.5"/>
          <path d="M120 92c-12-30-12-56-3-65 9-7 15 13 14 63Z" fill="url(#rab-inner)"/>
        </g>
        <g class="ear-right">
          <path d="M162 100c-4-72 8-96 26-88 16 8 10 46-8 90Z" fill="url(#rab-ear)" stroke="#2b6f83" stroke-width="2.5"/>
          <path d="M167 92c-3-50 5-70 16-65 10 6 4 34-8 67Z" fill="url(#rab-inner)"/>
        </g>
      </g>
      <g class="hero-arm-left">
        <rect x="46" y="176" width="36" height="20" rx="10" transform="rotate(-12 82 186)" fill="url(#rab-fur)" stroke="#2b6f83" stroke-width="2.5"/>
        <circle cx="48" cy="190" r="12" fill="url(#rab-fur)" stroke="#2b6f83" stroke-width="2.5"/>
        <path d="M39 187q4 4 9 3M39 194q4 3 9 2" fill="none" stroke="#2b6f83" stroke-width="2" stroke-linecap="round"/>
      </g>
      <g class="hero-arm-right">
        <rect x="218" y="176" width="36" height="20" rx="10" transform="rotate(12 218 186)" fill="url(#rab-fur)" stroke="#2b6f83" stroke-width="2.5"/>
        <circle cx="252" cy="190" r="12" fill="url(#rab-fur)" stroke="#2b6f83" stroke-width="2.5"/>
        <path d="M261 187q-4 4-9 3M261 194q-4 3-9 2" fill="none" stroke="#2b6f83" stroke-width="2" stroke-linecap="round"/>
      </g>
      <g class="hero-leg-left">
        <rect x="120" y="242" width="17" height="28" rx="8" fill="url(#rab-fur)" stroke="#2b6f83" stroke-width="2.5"/>
        <ellipse cx="112" cy="274" rx="26" ry="11" fill="url(#rab-fur)" stroke="#2b6f83" stroke-width="2.5"/>
      </g>
      <g class="hero-leg-right">
        <rect x="163" y="242" width="17" height="28" rx="8" fill="url(#rab-fur)" stroke="#2b6f83" stroke-width="2.5"/>
        <ellipse cx="188" cy="274" rx="26" ry="11" fill="url(#rab-fur)" stroke="#2b6f83" stroke-width="2.5"/>
      </g>
      <circle cx="150" cy="178" r="84" fill="url(#rab-fur)" stroke="#2b6f83" stroke-width="2.5"/>
      <circle cx="150" cy="178" r="83" fill="url(#rab-shade)"/>
      <path d="M84 130c9-22 28-37 50-42" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" opacity=".4"/>
      <g class="hero-eyes">
        <g class="eye-left">
          <ellipse cx="127" cy="164" rx="25" ry="29" fill="white" stroke="#2b6f83" stroke-width="2.5"/>
          <ellipse cx="136" cy="169" rx="9" ry="12" fill="#101418"/>
          <circle cx="133" cy="164" r="2.6" fill="white"/>
        </g>
        <g class="eye-right">
          <ellipse cx="171" cy="167" rx="25" ry="29" fill="white" stroke="#2b6f83" stroke-width="2.5"/>
          <ellipse cx="162" cy="170" rx="9" ry="12" fill="#101418"/>
          <circle cx="159" cy="165" r="2.6" fill="white"/>
        </g>
      </g>
      <g class="hero-happy-eyes" stroke="#101418" stroke-width="5" fill="none" stroke-linecap="round">
        <path d="M112 166q14-16 28 0m18 1q14-16 28 0"/>
      </g>
      <path class="tear" d="M116 196q-7 11 0 15 8 4 11-3 2-7-11-12Z" fill="#7ec8e8" stroke="#2b6f83" stroke-width="1.5" opacity="0"/>
      <g fill="#3a3f9e">
        <path class="brow-left" d="M103 135q14-13 30-6 1 5-4 5-12-4-22 5-4-1-4-4Z"/>
        <path class="brow-right" d="M159 138q14-12 30-6 1 5-4 5-12-4-22 5-4-1-4-4Z"/>
      </g>
      <ellipse cx="149" cy="206" rx="10" ry="3.5" fill="#2b6f83" opacity=".14"/>
      <circle cx="149" cy="194" r="13" fill="url(#rab-nose)" stroke="#2b6f83" stroke-width="2.5"/>
      <circle cx="145" cy="189" r="3.6" fill="white" opacity=".7"/>
      <ellipse cx="152" cy="236" rx="20" ry="5" fill="#2b6f83" opacity=".1"/>
      <g class="hero-smile">
        <path d="M149 207v7" stroke="#2b6f83" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <path d="M117 211q16 15 35 11 18-4 26-16" fill="none" stroke="#275b6b" stroke-width="3" stroke-linecap="round"/>
        <g fill="white" stroke="#2b6f83" stroke-width="2">
          <rect x="139" y="215" width="11" height="17" rx="5"/>
          <rect x="152" y="216" width="11" height="15" rx="5"/>
        </g>
      </g>
      <g class="hero-mouth">
        <path d="M130 210q22 8 44 0 2 20-12 28-10 5-20 0-14-8-12-28Z" fill="url(#rab-mouth-in)" stroke="#2b6f83" stroke-width="2.5"/>
        <path d="M133 213q19 7 38 0" fill="none" stroke="#3f1712" stroke-width="3" opacity=".45"/>
        <g fill="white" stroke="#2b6f83" stroke-width="2">
          <rect x="141" y="211" width="9" height="10" rx="4"/>
          <rect x="152" y="211" width="9" height="9" rx="4"/>
        </g>
        <ellipse cx="152" cy="232" rx="11" ry="6" fill="url(#rab-tongue)"/>
      </g>
      <path class="sad-mouth" d="M131 228q20-14 40-2" fill="none" stroke="#275b6b" stroke-width="3" stroke-linecap="round" opacity="0"/>
      <ellipse class="surprise-mouth" cx="152" cy="222" rx="8" ry="10" fill="#7a3b33" stroke="#2b6f83" stroke-width="2.5" opacity="0"/>
      <path class="tongue-out" d="M146 222q4 16 13 15 9-1 7-15Z" fill="#e2705c" stroke="#2b6f83" stroke-width="2" opacity="0"/>
    </g>
  </svg>`;
}
