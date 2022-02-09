class ObjectCache {
    static cache = {};
    static setCache = (key, obj, overwrite=false) => {
        if (overwrite) {
            ObjectCache[key] = obj;
            return;
        }
        if (!Object.prototype.hasOwnProperty.call(ObjectCache.cache, key)) {
            ObjectCache.cache[key] = {};
        }
        Object.assign(ObjectCache.cache[key], obj);
    }
    static readCache = (key) => {
        if (Object.prototype.hasOwnProperty.call(ObjectCache.cache, key)) {
            return ObjectCache.cache[key];
        }
        return {};
    }
}

module.exports = ObjectCache;