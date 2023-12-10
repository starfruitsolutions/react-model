import { useSyncExternalStore } from 'react';

class Model {
	#object;
	#debug;
	#listeners;

	constructor(initialObject, { debug = false } = {}) {
		this.#object = initialObject;
		this.#debug = debug;
		this.#listeners = {};

		// create state for each property in the object
		for (let key in this.#object) {
			if (typeof this.#object[key] != 'function') { // only properties
				this.#listeners[key] = new Set();
				this.#bindAccessors(key);
				continue;
			}
			this[key] = this.#object[key];
		}
		Object.freeze(this); // prevent changes to this object
	}

	#bindAccessors(key) {
		Object.defineProperty(this, key, {
			get: () => this.#object[key],
			set: (value) => {
				this.#object[key] = value;
				this.#emitChange(key, value);
			}
		});
	}

	watch(keys) {
		if (!(keys === undefined || Array.isArray(keys))) throw new Error('Watch requires an array of model keys');
		keys = keys ?? Object.keys(this.#listeners);
		for (let key of keys) {
			this.#sync(key);
		}
		return this;
	}

	pick(arg) {
		let type = typeof arg;
		if (type === 'object' && Array.isArray(arg)) type = 'array';

		switch (type) {

			case 'boolean':
				if (arg === true) return this.watch();
				return this;

			case 'string':
			case 'function':
				return this.#pickItem(arg);

			case 'array':
				return this.#pickArray(arg);


			case 'object':
				return this.#pickObject(arg);

			default:
				throw new Error('Pick requires a model key string, function, or array/object containing keys and functions');
		}
	}

	#pickItem(item) {
		if (typeof item === 'function') return this.#pickFunction(item);
		if (typeof item === 'string') return this.#pickString(item);
		throw new Error('Pick requires a model key string or function');
	}

	#pickString(key) {
		//only synce if not a function
		if (typeof this.#object[key] === 'function') return this.#object[key].bind(this);
		this.#sync(key);
		return this[key];
	}

	#pickFunction(callback) {
		const keys = [];

		// clone our object to track property access
		const testObject = {...this};

		const proxy = new Proxy(testObject, {
			get: (target, prop, receiver) => {
				keys.push(prop);
				return Reflect.get(target, prop, receiver);
			},
		});

		try {
			callback(proxy);
		} catch (e) {
			throw new Error('Failed to determine dependencies of a function \n\t' + callback + '\n' + e.message);
		}

		for (let key of keys) {
			this.#sync(key);
		}

		return callback(this);
	}

	#pickArray(items) {
		let exports = []
		for (let item of items) {
			exports.push(this.#pickItem(item));
		}

		return exports;
	}

	#pickObject(items) {
		let exports= {};
		for (let key in items) {
			exports[key] = this.#pickItem(items[key]);
		}

		return exports;
	}

	#emitChange(key, value) {
		if (this.debug) console.log(`State Change: ${key}`, value);
		this.#listeners[key].forEach((listener) => {
			listener();
		});
	}

	#subscribe(key, listener) {
		if (!this.#listeners[key] === undefined) throw new Error(`Invalid Key: ${key}. Key does not exist in the model`);
		this.#listeners[key].add(listener);
		return () => {
			this.#listeners[key].delete(listener);
		}
	}

	#sync(key) {
		if (this[key] === undefined) throw new Error(`Invalid Key: ${key}. Key does not exist in the model`);
		useSyncExternalStore((listener) => this.#subscribe(key, listener), () => this[key]); // eslint-disable-line
	}

}

export function createModel(initialObject, options) {
	const model = new Model(initialObject, options);
	return () => {
		return model;
	}
}
