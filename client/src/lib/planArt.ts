/**
 * The pictures behind the painted style of plans (v0.9.29): six small grounds, cut from Poly Haven's textures, which
 * are in the public domain (CC0). They are loaded only when a plan is first shown painted, and go into the drawing
 * itself, so that a saved picture needs nothing else.
 */
import type { PlanArt } from '@shared/plan/index';
import stone from '../assets/plan/stone.jpg?inline';
import earth from '../assets/plan/earth.jpg?inline';
import rock from '../assets/plan/rock.jpg?inline';
import wood from '../assets/plan/wood.jpg?inline';
import grass from '../assets/plan/grass.jpg?inline';
import dirt from '../assets/plan/dirt.jpg?inline';

export const PLAN_ART: PlanArt = { stone, earth, rock, wood, grass, dirt };
