import fs from 'fs'

const doesNotExist = path => !fs.existsSync(path)
const createDirectory = path => fs.mkdirSync(path)
const createFile = (path, text) => fs.writeFileSync(path, text)

const GIVEN_PATH = process.argsv[2]
const COMPONENT_PATH = `./components/${GIVEN_PATH}`

if (doesNotExist(COMPONENT_PATH)) {
    process.exit(1)
}

const LAYOUT_PATH = `${COMPONENT_PATH}/Layout`

if (doesNotExist(LAYOUT_PATH)) {
    createDirectory(LAYOUT_PATH)
}

const PROVIDER_PATH = `${LAYOUT_PATH}/Provider`

if (doesNotExist(PROVIDER_PATH)) {
    createDirectory(PROVIDER_PATH)
}
