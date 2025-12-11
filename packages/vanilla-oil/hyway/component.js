import { Registry } from "./registry.js"
export const component = (config) => {
    const template = config.template
        ? new DOMParser()
            .parseFromString(`<template>${config.template}</template>`, "text/html")
            .querySelector("template")
        : Registry.lookup(config.name);

    class CustomElement extends HTMLElement {
        constructor() {
            super();
            this.template = template;
            this.attachShadow({ mode: "open" });
            this.shadowRoot.appendChild(this.template.content.cloneNode(true));
            this.data = {
                ...config.data || {},
                ...config.computed || {},
                ...config.methods || {},
            };
            this.methods = config.methods || {};
            this.mounted = config.mounted.bind(this.data) || (() => {});
            this.events = [];
        }

        connectedCallback() {
            console.log("CustomElement connected", config);
            (async () => {
                await this.mounted();
                this.shadowRoot.querySelectorAll("[data-value]").forEach((el) => {
                    const key = el.getAttribute("data-value");
                    if (this.data[key]) {
                        el.value = this.data[key];
                    }
                    const event = (e) => {
                        this.data[key] = e.target.value;
                        this.render();
                    }
                    el.addEventListener("input", event);
                    this.events.push([el, "input", event]);
                })
                this.shadowRoot.querySelectorAll("[data-click]").forEach((el) => {
                    const key = el.getAttribute("data-click");
                    if (this.methods[key]) {
                        const event = (e) => {
                            this.methods[key].bind(this.data)(e);
                            this.render();
                        }
                        el.addEventListener("click", event);
                        this.events.push([el, "click", event]);
                    }
                })
                this.render();
            })();
        }

        disconnectedCallback() {
            console.log("CustomElement disconnected");
            this.events.forEach(([el, event, handler]) => {
                el.removeEventListener(event, handler);
            });
            this.events = [];
        }

        render() {
            Object.entries(this.data).forEach(([key, value]) => {
                this.shadowRoot.querySelectorAll(`[data-bind="${key}"]`).forEach((el) => {
                    if (typeof value === "function") {
                        el.innerHTML = value.bind(this.data)();
                    } else if (typeof value === "object") {
                        el.innerHTML = JSON.stringify(value);
                    } else {
                        el.innerHTML = value;
                    }
                });
            });
        }
    }
    const localName = config.template ? config.name : Registry.getLocalName(config.name);
    customElements.define(localName, CustomElement);
}