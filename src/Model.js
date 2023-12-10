import { useSyncExternalStore } from 'react';

class Model {
	constructor(initialObject, { debug = false } = {}) {
		this.object = initialObject;
		this.debug = debug;
		this.state = {};

		// create state for each property in the object
		for (let key in this.object) {
			if (typeof this.object[key] != 'function') { // only properties
				this.state[key] = {};
				this.state[key].value = this.object[key];
				this.state[key].listeners = new Set();
				this.bindAccessors(key);
				continue;
			}
			this.object[key] = this.object[key].bind(this.object);
		}

		this.addHelpers()

		Object.freeze(this.object); // prevent changes to the object
	}

	bindAccessors(key) {
		Object.defineProperty(this.object, key, {
			get: () => this.state[key].value,
			set: (value) => {
				this.state[key].value = value;
				this.emitChange(key, value);
			}
		});
	}

	/**
	 * adds helper methods to the object
	 */
	addHelpers() {
		this.object.watch = (keys) => {
			if (!(keys === undefined || Array.isArray(keys))) throw new Error('Watch requires an array of model keys');
			keys = keys ?? Object.keys(this.state);
			for (let key of keys) {
				this.sync(key);
			}
			return this.object;
		}
		this.object.pick = (pick) => {
			let type = typeof pick;
			if (type === 'object' && Array.isArray(pick)) type = 'array';

			switch (type) {

				case 'boolean':
					if (pick === true) return this.object.watch();
					return this.object;

				case 'string':
					if (typeof this.object[pick] != 'function') this.sync(pick);
					return this.object[pick];

				case 'function':
					for (let key of this.determineDependencies(pick)) {
						this.sync(key);
					}
					return pick(this.object);

				case 'array':
					let exportArray = []
					for (let item of pick) {
						if (typeof item === 'function') {
							for (let key of this.determineDependencies(item)) {
								this.sync(key);
							}
							exportArray.push(item(this.object));
							continue;
						}
						if (typeof this.object[item] != 'function') this.sync(item);
						exportArray.push(this.object[item]);
					}

					return exportArray;

				case 'object':
					let exportObject = {};
					for (let key in pick) {
						if (typeof pick[key] === 'function') {
							for (let dependency of this.determineDependencies(pick[key])) {
								this.sync(dependency);
							}
							exportObject[key] = pick[key](this.object);
							continue;
						}
						if (typeof this.object[pick[key]] != 'function') this.sync(pick[key]);
						exportObject[key] = this.object[pick[key]];
					}

					return exportObject;

				default:
					throw new Error('Pick requires a model key string, function, or array/object containing keys and functions');
			}
		};
	}

	emitChange(key, value) {
		if (this.debug) console.log(`State Change: ${key}`, value);
		this.state[key].listeners.forEach((listener) => {
			listener();
		});
	}

	subscribe(key, listener) {
		if (!this.state[key] === undefined) throw new Error(`Invalid Key: ${key}. Key does not exist in the model`);
		this.state[key].listeners.add(listener);
		return () => {
			this.state[key].listeners.delete(listener);
		}
	}

	sync(key) {
		if (this.state[key] === undefined) throw new Error(`Invalid Key: ${key}. Key does not exist in the model`);
		useSyncExternalStore((listener) => this.subscribe(key, listener), () => this.object[key]); // eslint-disable-line
	}

	getHook() {
		return () => {
			return this.object;
		}
	}

	determineDependencies(callback) {
		const keys = [];

		// clone our object to track property access
		const testObject = {...this.object};

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

		return keys;
	}

}

export function createModel(initialObject, options) {
	return new Model(initialObject, options);
}
