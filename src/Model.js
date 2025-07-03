import { useSyncExternalStore } from 'react';

class ModelError extends Error {
	constructor(message) {
		super(message);
		this.name = "ModelError";
		// keep the stack trace from litering the console it doesn't contain useful information and can be expanded regardless
		this.stack = this.stack.split('\n')[0];
	}
}



/**
 * Wraps a standard javascript object in a reactive model and exposes hooks for react
 * The model can be used in multiple components with no props or context wrapper
 * @class Model
 * @param {object} object - the object to wrap
 * @param {object} options - options for the model
 * @param {boolean} options.debug - whether to log state changes
 * @private
 * */
class Model {
	#object; // the object being wrapped
	#proxyObject; // the proxy object to intercept property access
	#initialState; // the initial state of the object
	#debug; // whether to log state changes
	#listeners = {}; // a map of listeners for each property
	#functionMemos = new Map(); // a set of memoized pick functions

	constructor(object, { debug = false } = {}) {
		this.#object = object;
		this.#proxyObject = {};
		this.#initialState = JSON.parse(JSON.stringify(object));
		this.#debug = debug;

		// add all properties to the model
		Object.keys(object).forEach((key) => this.#addProperty(key));

		// freeze this object to prevent changes to this object that may produce side effects
		Object.freeze(this);

	}

	/**
	 * Returns the proxy object for the model
	 * @returns {object} - the proxy object
	 */
	getProxyObject() {
		return this.#proxyObject;
	}

	/**
	 * Adds a property to the model
	 * @param {string} key - the property key
	 * @returns {void}
	 * @private
	 **/
	#addProperty(key) {
		// functions are simply bound to the proxy object
		if (typeof this.#object[key] === 'function') return this.#proxyObject[key] = this.#object[key].bind(this.#proxyObject);

		// properties need to be watched for changes and have accessors bound
		this.#listeners[key] = new Set();

		// define a getter and setter for the property that emits a change event
		Object.defineProperty(this.#proxyObject, key, {
			get: () => this.#object[key],
			set: (value) => {
				this.#object[key] = value;
				this.#emitChange(key, value);
			}
		});
	}

	/**
	 * Emits a change event for the specified key
	 * @param {string} key - the property key
	 * @param {any} value - the new value
	 * @returns {void}
	 * @private
	 * */
	#emitChange(key, value) {
		if (this.#debug) console.log(`State Change: ${key}`, value);
		this.#listeners[key].forEach((listener) => listener());
	}

