import React, { useState, useEffect } from 'react';
import { Instagram, User } from 'lucide-react';

// 12 curated, high-contrast, modern gradient combinations
// Ensures deterministic assignment so the same username has the exact same gradient everywhere
export const AVATAR_GRADIENTS = [
  'from-blue-600 via-indigo-600 to-violet-600 text-white',
  'from-rose-500 via-pink-600 to-purple-600 text-white',
  'from-emerald-600 via-teal-600 to-cyan-700 text-white',
  'from-amber-500 via-orange-600 to-rose-600 text-white',
  'from-purple-600 via-fuchsia-600 to-pink-600 text-white',
  'from-cyan-600 via-blue-600 to-indigo-700 text-white',
  'from-teal-600 via-emerald-600 to-green-600 text-white',
  'from-red-500 via-rose-600 to-pink-600 text-white',
  'from-indigo-600 via-purple-600 to-pink-600 text-white',
  'from-sky-500 via-indigo-500 to-violet-600 text-white',
  'from-orange-500 via-amber-600 to-yellow-600 text-white',
  'from-violet-600 via-purple-700 to-indigo-800 text-white',
];

/**
 * Deterministic hash algorithm to map any username/string to a consistent gradient
 */
export function getDeterministicGradient(seed?: string): string {
  if (!seed) return AVATAR_GRADIENTS[0];
  const clean = seed.trim().toLowerCase().replace(/^@/, '');
  if (!clean) return AVATAR_GRADIENTS[0];
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash << 5) - hash + clean.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index];
}

/**
 * Returns the first meaningful character from a name or username
 */
export function getAvatarInitial(nameOrUsername?: string): string {
  if (!nameOrUsername) return 'U';
  const clean = nameOrUsername.trim().replace(/^@/, '');
  if (!clean) return 'U';
  return clean.charAt(0).toUpperCase();
}

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface UserAvatarProps {
  src?: string | null;
  username?: string;
  name?: string;
  size?: AvatarSize;
  className?: string;
  showInstagramBadge?: boolean;
  isAiPaused?: boolean;
  isOnline?: boolean;
  alt?: string;
  onClick?: () => void;
}

const SIZE_MAP: Record<AvatarSize, { container: string; text: string; badge: string; badgeIcon: string }> = {
  xs: { container: 'w-6 h-6', text: 'text-[10px] font-black', badge: 'w-3 h-3 -bottom-0.5 -right-0.5', badgeIcon: 'w-1.5 h-1.5' },
  sm: { container: 'w-8 h-8', text: 'text-xs font-black', badge: 'w-3.5 h-3.5 -bottom-0.5 -right-0.5', badgeIcon: 'w-2 h-2' },
  md: { container: 'w-9 h-9', text: 'text-xs font-black', badge: 'w-4 h-4 -bottom-0.5 -right-0.5', badgeIcon: 'w-2.5 h-2.5' },
  lg: { container: 'w-12 h-12', text: 'text-sm font-black', badge: 'w-4.5 h-4.5 -bottom-0.5 -right-0.5', badgeIcon: 'w-2.5 h-2.5' },
  xl: { container: 'w-14 h-14', text: 'text-base font-black', badge: 'w-5 h-5 -bottom-1 -right-1', badgeIcon: 'w-3 h-3' },
  '2xl': { container: 'w-16 h-16', text: 'text-xl font-black', badge: 'w-6 h-6 -bottom-1 -right-1', badgeIcon: 'w-3.5 h-3.5' },
};

export const UserAvatar: React.FC<UserAvatarProps> = ({
  src,
  username = '',
  name = '',
  size = 'md',
  className = '',
  showInstagramBadge = false,
  isAiPaused = false,
  isOnline = false,
  alt,
  onClick,
}) => {
  const [imgFailed, setImgFailed] = useState<boolean>(false);
  const displayName = username || name || 'User';
  const sizeConfig = SIZE_MAP[size] || SIZE_MAP.md;

  // Reset failure state when src changes
  useEffect(() => {
    setImgFailed(false);
  }, [src]);

  // Dicebear avatars are generic cartoon placeholders. If user asked for consistent colored avatar fallback,
  // we filter out dicebear cartoon URLs so our sleek colorful typography takes precedence unless a real photo is available.
  const isValidCustomPhoto = Boolean(
    src &&
    typeof src === 'string' &&
    src.trim().length > 0 &&
    !src.includes('api.dicebear.com') &&
    !imgFailed
  );

  return (
    <div
      onClick={onClick}
      className={`relative inline-block shrink-0 select-none ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div
        className={`${sizeConfig.container} rounded-full overflow-hidden flex items-center justify-center border border-slate-200/90 shadow-2xs ${className}`}
      >
        {isValidCustomPhoto ? (
          <img
            src={src!}
            alt={alt || displayName}
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => {
              // Smoothly fallback to the deterministic colorful badge on broken/expired URLs (e.g. 403 from Meta CDN)
              setImgFailed(true);
            }}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400"
            title="Instagram profile photo unavailable"
          >
            <User className={size === '2xl' ? 'h-7 w-7' : size === 'xl' ? 'h-6 w-6' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} />
          </div>
        )}
      </div>

      {/* Instagram Camera Overlay Badge */}
      {showInstagramBadge && (
        <div
          className={`absolute ${sizeConfig.badge} rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center text-white ring-2 ring-white shadow-xs`}
          title="Connected Instagram Account"
        >
          <Instagram className={`${sizeConfig.badgeIcon} stroke-[2.5]`} />
        </div>
      )}

      {/* Human Takeover Active Badge */}
      {isAiPaused && !showInstagramBadge && (
        <div
          className={`absolute ${sizeConfig.badge} rounded-full bg-amber-500 border-2 border-white flex items-center justify-center text-white font-black shadow-xs`}
          title="Human Takeover Active (AI Paused)"
        >
          <User className={`${sizeConfig.badgeIcon} stroke-[2.5]`} />
        </div>
      )}

      {/* Live Online Dot */}
      {isOnline && !showInstagramBadge && !isAiPaused && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-white"></span>
        </span>
      )}
    </div>
  );
};
