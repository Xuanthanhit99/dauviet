/** References to source-exact sprites. Consumers provide their asset hosting base URL. */
const semantic = new Set(['place', 'people', 'event', 'culture', 'time', 'source', 'story', 'journey', 'verified', 'warning']);
const micro = new Set(['culture', 'source', 'story', 'journey']);
const approvedAt16 = new Set(['place', 'verified', 'warning']);

export function getIconReference(name, size = 24) {
  if (name === 'citation') {
    if (![20, 24, 32].includes(size)) throw new RangeError('Citation supports 20, 24, 32px; 16px NOT_SUPPORTED.');
    return Object.freeze({ file: 'trust/dvg-trust-citation-v1.0.svg', size });
  }
  if (!semantic.has(name)) {
    throw new RangeError(`No supplied canonical icon for ${name}; retain its explicit text label. Do not substitute another semantic glyph.`);
  }
  if (![16, 20, 24, 32].includes(size)) throw new RangeError('Canonical icon sizes: 16, 20, 24, 32.');
  if (size === 16 && !micro.has(name) && !approvedAt16.has(name)) {
    throw new RangeError(`The ${name} 16px micro asset is missing. Use 20px or larger.`);
  }
  const useMicro = size === 16 && micro.has(name);
  return Object.freeze({
    sprite: useMicro ? 'micro.svg' : 'semantic.svg',
    symbolId: `dv-icon-${name}${useMicro ? '-micro' : ''}`,
    size,
  });
}
