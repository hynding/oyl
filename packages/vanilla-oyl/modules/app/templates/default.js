export default function DefaultTemplate({ children }) {
  return [
    'div', { data: { theme: 'old-school' } },
      ['slot'],
  ]
}
