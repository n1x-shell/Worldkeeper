/** The icon for each realm icon key (shared/realms.ts REALM_ICONS). Plain TypeScript, so the sidebar's tests can use it. */
import { Castle, Compass, Crown, Flame, Ghost, Globe2, Moon, Mountain, Skull, Snowflake, Sparkles, Sun, Trees, Waves, type LucideIcon } from 'lucide-react';
import type { RealmIcon } from '../../../shared/realms';

export const REALM_ICON_COMPONENTS: Record<RealmIcon, LucideIcon> = {
  globe: Globe2,
  mountain: Mountain,
  flame: Flame,
  ghost: Ghost,
  trees: Trees,
  waves: Waves,
  castle: Castle,
  sun: Sun,
  moon: Moon,
  snowflake: Snowflake,
  sparkles: Sparkles,
  compass: Compass,
  skull: Skull,
  crown: Crown,
};
