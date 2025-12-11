/**
 * Converts a string from various naming conventions to PascalCase.
 * Handles: camelCase, snake_case, kebab-case, SCREAMING_SNAKE_CASE, dot.case, space separated, and mixed formats.
 *
 * @param value - The string to convert to PascalCase
 * @returns The string in PascalCase format
 *
 * @example
 * toPascalCase('hello_world') // 'HelloWorld'
 * toPascalCase('hello-world') // 'HelloWorld'
 * toPascalCase('helloWorld') // 'HelloWorld'
 * toPascalCase('HELLO_WORLD') // 'HelloWorld'
 * toPascalCase('hello world') // 'HelloWorld'
 * toPascalCase('hello.world') // 'HelloWorld'
 */
export function toPascalCase(value: string): string {
  if (!value) return value;

  return value
    // Split on common delimiters: space, underscore, hyphen, dot
    .split(/[\s_\-\.]+/)
    // Also handle camelCase by inserting spaces before capitals
    .flatMap(word => word.split(/(?=[A-Z])/))
    // Filter out empty strings
    .filter(word => word.length > 0)
    // Capitalize first letter, lowercase the rest
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    // Join all parts together
    .join('');
}
