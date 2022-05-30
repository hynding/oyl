const isElement = ([name, attr, children]) => {
    if (!name || typeof name !== 'string' || Array.isArray(name)) {
        return false
    }
    return true
}
// React's pattern
const createElement = (name, attr = null, children = null) => ({
    name, attr, children
})

const render = blueprints => {
    if (isElement(blueprints)) {

    }
}

/*
render(['div',])
*/