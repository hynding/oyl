export const test1 = (value) => [
  'div', { className: 'container' },
    ['h1', 'Hello World'],
    ['p', 'This is a simple component.' + value]
]
export const testFragment = () => [
  ['h2', 'Fragment Title'],
  ['p', 'This is a fragment without a wrapper element.']
]