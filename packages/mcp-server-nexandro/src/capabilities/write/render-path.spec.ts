import { renderPath } from './render-path.js';

describe('renderPath', () => {
  it('substitutes a single param', () => {
    expect(renderPath('/recipes/:id', { id: 'abc' })).toBe('/recipes/abc');
  });

  it('substitutes multiple params', () => {
    expect(
      renderPath('/recipes/:id/lines/:lineId/source', {
        id: 'r-1',
        lineId: 'l-2',
      }),
    ).toBe('/recipes/r-1/lines/l-2/source');
  });

  it('leaves a parameterless template untouched', () => {
    expect(renderPath('/recipes', {})).toBe('/recipes');
    expect(renderPath('/external-catalog/sync', { extra: 'x' })).toBe(
      '/external-catalog/sync',
    );
  });

  it('URL-encodes unsafe characters in values', () => {
    expect(renderPath('/q/:term', { term: 'a b/c?d' })).toBe(
      '/q/a%20b%2Fc%3Fd',
    );
  });

  it('throws when a required param is missing', () => {
    expect(() => renderPath('/recipes/:id', {})).toThrow(
      /missing param "id".*\/recipes\/:id/,
    );
  });
});
