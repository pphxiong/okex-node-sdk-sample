function isObj(obj) {
	return Object(obj) === obj;
}
function cloneDeep(obj, map = new WeakMap()) {
	if (typeof obj === 'symbol') {
		return Symbol(obj.description);
	}
	if (obj instanceof Set) {
		return new Set([...obj]);
	}
	if (obj instanceof Map) {
		return new Map([...obj]);
	}
	if (typeof obj === 'function') {
		return obj;
	}
	if (!isObj(obj)) {
		return obj;
	}
	if (map.has(obj)) {
		return map.get(obj);
	}
	const newObj = Array.isArray(obj) ? [] : {};
	map.set(obj, newObj);
	for (const k in obj) {
		newObj[k] = cloneDeep(obj[k], map);
	}
	const objSymbolKeys = Object.getOwnPropertySymbols(obj);
	for (const k of objSymbolKeys) {
		newObj[k] = cloneDeep(obj[k], map);
	}
	return newObj;
}

const helper = {
	cloneDeep,
};

export default helper;
