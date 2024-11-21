import { elementGenerator } from './elementGenerator.mjs';

export const registerComponent = async (path) => {
    const name = path.split('/').join('-');

    if (customElements.get(name)) {
        return;
    }

    const localpath = `./components/${path}`;
    const res = await fetch(`${localpath}/${name}.html`);
    const textTemplate = await res.text();
  
    // Parse and select the template tag here instead 
    // of adding it using innerHTML to avoid repeated parsing
    // and searching whenever a new instance of the component is added.
    const HTMLTemplate = new DOMParser()
      .parseFromString(textTemplate, 'text/html')
      .querySelector('template');

    const { default: ImportedComponent } = await import(`.${localpath}/${name}.mjs`);

    console.log(ImportedComponent);
  
    class Component extends ImportedComponent {
        constructor() {
            super();

            this.localpath = localpath
        }
        connectedCallback() {
            const shadowRoot = this.attachShadow({ mode: 'open' });

            // Clone the template and the cloned node to the shadowDOM's root.
            const instance = HTMLTemplate.content.cloneNode(true);
            const stylesheet = elementGenerator({
                tagName: 'link',
                rel: 'stylesheet',
                type: 'text/css',
                scoped: '',
                href: `${localpath}/${name}.css`
            });
            // const styles = document.createElement('link');
            // styles.setAttribute('rel', 'stylesheet');
            // styles.setAttribute('type', 'text/css');
            // styles.setAttribute('scoped', '');
            // styles.setAttribute('href', `${localpath}/${name}.css`);
            instance.insertBefore(stylesheet, instance.firstChild);
            shadowRoot.appendChild(instance);

            super.connectedCallback();
        }
    }
    customElements.define(name, Component);
};