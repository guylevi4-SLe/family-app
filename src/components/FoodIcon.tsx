import { DRAWN } from '../data/foodIcons';

/** A product's quick-add picture: an emoji, or one drawn for the app. */
export function FoodIcon({ value }: { value: string }) {
  const drawn = DRAWN[value];
  // The drawings are the app's own fixed markup, never anything a user typed.
  if (drawn) return <span className="food-svg" aria-hidden="true" dangerouslySetInnerHTML={{ __html: drawn.svg }} />;
  return <>{value}</>;
}
