import { test1, testFragment } from '@/lib/test.js'
import { route } from '@/lib/route.js'

const homePage = () => [
  'div', { className: 'home', 'data-theme': 'old-school' },
    ['h1', 'Home Page'],
    ['p', 'Welcome to the home page!'],
    ['a', { href: '/a' }, 'Go to Test Page'],
    test1(),
    ...testFragment()  // fragments must be spread
]

export default function App() {
  route([
    ['/', homePage],
    ['/a', test1]
  ])
}
