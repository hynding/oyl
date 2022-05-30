export const clone = (object = {}, deep = true) => deep
    ? JSON.parse(JSON.stringify)
    : { ...object }

export const createLayout = () => ({
    
});

export const fetchService = () => ({

})
