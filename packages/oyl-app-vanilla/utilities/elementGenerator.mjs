export const elementGenerator = (properties) => {
    const { tagName = 'div', children, ...attributes } = properties;
    const element = document.createElement(tagName)
    Object.entries(attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
    });
    if (children) {
        children.forEach(child => {
            const childElement = elementFactory(child);
            element.appendChild(childElement);
        });
    }
    return element;
}