import type { ClassicResource, GameSettings, Resource } from './types';

/** What the five standard resources are called in Christmas Candy rooms. */
export const CANDY_NAMES: Record<ClassicResource, string> = {
  wood: 'Candy Cane',
  brick: 'Twizzler',
  sheep: 'Cotton',
  wheat: 'Gum Drop',
  ore: 'Kiss',
};

/** A resource as the room's log names it: its candy name in Christmas Candy rooms, else its id. */
export function logName(settings: Pick<GameSettings, 'christmasCandy'>, resource: Resource): string {
  return settings.christmasCandy ? (CANDY_NAMES[resource as ClassicResource] ?? resource) : resource;
}
