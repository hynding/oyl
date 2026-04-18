function renderNode(node) {
  const [elementName, options, ...children] = node
  const element = document.createElement(elementName)
  const optionsType = Array.isArray(options) ? 'array' : typeof options

  switch (optionsType) {
    case 'string':
      const textNode = document.createTextNode(options)
      element.appendChild(textNode)
      return element
    case 'array':
      element.append(...render(options))
      return element
    case 'object':
      for (const [key, value] of Object.entries(options || {})) {
        const attrName = key === 'className' ? 'class' : key
        element.setAttribute(attrName, value)
      }
      break
    default:
      break
  }

  children.forEach(child => {
    if (Array.isArray(child)) {
      element.append(...render(child))
    } else if (typeof child === 'string') {
      const textNode = document.createTextNode(child)
      element.appendChild(textNode)
    }
  })

  return element
}

export default function render(nodes = []) {
  if (!Array.isArray(nodes)) {
    throw new Error('Input must be an array of nodes')
  }
  if (nodes.length === 0) {
    return null
  }
  if (!Array.isArray(nodes[0])) {
    console.log('Rendering single node:', nodes)
    return [nodes].map(renderNode)
  }

  return nodes.map(renderNode)
}