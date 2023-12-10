import { useSyncExternalStore } from 'react';

class Model {
	#object;
	#debug;
	#listeners;

	constructor(object, { debug = false } = {}) {
		this.#object = object;
		this.#debug = debug;
		this.#listeners = {};

		Object.keys(object).forEach((key) => this.#addProperty(key));
		Object.freeze(this); // prevent changes to this object
	}

	#addProperty(key) {
		// functions are simply bound to the model
		if (typeof this.#object[key] === 'function') return this[key] = this.#object[key].bind(this);

		// properties need to be watched for changes and have accessors bound
		this.#listeners[key] = new Set();

		Object.defineProperty(this, key, {
			get: () => this.#object[key],
			set: (value) => {
				this.#object[key] = value;
				this.#emitChange(key, value);
			}
		});
	}

	#emitChange(key, value) {
		if (this.#debug) console.log(`State Change: ${key}`, value);
		this.#listeners[key].forEach((listener) => listener());
	}

	#subscribe(key, listener) {
		this.#listeners[key].add(listener);
		return () => this.#listeners[key].delete(listener);
	}

	#sync(key) {
		if (this[key] === undefined) throw new Error(`Invalid Key: ${key}. Key does not exist in the model`);
		useSyncExternalStore((listener) => this.#subscribe(key, listener), () => this[key]); // eslint-disable-line
	}

	/**
	 * Watches for model property changes to the specified keys and triggers rerender when any change occurs
	 * If no keys are provided, watches all properties
	 * @param {array} keys - an array of model keys to watch
	 * @returns {Model} - the model instance
	 */
	watch(keys) {
		if (!(keys === undefined || Array.isArray(keys))) throw new Error('Watch requires an array of model keys');
		keys = keys ?? Object.keys(this.#listeners);

		keys.forEach((key) => this.#sync(key));

		return this;
	}

	/**
	 * lets you pick elements of the model or register functions executed against the model
	 * watches all dependencies and triggers rerender when any change
	 * you can pass a string denoting the property, a function, or a collection (array/object) of strings and functions
	 * Collections will be returned in the same format as the collection passed in
	 *
	 * @example
	 * model.pick('key') // returns the value of `key` and watches for changes to `key`
	 * model.pick((m) => m.key) // returns the value of `key` and watches for changes to `key`
	 * model.pick(['key1', 'key2']) // returns [key1, key2] and watches for changes to `key1` and `key2`
	 * model.pick({ key1: 'key1', key2: (m) => m.key2 }) // returns { key1: key1, key2: key2 } and watches for changes to `key1` and `key2`
	 *
	 * @param {string|function|array|object} arg
	 * @returns {any}
	 */
	pick(arg) {
		switch (typeof arg) {
			case 'string':
			case 'function':
				return this.#pickItem(arg);

			case 'object':
				if (Array.isArray(arg)) return this.#pickArray(arg);
				return this.#pickObject(arg);

			default:
				throw new Error('Pick requires a model key string, function, or array/object containing a collection of keys and functions');
		}
	}

	#pickItem(item) {
		switch (typeof item) {
			case 'string':
				return this.#pickString(item);

			case 'function':
				return this.#pickFunction(item);

			default:
				throw new Error('Pick requires a model key string or function');
		}
	}

	#pickString(key) {
		//only sync if not a function
		if (typeof this.#object[key] === 'function') return this.#object[key].bind(this);
		this.#sync(key);
		return this[key];
	}

	#pickFunction(callback) {

		// clone our object to track property access
		const testObject = {...this};

		// proxy to intercept property access and record the keys
		const keys = [];
		const proxy = new Proxy(testObject, {
			get: (target, prop, receiver) => {
				keys.push(prop);
				return Reflect.get(target, prop, receiver);
			},
		});

		// execute the callback to determine dependencies
		try {
			callback(proxy);
		} catch (e) {
			throw new Error('Failed to determine dependencies of a function \n\t' + callback + '\n' + e.message);
		}

		// sync all dependencies
		keys.forEach((key) => this.#sync(key));

		// return the callback with the model bound
		return callback(this);
	}

	#pickArray(items) {
		return items.map((item) => this.#pickItem(item));
	}

	#pickObject(items) {
		let exports = {};
		for (let key in items) {
			exports[key] = this.#pickItem(items[key]);
		}

		return exports;
	}

}

export function createModel(initialObject, options) {
	const model = new Model(initialObject, options);
	return () => model;
}
