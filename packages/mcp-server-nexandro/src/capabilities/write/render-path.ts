/**
 * Substitutes `:param` tokens in a path template with the supplied values,
 * URL-encoding each value. Throws when a token has no matching param.
 *
 * Examples:
 *   renderPath('/recipes/:id', { id: 'abc' })           → '/recipes/abc'
 *   renderPath('/users/:id/locations/:locationId', { id: 'u', locationId: 'l' })
 *                                                       → '/users/u/locations/l'
 *   renderPath('/recipes', {})                          → '/recipes'
 *   renderPath('/recipes/:id', {})                      → throws
 *
 * Helper for the WRITE_CAPABILITIES registry — keeps each capability's
 * descriptor declarative (no string concatenation per entry).
 */
export function renderPath(
  template: string,
  params: Record<string, string>,
): string {
  return template.replace(/:(\w+)/g, (_match, key: string) => {
    const value = params[key];
    if (value === undefined) {
      throw new Error(
        `renderPath: missing param "${key}" for template "${template}"`,
      );
    }
    return encodeURIComponent(value);
  });
}
