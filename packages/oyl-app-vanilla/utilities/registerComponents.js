import { registerComponent } from './registerComponent.js'

export const registerComponents = (...paths) => {
    return Promise.all(paths.map(registerComponent))
}