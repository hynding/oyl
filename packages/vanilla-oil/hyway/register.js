import { Registry } from './registry.js';
export const register = async (path, localName) => {
    const response = await fetch(path);
    if (!response.ok) {
        throw new Error(`Failed to load template: ${response.statusText}`);
    }
    const templateText = await response.text();
    const templateDOM = new DOMParser()
        .parseFromString(templateText, 'text/html')
        .querySelector('template');
    const templateScript = templateDOM.content.querySelector('script');
    const templateContent = templateDOM.content.querySelector('template');

    const name = templateDOM.id || templateContent.id || path.split('/').pop().split('.').shift();

    if (localName) {
        Registry.useLocalName(localName, name)
    }

    Registry.add(name, templateContent);
    document.body.appendChild(templateScript)
}