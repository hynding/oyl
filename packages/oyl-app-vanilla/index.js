import { registerComponents } from './utilities/registerComponents.js'

const OYL_LS_DATA_KEY = 'oyl-data'
const OYL_WINDOW_DATA_KEY = 'OYL_DATA'

let token = ''

function init() {
    if (window && !window[OYL_WINDOW_DATA_KEY]) {
        const savedData = localStorage.getItem(OYL_LS_DATA_KEY)
        if (savedData) {
            window[OYL_WINDOW_DATA_KEY] = JSON.parse(savedData)
        }
    }
}

(async () => {
    await registerComponents('user/card')

    init()
})()