	/**
	 * Subscribes to changes for the specified key
	 * @param {string} key - the property key
	 * @param {function} listener - the listener function
	 * @returns {function} - a function to unsubscribe
	 * @private
	 * */
	subscribe(key, listener) {
		if (!this.#listeners.hasOwnProperty(key)) throw new ModelError(`'${key}' does not exist in the model`);

		this.#listeners[key].add(listener);

		// return a function to unsubscribe
		return () => this.#listeners[key].delete(listener);
	}

	/**
	 * Syncs the specified key with react using the useSyncExternalStore hook
	 * @param {string} key - the property key
	 * @returns {void}
	 * @private
	 * */
	#sync(key) {
		if (!this.#listeners.hasOwnProperty(key)) throw new ModelError(`'${key}' does not exist in the model`);
		if (typeof this[key] === 'function') return;
		useSyncExternalStore((listener) => this.subscribe(key, listener), () => this.#proxyObject[key], () => this.#initialState[key]); // eslint-disable-line
	}

	/**
	 * React hook that watches for model property changes to the specified keys and triggers rerender when any change occurs
	 * If used without an array it rerenders on all model property changes.
	 * used with an array, it only triggers a render for the properties specified.
	 * @param {array} keys - an array of model keys to watch
	 * @returns {Model} - the model instance
	 */
	watch(keys) {
		// validate keys
		if (!(keys === undefined || Array.isArray(keys))) throw new ModelError('Watch requires an array of model keys');

		// if no keys are provided, watch all properties
		keys = keys ?? Object.keys(this.#listeners);

		// sync each key
		keys.forEach((key) => this.#sync(key));

		return this;
	}

	/**
	 * React hook that lets you pick elements of the model or register functions executed against the model
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
				return this.#pickOne(arg);

			case 'object':
				if (Array.isArray(arg)) return this.#pickArray(arg);
				return this.#pickObject(arg);

			default:
				throw new ModelError('Pick requires a model key string, function, or array/object containing a collection of keys and functions');
		}
	}

	/**
	 * Performs a single pick from the model
	 * @param {string|function} pick - key or callback function
	 * @returns {any}
	 * @private
	 */
	#pickOne(pick) {
		switch (typeof pick) {
			case 'string':
				return this.#pickKey(pick);

			case 'function':
				return this.#pickFunction(pick);

			default:
				throw new ModelError('Pick requires a model key string or function');
		}
	}

	/**
	 * Picks a single key from the model
	 * @param {string} key - the property key
	 * @returns {any}
	 * @private
	 */
	#pickKey(key) {
		//only sync if not a function
		if (typeof this.#proxyObject[key] === 'function') return this.#proxyObject[key].bind(this.#proxyObject);
		this.#sync(key);
		return this.#proxyObject[key];
	}

	/**
	 * Picks a function from the model and syncs all dependencies
	 * @param {function} callback - the callback function
	 * @returns {any}
	 * @private
	 */
	#pickFunction(callback) {
		// if the function has already been memoized, sync all dependencies and return the callback
		if (this.#functionMemos.has(callback.toString())) {
			this.#functionMemos.get(callback.toString()).forEach((key) => this.#sync(key));
			return callback(this.#proxyObject);
		}

		// clone our object to track property access
		const testObject = this.#object;

		// proxy to intercept property access and record the keys
		const keys = [];
		const proxy = new Proxy(testObject, {
			get: (target, prop, receiver) => {
				if (!testObject.hasOwnProperty(prop)) throw new ModelError(`'${prop}' does not exist in the model`);
				if (typeof testObject[prop] === 'function') return function () { };// return an empty function to prevent side effects
				keys.push(prop);
				return Reflect.get(target, prop, receiver);
			},
			set: (target, prop, value, receiver) => {
				return;
			}
		});

		// execute the callback to determine dependencies
		try {
			callback(proxy);
		} catch (e) {
			throw new Error('Failed to determine dependencies of a function \n\t' + callback + '\n' + e.message);
		}

		if (this.#debug) console.log(`Function Dependencies: ${callback}`, keys);

		// memoize the function
		this.#functionMemos.set(callback.toString(), keys);

		// sync all dependencies
		keys.forEach((key) => this.#sync(key));

		// return the callback with the proxy bound
		return callback(this.#proxyObject);
	}

	/**
	 * An array collection of picks from the model
	 * @param {array} picks - an array of keys or functions
	 * @returns {array} - an array of the picks to destructure
	 * @private
	 */
	#pickArray(picks) {
		return picks.map((pick) => this.#pickOne(pick));
	}

	/**
	 * Picks an object from the model
	 * @param {object} picks - an object of keys or functions
	 * @returns {object} - an object of the picks to destructure
	 * @private
	 */
	#pickObject(picks) {
		let exports = {};
		for (let key in picks) {
			exports[key] = this.#pickOne(picks[key]);
		}

		return exports;
	}

}

/**
 * Model Factory function
 *
 * Just wrap a standard javascript object in `createModel`,
 * and you're good to go. All of the properties become reactive
 * state automatically, and you get back a custom hook to use.
 * This can be used in multiple components with no props or
 * context wrapper. It can be exported and used by components
 * anywhere, with no need to pass any around anything else.
 * Update it from anywhere and it will rerender dependent components.
 * You can also keep it in its own file and update it directly, outside
 * of any react component.
 * @param {object} initialObject - the object to wrap
 * @param {object} options - options for the model
 * @returns {function} - a function used as a hook with attached methods for alternative behavior
 */
export function createModel(initialObject, options) {
	const model = new Model(initialObject, options);

	/**
	 * useModel
	 *
	 * lets you pick elements of the model or register functions executed against the model
	 * Triggers a rerender when a change to a dependency occurs
	 * You can pass a string denoting the property, a function, or a collection (array/object) of strings and functions
	 * Collections will be returned in the same format as the collection passed in
	 *
	 * @example
	 * {useModel}('key') // returns the value of `key` and watches for changes to `key`
	 * {useModel}((m) => m.key) // returns the value of `key` and watches for changes to `key`
	 * {useModel}(['key1', 'key2']) // returns [key1, key2] and watches for changes to `key1` and `key2`
	 * {useModel}({ key1: 'key1', key2: (m) => m.key2 }) // returns { key1: key1, key2: key2 } and watches for changes to `key1` and `key2`
	 *
	 * {useModel}.get() // returns the proxy object of the model for use outside of react components
	 * {useModel}.watch() // returns the reactive model watches all properties and triggers a rerender on any change
	 *
	 * @param {string|function|array|object} arg
	 * @returns {any}
	 */
	function methods(args) {
		if (arguments.length > 1) throw new ModelError('Too many arguments provided to useModel. Did you wrap your collection?');
		if (args === undefined) throw new ModelError('useModel requires a model key string, function, or array/object containing a collection of keys and functions');
		return model.pick(args);
	}

	methods.get = () => model.getProxyObject();
	methods.watch = (keys) => model.watch(keys);

	return methods;

}
