import { useSyncExternalStore } from 'react';

class ModelError extends Error {
	constructor(message) {
		super(message);
		this.name = "ModelError";
		// keep the stack trace from litering the console it doesn't contain useful information and can be expanded regardless
		this.stack = this.stack?.split('\n')[0];
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
export class Model {
	#object; // the object being wrapped
	#proxyObject; // the proxy object to intercept property access
	#initialState; // the initial state of the object
	#debug; // whether to log state changes
	#listeners = {}; // a map of listeners for each property
	#functionMemos = new Map(); // a set of memoized pick functions

	constructor(object, { debug = false } = {}) {
		this.#object = object;
		this.#initialState = JSON.parse(JSON.stringify(object));
		this.#debug = debug;

		// add all properties to the model
		// Object.keys(object).forEach((key) => this.#addProperty(key));

		this.#proxyObject = new Proxy(this.#object, {
			get: (target, prop, receiver) => {
				if (prop in target) {
					return Reflect.get(target, prop, receiver);
				}
				throw new ModelError(`Property '${String(prop)}' does not exist on model`);
			},
			set: (target, prop, value, _receiver) => {
				if (prop in target) {
					target[prop] = value;
					this.#emitChange(String(prop), value);
					return true;
				}
				throw new ModelError(`Property '${String(prop)}' does not exist on model`);
			}
		});

		// initialize listeners for each property
		Object.keys(this.#object).forEach((key) => {
			this.#listeners[key] = new Set();
		});

		// freeze this object to prevent changes to this object that may produce side effects
		Object.freeze(this);

	}

	/**
	 * Returns the proxy object for the model
	 * @returns {object} - the proxy object
	 */
	get() {
		return this.#proxyObject;
	}

	/**
	 * React hook that watches for model property changes to the specified keys and triggers rerender when any change occurs
	 * If used without an array it rerenders on all model property changes.
	 * used with an array, it only triggers a render for the properties specified.
	 * @param {array} keys - an array of model keys to watch
	 * @returns {object} - the model instance
	 */
	watch(keys) {
		if (!Array.isArray(keys)) throw new ModelError('Watch requires an array of model keys');

		// sync each key
		keys.forEach((key) => this.#sync(key));

		return this.#proxyObject;
	}

	/**
	 * React hook that watches all model properties and triggers rerender when any change occurs
	 * You generally want to avoid this as it will rerender on any change to the model
	 * @returns {object} - the model instance
	 */
	watchAll() {
		// sync each key
		Object.keys(this.#listeners).forEach((key) => this.#sync(key));

		return this.#proxyObject;
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
	 * Subscribes to changes for the specified key
	 * @param {string} key - the property key
	 * @param {function} listener - the listener function
	 * @returns {function} - a function to unsubscribe
	 * */
	subscribe(key, listener) {
		if (!this.#listeners.hasOwnProperty(key)) throw new ModelError(`'${key}' does not exist in the model`);

		this.#listeners[key].add(listener);

		// return a function to unsubscribe
		return () => this.#listeners[key].delete(listener);
	}

	/**
	 * Emits a change event for the specified key
	 * @param {string} key - the property key
	 * @param {any} value - the new value
	 * @returns {void}
	 * */
	#emitChange(key, value) {
		if (this.#debug) console.log(`State Change: ${key}`, value);
		this.#listeners[key].forEach((listener) => listener());
	}

	/**
	 * Syncs the specified key with react using the useSyncExternalStore hook
	 * @param {string} key - the property key
	 * @returns {void}
	 * */
	#sync(key) {
		if (!this.#listeners.hasOwnProperty(key)) throw new ModelError(`'${key}' does not exist in the model`);
		if (typeof this[key] === 'function') return;
		useSyncExternalStore((listener) => this.subscribe(key, listener), () => this.#proxyObject[key], () => this.#initialState[key]); // eslint-disable-line
	}

	/**
	 * Performs a single pick from the model
	 * @param {string|function} pick - key or callback function
	 * @returns {any}
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
			set: (_target, _prop, _value, _receiver) => {
				return false;
			}
		});

		// execute the callback to determine dependencies
		try {
			callback(proxy);
		} catch (e) {
			throw new Error('Failed to determine dependencies of a function \n\t' + callback + '\n' + e.message);
		}

		if (this.#debug) console.log(`Function Dependencies for: ${callback} \n`, keys);

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
	 */
	#pickArray(picks) {
		return picks.map((pick) => this.#pickOne(pick));
	}

	/**
	 * Picks an object from the model
	 * @param {object} picks - an object of keys or functions
	 * @returns {object} - an object of the picks to destructure
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
 * @typedef {((pick: string|function|array|object) => any) & Model} UseModel
 *
 * @param {object} initialObject - the object to wrap
 * @param {object} [options] - options for the model
 * @returns {UseModel} - a callable instance of Model with all model methods and properties
 */
export function createModel(initialObject, options) {
	const model = new Model(initialObject, options);

	/**
	 * We attach the pick function to the model instance as the main callable
	 * @param {Array|undefined} keys
	 */
	function useModel(keys) {
		// for no args return the model instance
		if (keys === undefined) return model.get();
		if (arguments.length > 1) throw new ModelError('useModel only accepts a single argument: an array containing a collection of keys to watch');

		return model.watch(keys);
	}

	/**
	 * This is the main export of the model, which can be used in components
	 * It can be called like a function to get the model instance or watch specific keys
	 * @type {UseModel}
	 **/
	return new Proxy(useModel, {
		apply(target, thisArg, args) {
			return target.apply(thisArg, args);
		},
		get(target, prop, receiver) {
			if (prop in target) return Reflect.get(target, prop, receiver);
			if (prop in model) {
				const value = model[prop];
				return typeof value === 'function' ? value.bind(model) : value;
			}
			return undefined;
		},
	});
}
