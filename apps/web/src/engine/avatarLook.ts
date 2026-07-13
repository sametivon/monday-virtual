import { Color, Mesh, MeshStandardMaterial, type Object3D } from 'three';

/**
 * The KayKit character GLBs are modular: besides the always-on body parts,
 * each file carries optional attachment meshes (headgear, cape, weapons,
 * shields…) that ship visible-by-default. The avatar customizer works by
 * toggling those nodes, so this module is the single source of truth for
 * which nodes are gear, how they group into slots, and what the default
 * loadout per character is. `AvatarConfig.parts` stores the equipped node
 * names; `undefined` means "default loadout" (pre-customizer configs).
 */

export interface GearSlots {
  headgear: string[];
  cape: string[];
  mainHand: string[];
  offHand: string[];
}

const KNIGHT: GearSlots = {
  headgear: ['Knight_Helmet'],
  cape: ['Knight_Cape'],
  mainHand: ['1H_Sword', '2H_Sword'],
  offHand: ['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield'],
};

const ROGUE: GearSlots = {
  headgear: [],
  cape: ['Rogue_Cape'],
  mainHand: ['Knife', '1H_Crossbow', '2H_Crossbow', 'Throwable'],
  offHand: ['Knife_Offhand'],
};

export const GEAR_SLOTS: Record<string, GearSlots> = {
  default: KNIGHT,
  knight: KNIGHT,
  mage: {
    headgear: ['Mage_Hat'],
    cape: ['Mage_Cape'],
    mainHand: ['1H_Wand', '2H_Staff'],
    offHand: ['Spellbook', 'Spellbook_open'],
  },
  rogue: ROGUE,
  rogue_hooded: ROGUE,
  barbarian: {
    headgear: ['Barbarian_Hat'],
    cape: ['Barbarian_Cape'],
    mainHand: ['1H_Axe', '2H_Axe', 'Mug'],
    offHand: ['1H_Axe_Offhand', 'Barbarian_Round_Shield'],
  },
};

export const PART_LABELS: Record<string, string> = {
  Knight_Helmet: 'Helmet',
  Mage_Hat: 'Wizard hat',
  Barbarian_Hat: 'Bear hat',
  Knight_Cape: 'Cape',
  Mage_Cape: 'Cape',
  Rogue_Cape: 'Cape',
  Barbarian_Cape: 'Cape',
  '1H_Sword': 'Sword',
  '2H_Sword': 'Greatsword',
  '1H_Sword_Offhand': 'Second sword',
  Badge_Shield: 'Badge shield',
  Rectangle_Shield: 'Kite shield',
  Round_Shield: 'Round shield',
  Spike_Shield: 'Spiked shield',
  '1H_Wand': 'Wand',
  '2H_Staff': 'Staff',
  Spellbook: 'Spellbook',
  Spellbook_open: 'Open spellbook',
  Knife: 'Dagger',
  '1H_Crossbow': 'Crossbow',
  '2H_Crossbow': 'Heavy crossbow',
  Throwable: 'Bomb',
  Knife_Offhand: 'Second dagger',
  '1H_Axe': 'Axe',
  '2H_Axe': 'Greataxe',
  Mug: 'Mug of ale',
  '1H_Axe_Offhand': 'Second axe',
  Barbarian_Round_Shield: 'Round shield',
};

/**
 * Default loadouts are deliberately weapon-free: this is a workplace, not a
 * dungeon (swords in the office were the single biggest "game asset" tell).
 * Users with `parts: undefined` get these; anyone who explicitly equipped
 * gear in the picker keeps their choice — nothing is removed from the picker.
 */
const DEFAULT_PARTS: Record<string, string[]> = {
  knight: ['Knight_Cape'],
  mage: ['Mage_Hat', 'Mage_Cape'],
  rogue: ['Rogue_Cape'],
  rogue_hooded: ['Rogue_Cape'],
  barbarian: ['Barbarian_Cape'],
};

export function slotsFor(modelId: string): GearSlots {
  return GEAR_SLOTS[modelId] ?? KNIGHT;
}

export function defaultPartsFor(modelId: string): string[] {
  return DEFAULT_PARTS[modelId === 'default' ? 'knight' : modelId] ?? DEFAULT_PARTS.knight!;
}

/**
 * Show exactly the equipped attachments and tint the cape with the accent
 * color. Capes get a cloned, untextured material so the accent reads as a
 * clean flat color (multiply-tinting the atlas texture just looks muddy);
 * flat color fits the low-poly art style. Body parts are never touched.
 */
export function applyAvatarLook(
  root: Object3D,
  modelId: string,
  parts: string[] | undefined,
  color?: string,
): void {
  const slots = slotsFor(modelId);
  const gear = new Set([...slots.headgear, ...slots.cape, ...slots.mainHand, ...slots.offHand]);
  const equipped = new Set(parts ?? defaultPartsFor(modelId));
  const capes = new Set(slots.cape);

  root.traverse((node) => {
    if (!gear.has(node.name)) return;
    node.visible = equipped.has(node.name);
    if (!node.visible || !capes.has(node.name) || !color) return;
    node.traverse((child) => {
      if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
        // Clone per avatar — useGLTF shares materials across all clones.
        const mat = child.material.clone();
        mat.map = null;
        mat.color = new Color(color);
        child.material = mat;
      }
    });
  });
}
