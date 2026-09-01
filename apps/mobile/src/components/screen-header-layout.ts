export function shouldCondenseScreenHeader(options: {
  hasBack: boolean;
  hasRight: boolean;
  width: number;
}) {
  if (!options.hasRight) return false;
  return options.hasBack ? options.width < 420 : options.width < 360;
}
