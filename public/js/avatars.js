/**
 * Avatar Generator and Renderer for MIR RPG
 */
const AvatarIcons = {
  wizard: `
    <svg viewBox="0 0 100 100" class="avatar-svg">
      <defs>
        <radialGradient id="wizGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="#3b0764" stop-opacity="1"/>
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#wizGlow)" />
      <!-- Hood -->
      <path d="M50 14 C32 14 26 36 24 58 C34 52 42 50 50 50 C58 50 66 52 76 58 C74 36 68 14 50 14 Z" fill="#2e1065"/>
      <!-- Shadow face -->
      <path d="M32 50 C32 68 40 76 50 76 C60 76 68 68 68 50 C58 48 42 48 32 50 Z" fill="#0f0728"/>
      <!-- Glowing Eyes -->
      <ellipse cx="42" cy="56" rx="4" ry="2.5" fill="#a855f7" />
      <ellipse cx="58" cy="56" rx="4" ry="2.5" fill="#a855f7" />
      <circle cx="42" cy="56" r="1.5" fill="#ffffff" />
      <circle cx="58" cy="56" r="1.5" fill="#ffffff" />
      <!-- Beard/Rune -->
      <path d="M44 68 L50 82 L56 68 Z" fill="#9333ea" opacity="0.6"/>
      <!-- Magic Star -->
      <path d="M50 20 L52 26 L58 28 L52 30 L50 36 L48 30 L42 28 L48 26 Z" fill="#c084fc"/>
    </svg>`,

  dragon: `
    <svg viewBox="0 0 100 100" class="avatar-svg">
      <defs>
        <radialGradient id="dragGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ef4444" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="#450a0a" stop-opacity="1"/>
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#dragGlow)" />
      <!-- Horns -->
      <path d="M30 38 C22 24 16 12 28 8 C34 16 38 28 40 36 Z" fill="#1c1917"/>
      <path d="M70 38 C78 24 84 12 72 8 C66 16 62 28 60 36 Z" fill="#1c1917"/>
      <!-- Snout -->
      <path d="M36 34 L50 24 L64 34 L72 64 L50 86 L28 64 Z" fill="#991b1b"/>
      <path d="M40 48 L50 40 L60 48 L50 78 Z" fill="#7f1d1d"/>
      <!-- Reptile Eyes -->
      <polygon points="34,44 44,48 36,52" fill="#fbbf24"/>
      <polygon points="66,44 56,48 64,52" fill="#fbbf24"/>
      <line x1="39" y1="44" x2="39" y2="52" stroke="#451a03" stroke-width="2"/>
      <line x1="61" y1="44" x2="61" y2="52" stroke="#451a03" stroke-width="2"/>
      <!-- Nostrils / Fire -->
      <circle cx="46" cy="68" r="2" fill="#450a0a"/>
      <circle cx="54" cy="68" r="2" fill="#450a0a"/>
      <path d="M46 72 Q50 82 54 72" stroke="#f59e0b" stroke-width="2" fill="none"/>
    </svg>`,

  knight: `
    <svg viewBox="0 0 100 100" class="avatar-svg">
      <defs>
        <radialGradient id="kniGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#64748b" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="#0f172a" stop-opacity="1"/>
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#kniGlow)" />
      <!-- Plume -->
      <path d="M48 8 C54 8 68 12 72 26 C64 22 56 22 48 24 Z" fill="#3b82f6"/>
      <!-- Helmet -->
      <path d="M28 36 C28 20 72 20 72 36 L74 68 C74 80 50 88 50 88 C50 88 26 80 26 68 Z" fill="#334155"/>
      <!-- Visor -->
      <path d="M30 44 L70 44 L66 60 L50 64 L34 60 Z" fill="#1e293b"/>
      <!-- Visor Slit -->
      <rect x="36" y="49" width="28" height="4" rx="2" fill="#38bdf8"/>
      <!-- Rivets -->
      <circle cx="34" cy="38" r="2" fill="#94a3b8"/>
      <circle cx="66" cy="38" r="2" fill="#94a3b8"/>
      <line x1="50" y1="24" x2="50" y2="44" stroke="#475569" stroke-width="2.5"/>
    </svg>`,

  rogue: `
    <svg viewBox="0 0 100 100" class="avatar-svg">
      <defs>
        <radialGradient id="rogGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#10b981" stop-opacity="0.5"/>
          <stop offset="100%" stop-color="#022c22" stop-opacity="1"/>
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#rogGlow)" />
      <!-- Mask & Cowl -->
      <path d="M50 16 C30 16 22 36 22 64 C36 78 64 78 78 64 C78 36 70 16 50 16 Z" fill="#064e3b"/>
      <path d="M28 46 C36 44 44 44 50 48 C56 44 64 44 72 46 C74 64 68 76 50 82 C32 76 26 64 28 46 Z" fill="#022c22"/>
      <!-- Eyes slit -->
      <ellipse cx="40" cy="48" rx="5" ry="2.5" fill="#34d399"/>
      <ellipse cx="60" cy="48" rx="5" ry="2.5" fill="#34d399"/>
      <circle cx="40" cy="48" r="1.5" fill="#ffffff"/>
      <circle cx="60" cy="48" r="1.5" fill="#ffffff"/>
      <!-- Dagger icon on mask -->
      <polygon points="50,60 52,68 50,72 48,68" fill="#10b981"/>
    </svg>`,

  sorceress: `
    <svg viewBox="0 0 100 100" class="avatar-svg">
      <defs>
        <radialGradient id="sorcGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ec4899" stop-opacity="0.7"/>
          <stop offset="100%" stop-color="#500724" stop-opacity="1"/>
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#sorcGlow)" />
      <!-- Tiara / Crown -->
      <path d="M30 36 L50 20 L70 36 L62 44 L50 38 L38 44 Z" fill="#f43f5e"/>
      <circle cx="50" cy="28" r="3" fill="#fef08a"/>
      <!-- Hair -->
      <path d="M26 40 C22 66 26 84 32 88 C38 74 38 52 38 46 Z" fill="#831843"/>
      <path d="M74 40 C78 66 74 84 68 88 C62 74 62 52 62 46 Z" fill="#831843"/>
      <!-- Face -->
      <path d="M36 42 C36 64 42 74 50 74 C58 74 64 64 64 42 Z" fill="#fbcfe8"/>
      <!-- Eyes -->
      <circle cx="44" cy="52" r="3" fill="#be185d"/>
      <circle cx="56" cy="52" r="3" fill="#be185d"/>
      <circle cx="45" cy="51" r="1" fill="#fff"/>
      <circle cx="57" cy="51" r="1" fill="#fff"/>
      <!-- Lips -->
      <path d="M47 64 Q50 67 53 64" stroke="#9d174d" stroke-width="2" fill="none"/>
    </svg>`,

  paladin: `
    <svg viewBox="0 0 100 100" class="avatar-svg">
      <defs>
        <radialGradient id="palGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#eab308" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="#422006" stop-opacity="1"/>
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#palGlow)" />
      <!-- Halo -->
      <circle cx="50" cy="24" r="16" fill="none" stroke="#fde047" stroke-width="3" stroke-dasharray="4,2"/>
      <!-- Golden Helm -->
      <path d="M30 34 C30 24 70 24 70 34 L72 66 C72 78 50 86 50 86 C50 86 28 78 28 66 Z" fill="#ca8a04"/>
      <!-- Sun crest -->
      <circle cx="50" cy="42" r="6" fill="#fef08a"/>
      <!-- Cross visor -->
      <path d="M47 52 L53 52 L53 74 L47 74 Z" fill="#713f12"/>
      <path d="M36 58 L64 58 L64 64 L36 64 Z" fill="#713f12"/>
      <circle cx="50" cy="61" r="2.5" fill="#ffffff"/>
    </svg>`,

  cyber_samurai: `
    <svg viewBox="0 0 100 100" class="avatar-svg">
      <defs>
        <radialGradient id="cybGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="#083344" stop-opacity="1"/>
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#cybGlow)" />
      <!-- Kabuto Crest -->
      <polygon points="50,12 56,26 44,26" fill="#22d3ee"/>
      <path d="M26 34 C26 22 74 22 74 34 L70 48 L30 48 Z" fill="#0f172a"/>
      <!-- Oni Cyber Mask -->
      <path d="M30 48 L70 48 L66 80 L50 88 L34 80 Z" fill="#1e293b"/>
      <!-- Glowing Neon Visor -->
      <polygon points="34,54 66,54 62,62 38,62" fill="#06b6d4"/>
      <!-- Cyber Teeth / Grid -->
      <line x1="42" y1="72" x2="42" y2="78" stroke="#22d3ee" stroke-width="2"/>
      <line x1="50" y1="72" x2="50" y2="78" stroke="#22d3ee" stroke-width="2"/>
      <line x1="58" y1="72" x2="58" y2="78" stroke="#22d3ee" stroke-width="2"/>
    </svg>`,

  elf: `
    <svg viewBox="0 0 100 100" class="avatar-svg">
      <defs>
        <radialGradient id="elfGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#14b8a6" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="#042f2e" stop-opacity="1"/>
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#elfGlow)" />
      <!-- Pointy Ears -->
      <polygon points="20,44 32,36 34,54" fill="#fcd34d"/>
      <polygon points="80,44 68,36 66,54" fill="#fcd34d"/>
      <!-- Silver Hair -->
      <path d="M30 26 C38 18 62 18 70 26 C76 42 72 70 68 84 C62 60 62 38 50 36 C38 38 38 60 32 84 C28 70 24 42 30 26 Z" fill="#e2e8f0"/>
      <!-- Face -->
      <path d="M36 40 C36 62 44 72 50 72 C56 72 64 62 64 40 Z" fill="#fef3c7"/>
      <!-- Emerald Eyes -->
      <ellipse cx="43" cy="50" rx="3.5" ry="2.5" fill="#059669"/>
      <ellipse cx="57" cy="50" rx="3.5" ry="2.5" fill="#059669"/>
      <circle cx="44" cy="49" r="1" fill="#fff"/>
      <circle cx="58" cy="49" r="1" fill="#fff"/>
      <!-- Circlet -->
      <path d="M34 34 Q50 38 66 34" stroke="#10b981" stroke-width="2.5" fill="none"/>
      <polygon points="50,32 53,37 50,40 47,37" fill="#34d399"/>
    </svg>`,

  necro: `
    <svg viewBox="0 0 100 100" class="avatar-svg">
      <defs>
        <radialGradient id="necGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#84cc16" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="#14532d" stop-opacity="1"/>
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#necGlow)" />
      <!-- Dark Cowl -->
      <path d="M50 14 C30 14 20 34 20 62 C34 78 66 78 80 62 C80 34 70 14 50 14 Z" fill="#18181b"/>
      <!-- Skull Face -->
      <path d="M34 44 C34 34 66 34 66 44 C66 56 62 68 58 72 L42 72 C38 68 34 56 34 44 Z" fill="#e4e4e7"/>
      <!-- Dark Eye Sockets with Green Flame -->
      <ellipse cx="42" cy="48" rx="5" ry="6" fill="#09090b"/>
      <ellipse cx="58" cy="48" rx="5" ry="6" fill="#09090b"/>
      <circle cx="42" cy="48" r="2.5" fill="#a3e635"/>
      <circle cx="58" cy="48" r="2.5" fill="#a3e635"/>
      <!-- Teeth -->
      <rect x="42" y="62" width="4" height="6" fill="#09090b"/>
      <rect x="48" y="62" width="4" height="6" fill="#09090b"/>
      <rect x="54" y="62" width="4" height="6" fill="#09090b"/>
    </svg>`,

  dwarf: `
    <svg viewBox="0 0 100 100" class="avatar-svg">
      <defs>
        <radialGradient id="dwfGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#d97706" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="#451a03" stop-opacity="1"/>
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#dwfGlow)" />
      <!-- Iron Helmet with Horns -->
      <path d="M30 36 C30 22 70 22 70 36 L72 46 L28 46 Z" fill="#52525b"/>
      <polygon points="26,38 18,30 28,26" fill="#a1a1aa"/>
      <polygon points="74,38 82,30 72,26" fill="#a1a1aa"/>
      <!-- Face -->
      <circle cx="50" cy="48" r="16" fill="#fcd34d"/>
      <circle cx="44" cy="44" r="2.5" fill="#27272a"/>
      <circle cx="56" cy="44" r="2.5" fill="#27272a"/>
      <ellipse cx="50" cy="50" rx="5" ry="4" fill="#f59e0b"/>
      <!-- Magnificent Braided Beard -->
      <path d="M28 52 C28 82 40 92 50 92 C60 92 72 82 72 52 C64 56 36 56 28 52 Z" fill="#b45309"/>
      <line x1="44" y1="58" x2="44" y2="86" stroke="#92400e" stroke-width="2.5"/>
      <line x1="56" y1="58" x2="56" y2="86" stroke="#92400e" stroke-width="2.5"/>
      <!-- Beard Ring -->
      <rect x="46" y="82" width="8" height="4" fill="#fbbf24"/>
    </svg>`,

  hunter: `
    <svg viewBox="0 0 100 100" class="avatar-svg">
      <defs>
        <radialGradient id="huntGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#65a30d" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="#1e3a1e" stop-opacity="1"/>
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#huntGlow)" />
      <!-- Feather & Hat -->
      <path d="M60 10 Q74 14 78 28 Q66 22 56 20 Z" fill="#dc2626"/>
      <path d="M24 38 C32 20 68 20 76 38 L84 46 L16 46 Z" fill="#365314"/>
      <!-- Face & Scarf -->
      <circle cx="50" cy="50" r="16" fill="#fed7aa"/>
      <circle cx="43" cy="46" r="2.5" fill="#1c1917"/>
      <circle cx="57" cy="46" r="2.5" fill="#1c1917"/>
      <path d="M26 56 C34 50 66 50 74 56 L70 82 C56 88 44 88 30 82 Z" fill="#4d7c0f"/>
    </svg>`,

  artificer: `
    <svg viewBox="0 0 100 100" class="avatar-svg">
      <defs>
        <radialGradient id="artGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#0284c7" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="#082f49" stop-opacity="1"/>
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#artGlow)" />
      <!-- Leather Cap -->
      <path d="M28 36 C28 20 72 20 72 36 L74 52 L26 52 Z" fill="#78350f"/>
      <!-- Steampunk Goggles -->
      <circle cx="38" cy="44" r="10" fill="#d97706" stroke="#b45309" stroke-width="2"/>
      <circle cx="62" cy="44" r="10" fill="#d97706" stroke="#b45309" stroke-width="2"/>
      <circle cx="38" cy="44" r="7" fill="#38bdf8"/>
      <circle cx="62" cy="44" r="7" fill="#38bdf8"/>
      <circle cx="36" cy="42" r="2.5" fill="#ffffff"/>
      <circle cx="60" cy="42" r="2.5" fill="#ffffff"/>
      <line x1="48" y1="44" x2="52" y2="44" stroke="#78350f" stroke-width="4"/>
      <!-- Smirk & Gear -->
      <circle cx="50" cy="74" r="8" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="3,2"/>
    </svg>`
};

function renderAvatar(avatarIdOrUrl, frameType = 'standard', size = 48) {
  const isPreset = AvatarIcons[avatarIdOrUrl];
  let innerHtml = '';
  
  if (isPreset) {
    innerHtml = AvatarIcons[avatarIdOrUrl];
  } else if (avatarIdOrUrl && (avatarIdOrUrl.startsWith('http') || avatarIdOrUrl.startsWith('data:image'))) {
    innerHtml = `<img src="${avatarIdOrUrl}" alt="Avatar" class="avatar-img" />`;
  } else {
    innerHtml = AvatarIcons['wizard'];
  }

  const frameClass = `frame-${frameType || 'standard'}`;
  return `
    <div class="user-avatar-wrapper ${frameClass}" style="width: ${size}px; height: ${size}px;">
      ${innerHtml}
    </div>
  `;
}

window.AvatarIcons = AvatarIcons;
window.renderAvatar = renderAvatar;
