import render from '@/lib/render.js'

// track navigation event to render the corresponding page
export function route(routes) {
  const routeMap = new Map(routes)

  function navigate(path) {
    const handler = routeMap.get(path)
    if (handler) {
      document.body.innerHTML = ''
      const nodes = handler()
      document.body.append(...render(nodes))
      window.history.pushState({}, '', path)
    } else {
      console.warn(`No route found for path: ${path}`)
    }
  }

  // Handle initial load
  navigate(window.location.pathname)

  // Handle popstate (back/forward buttons)
  window.addEventListener('popstate', () => {
    navigate(window.location.pathname)
  })

  // Handle link clicks
  document.addEventListener('click', (e) => {
    if (e.target.matches(`a[href^="/"]`)) {
      e.preventDefault()
      navigate(e.target.getAttribute('href'))
    }
  })
}